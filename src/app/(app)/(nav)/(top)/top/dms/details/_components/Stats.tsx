import StatCard from "~/components/data/StatCard";
import { useTranslation } from "~/i18n/client";
import { formatNumber } from "~/utils/format";

export default function Stats({
  messagesCount,
  topChatHour,
  reactionsCount,
  calls,
}: {
  messagesCount: string;
  topChatHour: string;
  reactionsCount: string;
  /** A group's calls, which a DM's page doesn't show. */
  calls?: { count: number; time: string };
}) {
  const { t } = useTranslation();

  const data = [
    {
      value: messagesCount,
      label: t("stats.totalMessagesSent"),
    },
    {
      value: topChatHour,
      label: t("stats.topChatHour"),
    },
    {
      value: reactionsCount,
      label: t("stats.reactionsAdded"),
    },
    ...(calls
      ? [
          {
            value: formatNumber(calls.count, { notation: "standard" }),
            label: t("stats.calls", { count: calls.count }),
          },
          { value: calls.time, label: t("stats.timeInCalls") },
        ]
      : []),
  ];

  return (
    <div className="desktop-container grid grid-cols-2 gap-2 px-2 py-4 sm:py-8">
      {data.map((stat, i) => (
        <StatCard key={i} {...stat} />
      ))}
    </div>
  );
}
