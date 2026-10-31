"use client";

// https://heroicons.com/

import {
  ArrowLeftOnRectangleIcon,
  BanknotesIcon,
  ClockIcon,
  UsersIcon,
  ChatBubbleBottomCenterTextIcon,
  CursorArrowRippleIcon,
} from "@heroicons/react/24/solid";
import DetailCard from "~/components/data/DetailCard";
import StatCard from "~/components/data/StatCard";
import useUsageStatsData from "~/hooks/data/use-usage-stats-data";
import { useTranslation } from "~/i18n/client";
import { useSelectedPackage } from "~/stores";
import type { Icon } from "~/types";
import { formatMoney, formatNumber, formatDuration } from "~/utils/format";

const minutesToMs = (minutes: number | null) =>
  minutes === null ? null : minutes * 60_000;

export default function Stats() {
  const {
    networkSize,
    servers,
    spentMoney,
    appStarted,
    avgAppStartedPerDay,
    messageCount,
    avgMessageCountPerDay,
    avgSessionDuration,
    totalSessionDuration,
  } = useUsageStatsData();
  const { t } = useTranslation();
  const { package_is_partial } = useSelectedPackage();
  const { count: serverCount, joinedInRange } = servers();

  const data: {
    value: string;
    title: string;
    description: string;
    icon: Icon;
  }[] = [
    {
      value: formatNumber(messageCount(), { notation: "standard" }),
      title: t("stats.messagesSent"),
      description: t("stats.messagesSentPerDay", {
        value: avgMessageCountPerDay(),
      }),
      icon: ChatBubbleBottomCenterTextIcon,
    },
    package_is_partial
      ? null
      : {
          value: formatNumber(serverCount),
          title: t(joinedInRange ? "stats.newServers" : "stats.joinedServers"),
          description: t("stats.joinedServersDesc"),
          icon: ArrowLeftOnRectangleIcon,
        },
    {
      value: formatNumber(networkSize()),
      title: t("stats.knownUsers"),
      description: t("stats.knownUsersDesc"),
      icon: UsersIcon,
    },
    {
      value: formatMoney(spentMoney() || 0),
      title: t("stats.spentMoney"),
      description: t("stats.spentMoneyDesc", {
        context: (spentMoney() || 0) > 0 ? "positive" : "empty",
      }),
      icon: BanknotesIcon,
    },
    package_is_partial
      ? null
      : {
          // A full package has every app opening, so none in the range is 0.
          value: formatNumber(appStarted() ?? 0, { notation: "standard" }),
          title: t("stats.appStarts"),
          description: t("stats.appStartsPerDay", {
            value: formatNumber(avgAppStartedPerDay() ?? 0),
          }),
          icon: CursorArrowRippleIcon,
        },
    package_is_partial
      ? null
      : {
          value: formatDuration(minutesToMs(avgSessionDuration())),
          title: t("stats.avgSessionTime"),
          description: t("stats.totalTimeSpent", {
            value: formatDuration(minutesToMs(totalSessionDuration()), true),
          }),
          icon: ClockIcon,
        },
  ].filter((stat) => stat !== null) as any;

  return (
    <div className="desktop-container grid grid-cols-1 gap-2 px-2 py-4 sm:grid-cols-2 sm:py-8 md:grid-cols-3">
      {data.map(({ value, title, description, icon: Icon }) => (
        <DetailCard
          key={title}
          leftSlot={<Icon className="h-8 w-8 text-gray-500" />}
          title={
            <>
              <span className="text-brand-300">{value}</span> {title}
            </>
          }
          description={description}
        />
      ))}
    </div>
  );
}
