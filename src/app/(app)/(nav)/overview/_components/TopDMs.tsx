"use client";

import { useNetworkState } from "react-use";
import ScrollArea from "~/components/ScrollArea";
import Section from "~/components/Section";
import AvatarCard from "~/components/data/AvatarCard";
import useTopConversationsData, {
  type DMConversation,
  type GroupConversation,
} from "~/hooks/data/use-top-conversations-data";
import useUserDetails from "~/hooks/use-user-details";
import { avatarURLFallback, groupName } from "~/utils/discord";
import { formatNumber } from "~/utils/format";
import { useTranslation } from "~/i18n/client";
import DiscordImage from "~/components/DiscordImage";
import GroupDMIcon from "~/components/GroupDMIcon";

function DMCard({ dm, size }: { dm: DMConversation; size: number }) {
  const { t } = useTranslation();
  const data = useUserDetails({ userID: dm.dm_user_id });

  const username = dm.user_name;
  const displayName = data?.display_name || username;
  const avatarURL = data?.avatar_url || dm.user_avatar_url;

  const id = `dm-${dm.dm_user_id}`;

  return (
    <AvatarCard
      id={id}
      name={displayName}
      messages={dm.message_count}
      rank={dm.rank}
      href={{
        pathname: "/top/dms/details",
        query: {
          id: dm.dm_user_id,
          redirect: `/overview#${id}`,
        },
      }}
      image={
        <div className="relative aspect-square w-full">
          <DiscordImage
            src={avatarURLFallback(avatarURL, dm.dm_user_id) + `?size=${size}`}
            alt={t("avatar", { name: username })}
            fill
            className="rounded-full object-cover object-center"
          />
        </div>
      }
    />
  );
}

function GroupCard({ group }: { group: GroupConversation }) {
  const { t } = useTranslation();

  const id = `group-${group.channel_id}`;

  return (
    <AvatarCard
      id={id}
      name={groupName(group, t)}
      messages={group.message_count}
      rank={group.rank}
      href={{
        pathname: "/top/dms/details",
        query: {
          id: group.key,
          redirect: `/overview#${id}`,
        },
      }}
      image={<GroupDMIcon channelID={group.channel_id} className="w-full" />}
      detail={t("groupDM.memberCount", {
        count: group.member_count,
        value: formatNumber(group.member_count),
      })}
    />
  );
}

export default function TopDMs() {
  const { t } = useTranslation();

  const data = useTopConversationsData().getData({});
  const networkState = useNetworkState();

  const size = (() => {
    switch (networkState.effectiveType) {
      case "slow-2g":
      case "2g":
        return 512;

      case "3g":
      case "4g":
      default:
        return 2048;
    }
  })();

  return (
    <Section title={t("mostActiveDMs")} href="/top/dms">
      <ScrollArea orientation="horizontal">
        <div className="flex">
          {(data || []).map((row) =>
            row.kind === "group" ? (
              <GroupCard key={row.rank} group={row} />
            ) : (
              <DMCard key={row.rank} dm={row} size={size} />
            ),
          )}
          <ScrollArea.Spacer />
        </div>
      </ScrollArea>
    </Section>
  );
}
