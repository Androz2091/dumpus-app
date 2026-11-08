import { UserGroupIcon } from "@heroicons/react/24/solid";
import clsx from "clsx";
import { iconColor } from "~/utils/discord";

/** A group DM's picture: the export has no icon for a group. */
export default function GroupDMIcon({
  channelID,
  className,
}: {
  channelID: string;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex aspect-square shrink-0 items-center justify-center rounded-full text-gray-950",
        className,
      )}
      style={{ backgroundColor: iconColor(channelID) }}
    >
      <UserGroupIcon className="w-3/5" />
    </div>
  );
}
