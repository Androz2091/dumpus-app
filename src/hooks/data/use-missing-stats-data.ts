"use client";

import { messagesPerDayHour } from "./_hours";
import { useDataSources } from "./_shared";

const DAY_SECONDS = 86_400;

type MissingPeriod = { from: string; to: string; days: number };

const isoDay = (seconds: number) =>
  new Date(seconds * 1000).toISOString().slice(0, 10);

/**
 * The periods of the range with messages but no activity at all, which the
 * stats from the activity leave out. The message files hold every message
 * whatever Discord recorded, so a day with messages was a day on Discord; a
 * day without either could be a day off Discord, so it never counts, and
 * lies inside a period only when no activity separates the days around it.
 */
export default function useMissingStatsData() {
  const { sql, start, end } = useDataSources();

  // The sending times chart's query, which both pages showing this run.
  const messages = messagesPerDayHour(sql, start, end);
  // Every event but messages comes from the activity stream. Two ranges
  // rather than `<>`, so the index skips the messages.
  const events = sql.rows<{ day: string }>`
    SELECT DISTINCT day
    FROM activity
    WHERE (event_name < 'message_sent' OR event_name > 'message_sent')
    AND day BETWEEN '${start}' AND '${end}';
  `;
  if (messages === null || events.hasError) return null;

  const recorded = new Set(events.data.map(({ day }) => day));
  const sent = new Set(messages.map(({ day }) => day));
  const unrecorded = [...sent].filter((day) => !recorded.has(day)).sort();
  if (unrecorded.length === 0) return { periods: [], days: 0 };

  // Sessions record a day too, read only around the days left, which most
  // packages have few of. A session lasts a day at most, so the days it
  // starts and ends on are all it covers. The dates are Unix seconds as text,
  // which compare as numbers at 10 digits.
  const from = Date.parse(`${unrecorded[0]}T00:00:00Z`) / 1000;
  const to =
    Date.parse(`${unrecorded[unrecorded.length - 1]}T00:00:00Z`) / 1000 +
    DAY_SECONDS;
  const overlap = `started_date >= '${from - DAY_SECONDS}' AND started_date < '${to}' AND ended_date >= '${from}'`;
  const sessions = sql.rows<{ n: number }>`
    SELECT CAST(started_date AS INTEGER) / ${DAY_SECONDS} AS n FROM sessions WHERE ${overlap}
    UNION SELECT CAST(ended_date AS INTEGER) / ${DAY_SECONDS} FROM sessions WHERE ${overlap}
    UNION SELECT CAST(started_date AS INTEGER) / ${DAY_SECONDS} FROM voice_sessions WHERE ${overlap}
    UNION SELECT CAST(ended_date AS INTEGER) / ${DAY_SECONDS} FROM voice_sessions WHERE ${overlap};
  `;
  if (sessions.hasError) return null;
  for (const { n } of sessions.data) recorded.add(isoDay(n * DAY_SECONDS));

  const periods: MissingPeriod[] = [];
  let current: MissingPeriod | null = null;
  for (let at = from; at < to; at += DAY_SECONDS) {
    const day = isoDay(at);
    if (recorded.has(day)) {
      current = null;
    } else if (sent.has(day)) {
      if (current) {
        current.to = day;
        current.days++;
      } else {
        current = { from: day, to: day, days: 1 };
        periods.push(current);
      }
    }
  }

  return {
    periods,
    days: periods.reduce((sum, { days }) => sum + days, 0),
  };
}
