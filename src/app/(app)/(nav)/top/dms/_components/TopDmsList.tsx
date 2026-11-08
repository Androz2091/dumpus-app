"use client";

import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { useInfiniteQuery } from "@tanstack/react-query";
import NoDataAvailable from "~/components/NoDataAvailable";
import DetailCard from "~/components/data/DetailCard";
import useTopConversationsData, {
  type DMConversation,
  type GroupConversation,
} from "~/hooks/data/use-top-conversations-data";
import useUserDetails from "~/hooks/use-user-details";
import { useAppStore } from "~/stores";
import { avatarURLFallback, groupName } from "~/utils/discord";
import { formatNumber } from "~/utils/format";
import LoadMore from "../../_components/LoadMore";
import DiscordImage from "~/components/DiscordImage";
import GroupDMIcon from "~/components/GroupDMIcon";
import { useTranslation } from "~/i18n/client";

function DMCard({ dm }: { dm: DMConversation }) {
  const { t } = useTranslation();
  const data = useUserDetails({ userID: dm.dm_user_id });

  const username = dm.user_name;
  const displayName = data?.display_name || username;
  const avatarURL = data?.avatar_url || dm.user_avatar_url;

  const id = `dm-${dm.dm_user_id}`;

  return (
    <DetailCard.WithRank
      id={id}
      href={{
        pathname: "/top/dms/details",
        query: {
          id: dm.dm_user_id,
          redirect: `/top/dms#${id}`,
        },
      }}
      rank={dm.rank}
      title={displayName}
      description={`${formatNumber(dm.message_count)} ${t(
        "stats.messagesSent",
      )}`}
      leftSlot={
        <div className="relative aspect-square w-10">
          <DiscordImage
            src={avatarURLFallback(avatarURL, dm.dm_user_id)}
            alt={t("avatar", { name: username })}
            fill
            className="rounded-full object-cover object-center"
          />
        </div>
      }
      rightIcon={ChevronRightIcon}
    />
  );
}

function GroupCard({ group }: { group: GroupConversation }) {
  const { t } = useTranslation();

  const id = `group-${group.channel_id}`;

  return (
    <DetailCard.WithRank
      id={id}
      href={{
        pathname: "/top/dms/details",
        query: {
          id: group.key,
          redirect: `/top/dms#${id}`,
        },
      }}
      rank={group.rank}
      title={groupName(group, t)}
      // Shorter than a DM's "messages sent", to fit the member count at 375px.
      // A group whose export lists no recipients has no count to give.
      description={[
        t("stats.messages", { value: formatNumber(group.message_count) }),
        group.member_count > 0 &&
          t("groupDM.memberCount", {
            count: group.member_count,
            value: formatNumber(group.member_count),
          }),
      ]
        .filter(Boolean)
        .join(" · ")}
      leftSlot={<GroupDMIcon channelID={group.channel_id} className="w-10" />}
      rightIcon={ChevronRightIcon}
    />
  );
}

export default function TopDMsList() {
  const { getData, count } = useTopConversationsData();

  const timeRange = useAppStore(({ config }) => config.timeRange);
  const selectedID = useAppStore(({ config }) => config.selectedID);

  const { data: queryData, fetchNextPage } = useInfiniteQuery({
    queryKey: ["top-dms", selectedID, timeRange],
    queryFn: ({ pageParam }) => getData({ offset: pageParam })!,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => pages.length,
  });

  if (!count) return <NoDataAvailable />;

  const data = queryData?.pages.flat() || getData({})!;

  return (
    <div className="desktop-container px-2 py-4 sm:py-8">
      <div className="grid gap-2 sm:grid-cols-2">
        {data.map((row) =>
          row.kind === "group" ? (
            <GroupCard key={row.rank} group={row} />
          ) : (
            <DMCard key={row.rank} dm={row} />
          ),
        )}
      </div>
      {data.length < count && <LoadMore loadMore={fetchNextPage} />}
    </div>
  );
}
