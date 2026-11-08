"use client";

import { ChevronRightIcon } from "@heroicons/react/24/solid";
import DiscordImage from "~/components/DiscordImage";
import GroupDMIcon from "~/components/GroupDMIcon";
import Section from "~/components/Section";
import DetailCard from "~/components/data/DetailCard";
import { useShareFormat } from "~/components/share/format";
import useTopCallsData, {
  type DMCall,
  type GroupCall,
} from "~/hooks/data/use-top-calls-data";
import useUserDetails from "~/hooks/use-user-details";
import { useTranslation } from "~/i18n/client";
import { useSelectedPackage } from "~/stores";
import { avatarURLFallback, groupName } from "~/utils/discord";

function CallCard({ call }: { call: DMCall }) {
  const { t, duration, number } = useShareFormat();
  const data = useUserDetails({ userID: call.dm_user_id });

  const username = call.user_name;
  const displayName = data?.display_name || username;
  const avatarURL = data?.avatar_url || call.user_avatar_url;

  const id = `call-${call.dm_user_id}`;

  return (
    <DetailCard.WithRank
      id={id}
      href={{
        pathname: "/top/dms/details",
        query: {
          id: call.dm_user_id,
          redirect: `/stats#${id}`,
        },
      }}
      rank={call.rank}
      title={displayName}
      description={t("stats.callTime", {
        count: call.call_count,
        value: number(call.call_count),
        duration: duration(call.call_minutes),
      })}
      leftSlot={
        <div className="relative aspect-square w-10">
          <DiscordImage
            src={avatarURLFallback(avatarURL, call.dm_user_id)}
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

function GroupCallCard({ call }: { call: GroupCall }) {
  const { t, duration, number } = useShareFormat();

  const id = `call-group-${call.channel_id}`;

  return (
    <DetailCard.WithRank
      id={id}
      href={{
        pathname: "/top/dms/details",
        query: {
          id: call.key,
          redirect: `/stats#${id}`,
        },
      }}
      rank={call.rank}
      title={groupName(call, t)}
      description={t("stats.callTime", {
        count: call.call_count,
        value: number(call.call_count),
        duration: duration(call.call_minutes),
      })}
      leftSlot={<GroupDMIcon channelID={call.channel_id} className="w-10" />}
      rightIcon={ChevronRightIcon}
    />
  );
}

export default function TopCalls() {
  const { t } = useTranslation();
  const { package_is_partial } = useSelectedPackage();
  const calls = useTopCallsData();

  // Calls come from the activity stream, which a partial package may lack:
  // hidden like the other stats from it, rather than shown as none.
  if (package_is_partial || calls === null) return null;

  return (
    <Section title={t("mostCalled")} id="most-called">
      {calls.length > 0 ? (
        <div className="grid gap-2 px-2 sm:grid-cols-2">
          {calls.map((call) =>
            call.kind === "group" ? (
              <GroupCallCard key={call.key} call={call} />
            ) : (
              <CallCard key={call.dm_user_id} call={call} />
            ),
          )}
        </div>
      ) : (
        <p className="px-2 text-gray-400 sm:text-lg">{t("stats.noCalls")}</p>
      )}
    </Section>
  );
}
