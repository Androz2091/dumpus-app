import CRC32 from "crc-32";
import type { TFunction } from "i18next";
import type { Range } from "~/types";
import type { GroupDmChannelsData } from "~/types/sql";
import { tailwindColors } from ".";
import { formatNumber } from "./format";

/** A DM with a deleted account has no user id, see `DM_KEY`. */
export function isUserID(id: string) {
  return /^\d+$/.test(id);
}

/**
 * A group DM's size with you in it, as Discord counts, since `member_count`
 * leaves you out; a group you've left counts you too. Null when its export
 * lists nobody.
 */
export function groupSize(memberCount: number) {
  return memberCount > 0 ? memberCount + 1 : null;
}

/**
 * A group DM's name: its own, else the names of its other members, as in
 * "Alex, Sam and 3 others", else its size, as in "Group of 5". `names` are the
 * members' that have one, from `groupMemberNames`.
 */
export function groupName(
  group: Pick<GroupDmChannelsData, "channel_name" | "member_count"> & {
    names: string[];
  },
  t: TFunction,
) {
  const { channel_name, member_count, names } = group;
  if (channel_name) return channel_name;
  if (names.length === 0) {
    const size = groupSize(member_count);
    return size
      ? t("groupDM.groupOf", { value: formatNumber(size) })
      : t("groupDM.group");
  }

  // Up to three names when that's everyone, rather than "and 1 other".
  const shown =
    names.length === member_count && names.length <= 3
      ? names
      : names.slice(0, 2);
  const others = member_count - shown.length;
  if (others > 0) {
    return t("groupDM.others", {
      names: shown.join(", "),
      count: others,
      value: formatNumber(others),
    });
  }
  return shown.length === 1
    ? shown[0]
    : t("groupDM.and", {
        first: shown.slice(0, -1).join(", "),
        last: shown[shown.length - 1],
      });
}

const fallbackAvatarURLsMap = new Map<string, string>();

export function avatarURLFallback(url: string | undefined, id: string) {
  if (url) return url;

  let storedFallback = fallbackAvatarURLsMap.get(id);
  if (storedFallback) return storedFallback;

  function getNumber(str: string): Range<0, 6> {
    const hash = CRC32.str(str);
    return (Math.abs(hash) % 6) as any; // Modulo 6 to get a number between 0-5
  }
  const template = (n: number) =>
    `https://cdn.discordapp.com/embed/avatars/${n}.png`;

  storedFallback = template(getNumber(id));
  fallbackAvatarURLsMap.set(id, storedFallback);

  return storedFallback;
}

const iconsColorsMap = new Map<string, string>();

export function iconColor(id: string) {
  let storedColor = iconsColorsMap.get(id);
  if (storedColor) return storedColor;

  function getNumber(str: string): Range<0, 17> {
    const hash = CRC32.str(str);
    return (Math.abs(hash) % 17) as any; // Modulo 17 to get a number between 0-16
  }

  const shades300 = tailwindColors.map((color) => color[300]);

  storedColor = shades300[getNumber(id)];
  iconsColorsMap.set(id, storedColor);

  return storedColor;
}
