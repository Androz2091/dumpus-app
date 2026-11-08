"use client";

import DiscordImage from "~/components/DiscordImage";
import Section from "~/components/Section";
import DetailCard from "~/components/data/DetailCard";
import type useGroupDMData from "~/hooks/data/use-group-dm-data";
import useUserDetails from "~/hooks/use-user-details";
import { useTranslation } from "~/i18n/client";
import { avatarURLFallback } from "~/utils/discord";

type Member = NonNullable<ReturnType<typeof useGroupDMData>>["members"][number];

function MemberCard({ member }: { member: Member }) {
  const { t } = useTranslation();
  // An empty id looks nobody up.
  const data = useUserDetails({ userID: member.lookUp ? member.user_id : "" });

  const username = member.user_name || data?.username;
  const displayName =
    member.display_name ||
    data?.display_name ||
    username ||
    t("groupDM.unknownMember");
  const avatarURL = member.user_avatar_url || data?.avatar_url;

  return (
    <DetailCard
      title={displayName}
      // The username only when the title isn't it already, and the id for a
      // member nobody could name.
      description={username === displayName ? "" : (username ?? member.user_id)}
      leftSlot={
        <div className="relative aspect-square w-10">
          <DiscordImage
            src={avatarURLFallback(avatarURL, member.user_id)}
            alt={t("avatar", { name: displayName })}
            fill
            className="rounded-full object-cover object-center"
          />
        </div>
      }
    />
  );
}

export default function Members({ members }: { members: Member[] }) {
  const { t } = useTranslation();

  if (members.length === 0) return null;

  return (
    <Section title={t("groupDM.members")}>
      <div className="grid gap-2 px-2 sm:grid-cols-2">
        {members.map((member) => (
          <MemberCard key={member.user_id} member={member} />
        ))}
      </div>
    </Section>
  );
}
