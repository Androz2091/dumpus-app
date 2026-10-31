"use client";

import { groupDays } from "./_chart";
import { useDataSources } from "./_shared";

const DAY_SECONDS = 86_400;

/**
 * Minutes on Discord over the range, in the periods of the messages chart. A
 * session counts on the day it started.
 */
export default function useTimeOnDiscordData() {
  const { sql, start, end } = useDataSources();
  // The last day counts whole, as it does for the activity's days. The dates
  // are Unix seconds stored as text, which compare as numbers at 10 digits.
  const from = Date.parse(`${start}T00:00:00Z`) / 1000;
  const to = Date.parse(`${end}T00:00:00Z`) / 1000 + DAY_SECONDS;

  const { data, hasError } = sql.rows<{ day: string; count: number }>`
    SELECT date(started_date, 'unixepoch') AS day, SUM(duration_mins) AS count
    FROM sessions
    WHERE started_date >= '${from}' AND started_date < '${to}'
    GROUP BY day;
  `;

  if (hasError) {
    return null;
  }

  return groupDays(start, end, data);
}
