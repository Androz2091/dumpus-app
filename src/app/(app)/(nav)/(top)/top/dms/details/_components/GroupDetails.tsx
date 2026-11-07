"use client";

import GroupDMIcon from "~/components/GroupDMIcon";
import NoDataAvailable from "~/components/NoDataAvailable";
import NotFoundState from "~/components/NotFoundState";
import ProfileHeader from "~/components/ProfileHeader";
import { SimpleIconsDiscord } from "~/components/icons";
import Header from "~/components/layout/Header";
import { useShareFormat } from "~/components/share/format";
import useGroupDMData from "~/hooks/data/use-group-dm-data";
import { useSelectedPackage } from "~/stores";
import { groupName } from "~/utils/discord";
import { formatDate, formatHour, formatNumber } from "~/utils/format";
import DailySentMessages from "./DailySentMessages";
import Members from "./Members";
import PageHeader from "./PageHeader";
import Stats from "./Stats";

export function groupDiscordLink(channelID: string) {
  return `https://discord.com/channels/@me/${channelID}`;
}

export default function GroupDetails({ groupKey }: { groupKey: string }) {
  const { t, duration } = useShareFormat();
  const { package_is_partial } = useSelectedPackage();
  const data = useGroupDMData({ groupKey });

  if (!data) return <NotFoundState />;

  const { hasData, group, members, stats, dailySentMessages } = data;
  const name = groupName(group, t);
  const discordLink = groupDiscordLink(group.channel_id);

  return (
    <>
      <PageHeader title={name} discordLink={discordLink} />
      <ProfileHeader
        description={t("groupDM.memberCount", {
          count: group.member_count,
          value: formatNumber(group.member_count, { notation: "standard" }),
        })}
        title={name}
        imageSlot={
          <GroupDMIcon
            channelID={group.channel_id}
            className="h-16 w-16 sm:h-32 sm:w-32"
          />
        }
      >
        <Header.Icon
          href={discordLink}
          target="_blank"
          icon={SimpleIconsDiscord}
          className="absolute top-4 right-2 hidden sm:block"
        />
      </ProfileHeader>
      {hasData ? (
        <>
          <Stats
            messagesCount={formatNumber(stats.messagesCount, {
              notation: "standard",
            })}
            topChatHour={formatHour(stats.topChatHour)}
            reactionsCount={formatNumber(stats.reactionsCount, {
              notation: "standard",
            })}
            // Calls come from the activity stream, which a partial package
            // may lack: left out like the other stats from it.
            calls={
              package_is_partial
                ? undefined
                : {
                    count: stats.callCount,
                    time: duration(stats.callMinutes),
                  }
            }
          />
          <DailySentMessages
            data={dailySentMessages.map(({ value, label }) => ({
              value,
              label: formatDate(label, {
                year: "2-digit",
                day: false,
                hour: false,
                minute: false,
              }),
            }))}
          />
        </>
      ) : (
        <NoDataAvailable />
      )}
      <Members members={members} />
    </>
  );
}
