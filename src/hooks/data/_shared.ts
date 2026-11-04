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
