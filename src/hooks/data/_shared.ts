"use client";

import { SQL_DEFAULT_LIMIT } from "~/constants";
import useSQL from "../use-sql";
import { useAppStore } from "~/stores";
import { useShallow } from "zustand/react/shallow";

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
