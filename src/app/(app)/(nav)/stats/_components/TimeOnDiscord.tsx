"use client";

import { useState } from "react";
import Section from "~/components/Section";
import Tabs from "~/components/Tabs";
import SimpleLineChart from "~/components/data/SimpleLineChart";
import useTimeOnDiscordData from "~/hooks/data/use-time-on-discord-data";
import { useTranslation } from "~/i18n/client";
import { useSelectedPackage } from "~/stores";
import { formatDate } from "~/utils/format";

function runningTotal(points: { label: string; value: number }[]) {
  let total = 0;
  return points.map(({ label, value }) => ({ label, value: (total += value) }));
}

export default function TimeOnDiscord() {
  const { t } = useTranslation();
  const [view, setView] = useState<"period" | "cumulative">("period");
  const { package_is_partial } = useSelectedPackage();
  const rawData = useTimeOnDiscordData();

  if (package_is_partial) return null;

  const data = (rawData || []).map(({ value, label }) => ({
    value,
    label: formatDate(label, {
      year: "2-digit",
      day: false,
      hour: false,
      minute: false,
    }),
  }));

  return (
    <Section
      title={t("minutesOnDiscord")}
      id="time-on-discord"
      action={
        <Tabs
          items={[
            { value: "period", label: t("graphViews.period") },
            { value: "cumulative", label: t("graphViews.cumulative") },
          ]}
          value={view}
          onChange={setView}
          className="ml-2 shrink-0 space-x-1"
          itemClassName="px-3 text-sm sm:px-4 sm:text-base"
        />
      }
    >
      <SimpleLineChart
        data={view === "period" ? data : runningTotal(data)}
        className="px-2"
        legend={t("minuteCount")}
        showSmallDots={view === "cumulative"}
      />
    </Section>
  );
}
