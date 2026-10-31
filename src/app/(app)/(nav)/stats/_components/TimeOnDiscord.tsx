"use client";

import Section from "~/components/Section";
import SimpleLineChart from "~/components/data/SimpleLineChart";
import useTimeOnDiscordData from "~/hooks/data/use-time-on-discord-data";
import { useTranslation } from "~/i18n/client";
import { useSelectedPackage } from "~/stores";
import { formatDate } from "~/utils/format";

export default function TimeOnDiscord() {
  const { t } = useTranslation();
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
    <Section title={t("minutesOnDiscord")} id="time-on-discord">
      <SimpleLineChart data={data} className="px-2" legend={t("minuteCount")} />
    </Section>
  );
}
