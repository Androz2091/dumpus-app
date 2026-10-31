"use client";

import { localHours, messagesPerDayHour, messageTotals } from "./_hours";
import { avgAppOpensPerDay, useDataSources } from "./_shared";

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
    return avgAppOpensPerDay(sql, start, end);
  }

  return {
    chartData: getChartData(),
    statsData: {
      avgMessagesSentPerDay: getAvgMessagesSentPerDay(),
      avgOpeningCountPerDay: getAvgOpeningCountPerDay(),
    },
  };
}
