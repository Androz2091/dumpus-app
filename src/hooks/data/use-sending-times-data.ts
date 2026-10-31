"use client";

import { localHours, messagesPerDayHour, messageTotals } from "./_hours";
import { useDataSources } from "./_shared";

export default function useSendingTimesData() {
  const { sql, start, end } = useDataSources();

  /** Messages per hour of the day, on the device's clock. */
  function getChartData() {
    const rows = messagesPerDayHour(sql, start, end);

    if (!rows) {
      return null;
    }

    return localHours(rows).map((value, hour) => ({
      label: hour,
      value,
    }));
  }

  function getAvgMessagesSentPerDay() {
    return messageTotals(messagesPerDayHour(sql, start, end))?.perDay ?? null;
  }

  function getAvgOpeningCountPerDay() {
    const { data, hasError } = sql<{ average_daily_occurences: number }>`
      SELECT ROUND(AVG(total_occurence)) as average_daily_occurences
      FROM (
        SELECT day, SUM(occurence_count) as total_occurence 
        FROM activity
        WHERE event_name = 'app_opened'
        GROUP BY day
      ) daily_counts; 
    `;

    return hasError ? null : data[0].average_daily_occurences;
  }

  return {
    chartData: getChartData(),
    statsData: {
      avgMessagesSentPerDay: getAvgMessagesSentPerDay(),
      avgOpeningCountPerDay: getAvgOpeningCountPerDay(),
    },
  };
}
