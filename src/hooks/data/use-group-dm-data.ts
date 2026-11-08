"use client";

import type { GroupDmChannelsData, GroupDmMember } from "~/types/sql";
import { countsGroupDMs, countsReactions } from "./_availability";
import { groupDays } from "./_chart";
import { topLocalHour, type DayHourCount } from "./_hours";
import {
  MEMBER_ORDER,
  groupChannelID,
  groupMemberNames,
  rangeSeconds,
  useDataSources,
} from "./_shared";

// Each lookup is a call to Discord through the API.
const MAX_LOOKUPS = 10;

/**
 * A group DM's page, by its `GROUP_KEY`. Null for a key that isn't a group's,
 * and on a database from before 0.4.0, which has no groups.
 */
export default function useGroupDMData({ groupKey }: { groupKey: string }) {
  const { sql, start, end } = useDataSources();
  // Nothing is read before the version says the tables are there.
  const channelID = countsGroupDMs(sql) ? groupChannelID(groupKey) : null;
  if (!channelID) return null;

  const found = sql<
    Pick<GroupDmChannelsData, "channel_id" | "channel_name" | "member_count">
  >`
    SELECT channel_id, channel_name, member_count
    FROM group_dm_channels_data
    WHERE channel_id = '${channelID}'
    LIMIT 1;
  `;
  if (found.hasError) return null;

  const group = {
    ...found.data[0],
    key: groupKey,
    names: groupMemberNames(sql, [channelID]).get(channelID) ?? [],
  };

  const memberRows = sql.rows<Omit<GroupDmMember, "channel_id">>`
    SELECT m.user_id, m.user_name, m.display_name, m.user_avatar_url
    FROM group_dm_members m
    WHERE m.channel_id = '${channelID}'
    ORDER BY ${MEMBER_ORDER};
  `.data;
  // Only a member shown without a name is looked up.
  let lookups = 0;
  const members = (memberRows ?? []).map((member) => {
    const lookUp =
      member.display_name === null &&
      member.user_name === null &&
      lookups < MAX_LOOKUPS;
    if (lookUp) lookups++;
    return { ...member, lookUp };
  });

  // The chart and the message count both read these rows.
  const days =
    sql.rows<{ day: string; count: number }>`
      SELECT day, SUM(occurence_count) AS count
      FROM activity
      WHERE event_name = 'message_sent'
      AND associated_channel_id = '${channelID}'
      AND day BETWEEN '${start}' AND '${end}'
      GROUP BY day;
    `.data ?? [];

  const { from, to } = rangeSeconds(start, end);
  const calls = sql<{ call_count: number; call_minutes: number }>`
    SELECT COUNT(*) AS call_count, IFNULL(SUM(duration_mins), 0) AS call_minutes
    FROM voice_sessions
    WHERE channel_id = '${channelID}'
    AND started_date >= '${from}' AND started_date < '${to}';
  `.data?.[0] ?? { call_count: 0, call_minutes: 0 };

  // On the device's clock, see `localHours`.
  const hours = sql<DayHourCount>`
    SELECT day, hour, SUM(occurence_count) AS count
    FROM activity
    WHERE event_name = 'message_sent'
    AND associated_channel_id = '${channelID}'
    AND day BETWEEN '${start}' AND '${end}'
    GROUP BY day, hour;
  `.data;

  // Null when the database can't tell, see `countsReactions`.
  const reactions = sql<{ reaction_count: number | null }>`
    SELECT SUM(occurence_count) AS reaction_count
    FROM activity
    WHERE event_name = 'add_reaction'
    AND associated_channel_id = '${channelID}'
    AND day BETWEEN '${start}' AND '${end}';
  `.data?.[0].reaction_count;

  return {
    // A group opened from top calls may have calls and no message in the
    // range.
    hasData: days.length > 0 || calls.call_count > 0,
    group,
    members,
    stats: {
      messagesCount: days.reduce((sum, { count }) => sum + count, 0),
      topChatHour: topLocalHour(hours),
      reactionsCount: reactions ?? (countsReactions(sql) ? 0 : null),
      callCount: calls.call_count,
      callMinutes: calls.call_minutes,
    },
    dailySentMessages: groupDays(start, end, days),
  };
}
