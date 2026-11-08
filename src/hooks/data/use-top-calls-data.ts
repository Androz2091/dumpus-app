"use client";

import type { DmChannelsData, GroupDmChannelsData } from "~/types/sql";
import { countsGroupDMs } from "./_availability";
import {
  DM_KEY,
  GROUP_KEY,
  groupMemberNames,
  isGroupKey,
  rangeSeconds,
  useDataSources,
} from "./_shared";

const TOP = 5;

// A DM's row or a group's, the other's columns null.
type Row = {
  key: string;
  user_name: string | null;
  user_avatar_url: string | null;
  channel_id: string;
  channel_name: string | null;
  member_count: number | null;
  call_count: number;
  call_minutes: number;
};

type Calls = { call_count: number; call_minutes: number; rank: number };

export type DMCall = Pick<
  DmChannelsData,
  "dm_user_id" | "user_name" | "user_avatar_url"
> &
  Calls & { kind: "dm" };

export type GroupCall = Pick<
  GroupDmChannelsData,
  "channel_id" | "channel_name" | "member_count"
> &
  Calls & {
    kind: "group";
    key: string;
    /** The members' names, for `groupName`. */
    names: string[];
  };

/**
 * A call is a voice session in a DM's channel or, from 0.4.0 on, a group
 * DM's. A group's calls count once, for the group: crediting each member
 * would count one call as many times as the group has members.
 */
export default function useTopCallsData() {
  const { sql, start, end } = useDataSources();
  const { from, to } = rangeSeconds(start, end);

  const dms = `
    SELECT
      ${DM_KEY} AS key,
      d.user_name,
      d.user_avatar_url,
      d.channel_id,
      NULL AS channel_name,
      NULL AS member_count,
      COUNT(*) AS call_count,
      SUM(v.duration_mins) AS call_minutes
    FROM voice_sessions v
    JOIN dm_channels_data d ON d.channel_id = v.channel_id
    WHERE v.started_date >= '${from}' AND v.started_date < '${to}'
    GROUP BY ${DM_KEY}`;
  const groupDMs = `
    SELECT
      ${GROUP_KEY} AS key,
      NULL AS user_name,
      NULL AS user_avatar_url,
      g.channel_id,
      g.channel_name,
      g.member_count,
      COUNT(*) AS call_count,
      SUM(v.duration_mins) AS call_minutes
    FROM voice_sessions v
    JOIN group_dm_channels_data g ON g.channel_id = v.channel_id
    WHERE v.started_date >= '${from}' AND v.started_date < '${to}'
    GROUP BY g.channel_id`;

  const { data } = sql.rows<Row>`
    SELECT *
    FROM (${countsGroupDMs(sql) ? `${dms} UNION ALL ${groupDMs}` : dms})
    ORDER BY call_minutes DESC, call_count DESC, key
    LIMIT ${TOP};
  `;
  if (!data) return null;

  const names = groupMemberNames(
    sql,
    data.filter(({ key }) => isGroupKey(key)).map((row) => row.channel_id),
  );

  return data.map((row, i): DMCall | GroupCall => {
    const { key, call_count, call_minutes } = row;
    const rank = i + 1;
    return isGroupKey(key)
      ? {
          kind: "group",
          key,
          channel_id: row.channel_id,
          channel_name: row.channel_name,
          member_count: row.member_count!,
          names: names.get(row.channel_id) ?? [],
          call_count,
          call_minutes,
          rank,
        }
      : {
          kind: "dm",
          dm_user_id: key,
          user_name: row.user_name!,
          user_avatar_url: row.user_avatar_url ?? undefined,
          call_count,
          call_minutes,
          rank,
        };
  });
}
