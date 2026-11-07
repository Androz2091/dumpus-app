"use client";

import { SQL_DEFAULT_LIMIT } from "~/constants";
import type { DmChannelsData, GroupDmChannelsData } from "~/types/sql";
import { countsGroupDMs } from "./_availability";
import {
  DM_KEY,
  GROUP_KEY,
  groupMemberNames,
  isGroupKey,
  sqlOffset,
  useDataSources,
} from "./_shared";

// A DM's row or a group's, the other's columns null.
type Row = {
  key: string;
  user_name: string | null;
  user_avatar_url: string | null;
  channel_id: string;
  channel_name: string | null;
  member_count: number | null;
  message_count: number;
  total?: number;
};

export type DMConversation = Pick<
  DmChannelsData,
  "dm_user_id" | "user_name" | "user_avatar_url" | "channel_id"
> & { kind: "dm"; message_count: number; rank: number };

export type GroupConversation = Pick<
  GroupDmChannelsData,
  "channel_id" | "channel_name" | "member_count"
> & {
  kind: "group";
  key: string;
  /** The members' names, for `groupName`. */
  names: string[];
  message_count: number;
  rank: number;
};

/**
 * Your DMs and, from 0.4.0 on, your group DMs, ranked together by your
 * messages in the range, for the DMs list and the overview. An older database
 * gets the DMs alone, as `useTopDMsData` ranks them, which the share cards
 * keep since its rows are always people.
 */
export default function useTopConversationsData() {
  const { sql, start, end } = useDataSources();
  const groups = countsGroupDMs(sql);

  const dms = `
    SELECT
      ${DM_KEY} AS key,
      d.user_name,
      d.user_avatar_url,
      d.channel_id,
      NULL AS channel_name,
      NULL AS member_count,
      SUM(a.occurence_count) AS message_count
    FROM activity a
    JOIN dm_channels_data d
      ON a.associated_channel_id = d.channel_id
    WHERE a.event_name = 'message_sent'
    AND a.day BETWEEN '${start}' AND '${end}'
    GROUP BY ${DM_KEY}`;
  const groupDMs = `
    SELECT
      ${GROUP_KEY} AS key,
      NULL AS user_name,
      NULL AS user_avatar_url,
      g.channel_id,
      g.channel_name,
      g.member_count,
      SUM(a.occurence_count) AS message_count
    FROM activity a
    JOIN group_dm_channels_data g
      ON a.associated_channel_id = g.channel_id
    WHERE a.event_name = 'message_sent'
    AND a.day BETWEEN '${start}' AND '${end}'
    GROUP BY g.channel_id`;

  /**
   * One page of the list. Ties go by key, so pages never overlap, and the
   * first page also counts the whole list.
   */
  function page(offset: number) {
    // Written out here, since the tag leaves out an offset of 0.
    const limit = `LIMIT ${SQL_DEFAULT_LIMIT} OFFSET ${sqlOffset(offset)}`;
    return sql.rows<Row>`
      SELECT *${offset === 0 ? ", COUNT(*) OVER () AS total" : ""}
      FROM (${groups ? `${dms} UNION ALL ${groupDMs}` : dms})
      ORDER BY message_count DESC, key
      ${limit};
    `;
  }

  function getData({ offset = 0 }: { offset?: number }) {
    const { data } = page(offset);

    if (!data?.length) {
      return null;
    }

    const names = groupMemberNames(
      sql,
      data.filter(({ key }) => isGroupKey(key)).map((row) => row.channel_id),
    );

    return data.map((row, i): DMConversation | GroupConversation => {
      const { key, channel_id, message_count } = row;
      const rank = sqlOffset(offset) + i + 1;
      return isGroupKey(key)
        ? {
            kind: "group",
            key,
            channel_id,
            channel_name: row.channel_name,
            member_count: row.member_count!,
            names: names.get(channel_id) ?? [],
            message_count,
            rank,
          }
        : {
            kind: "dm",
            dm_user_id: key,
            user_name: row.user_name!,
            user_avatar_url: row.user_avatar_url ?? undefined,
            channel_id,
            message_count,
            rank,
          };
    });
  }

  const { data: firstPage } = page(0);
  const count = firstPage ? (firstPage[0]?.total ?? 0) : null;

  return { getData, count };
}
