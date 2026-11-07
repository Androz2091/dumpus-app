"use client";

import { SQL_DEFAULT_LIMIT } from "~/constants";
import useSQL from "../use-sql";
import { useAppStore } from "~/stores";
import { useShallow } from "zustand/react/shallow";

// Discord's exports write a localized "Deleted User" where a deleted account's
// id goes, the same text in each of its DMs. A real id goes by itself, since it
// can have several channels; any other DM goes by its channel, or they would
// all add up as one person.
const CHANNEL_KEY = "channel:";

/** Who a row of `dm_channels_data`, as `d`, was with. */
export const DM_KEY = `CASE
  WHEN d.dm_user_id GLOB '[0-9]*' AND d.dm_user_id NOT GLOB '*[^0-9]*'
  THEN d.dm_user_id
  ELSE '${CHANNEL_KEY}' || d.channel_id
END`;

/** The condition for the rows of `dm_channels_data` of a `DM_KEY`. */
export function dmWhere(key: string) {
  return key.startsWith(CHANNEL_KEY)
    ? `channel_id = '${key.slice(CHANNEL_KEY.length)}'`
    : `dm_user_id = '${key}'`;
}

// A group goes by its channel under a prefix, never a bare number, which the
// app looks up and opens as a person (`isUserID`).
const GROUP_PREFIX = "group:";

/** Which group a row of `group_dm_channels_data`, as `g`, is. */
export const GROUP_KEY = `'${GROUP_PREFIX}' || g.channel_id`;

/** Whether a key of the DMs list is a group's, see `GROUP_KEY`. */
export function isGroupKey(key: string) {
  return key.startsWith(GROUP_PREFIX);
}

/**
 * The channel of a group's key, null unless it is digits: a key comes from a
 * link, and only an id goes into a query.
 */
export function groupChannelID(key: string) {
  const id = key.slice(GROUP_PREFIX.length);
  return isGroupKey(key) && /^\d+$/.test(id) ? id : null;
}

// A member's name, for a row of `group_dm_members` as `m`.
const MEMBER_NAME = "COALESCE(m.display_name, m.user_name)";

/**
 * The order of a group's members, as `m`: the members with a name first, by
 * name, as `groupName` lists them.
 */
export const MEMBER_ORDER = `${MEMBER_NAME} IS NULL, ${MEMBER_NAME} COLLATE NOCASE, m.user_id`;

/**
 * The names of the members of each group of `channelIDs`, for `groupName`. A
 * group whose members have no name has none.
 */
export function groupMemberNames(
  sql: ReturnType<typeof useSQL>,
  channelIDs: string[],
) {
  const names = new Map<string, string[]>();
  if (channelIDs.length === 0) return names;

  const { data } = sql.rows<{ channel_id: string; name: string }>`
    SELECT m.channel_id, ${MEMBER_NAME} AS name
    FROM group_dm_members m
    WHERE m.channel_id IN (${channelIDs.map((id) => `'${id}'`).join(", ")})
    AND ${MEMBER_NAME} IS NOT NULL
    ORDER BY ${MEMBER_ORDER};
  `;
  for (const { channel_id, name } of data ?? []) {
    names.set(channel_id, [...(names.get(channel_id) ?? []), name]);
  }
  return names;
}

const DAY_SECONDS = 86_400;

/**
 * The range in the Unix seconds `voice_sessions` stores as text, which compare
 * as numbers at 10 digits. The last day counts whole, as it does for the
 * activity's days.
 */
export function rangeSeconds(start: string, end: string) {
  return {
    from: Date.parse(`${start}T00:00:00Z`) / 1000,
    to: Date.parse(`${end}T00:00:00Z`) / 1000 + DAY_SECONDS,
  };
}

export function sqlOffset(offset: number) {
  return offset * SQL_DEFAULT_LIMIT;
}

export function avgAppOpensPerDay(
  sql: ReturnType<typeof useSQL>,
  start: string,
  end: string,
) {
  const { data, hasError } = sql<{ average_daily_occurences: number | null }>`
    SELECT ROUND(AVG(total_occurence)) as average_daily_occurences
    FROM (
      SELECT day, SUM(occurence_count) as total_occurence
      FROM activity
      WHERE event_name = 'app_opened'
      AND day BETWEEN '${start}' AND '${end}'
      GROUP BY day
    ) daily_counts;
  `;

  return hasError ? null : data[0].average_daily_occurences;
}

export function useDataSources() {
  const sql = useSQL();
  const [timeRange, db, getTimeRangeDates] = useAppStore(
    useShallow(({ config, database }) => [
      config.timeRange,
      database.db,
      database.getTimeRangeDates,
    ]),
  );

  return { sql, timeRange, ...getTimeRangeDates({ timeRange, db }) };
}
