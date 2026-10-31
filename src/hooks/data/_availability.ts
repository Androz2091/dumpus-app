"use client";

import type { PackageData } from "~/types/sql";
import type useSQL from "../use-sql";

// The event types Discord's `reporting` activity stream never carries.
const NOT_IN_REPORTING = new Set([
  "notification_clicked",
  "join_call",
  "message_edited",
  "slash_command_used",
  "application_command_used",
  "email_opened",
  "user_avatar_updated",
  "app_crashed",
  "app_native_crash",
  "voice_message_recorded",
  "premium_upsell_viewed",
  "remote_auth_login",
]);

/**
 * Whether the package's export says how often `eventName` happened. Some
 * exports only have the `reporting` activity stream, which never carries the
 * types above: the stats of those types are null ("not available") for them,
 * where no rows would otherwise mean 0. The processor writes the stream it read
 * to `package_data.activity_stream`; a database processed before has no such
 * column and reads as carrying every type.
 */
export function carriesEvent(
  sql: ReturnType<typeof useSQL>,
  eventName: string,
) {
  // `SELECT *`, since older databases have no `activity_stream`.
  const { data } = sql<PackageData>`SELECT * FROM package_data LIMIT 1;`;
  return !(
    data?.[0]?.activity_stream === "reporting" &&
    NOT_IN_REPORTING.has(eventName)
  );
}

/**
 * Whether the database counts `add_reaction`, so that no rows mean no
 * reaction was added: the export carries the type, see `carriesEvent`, and a
 * partial package may have been read without its activity.
 */
export function countsReactions(sql: ReturnType<typeof useSQL>) {
  const { data } = sql<PackageData>`SELECT * FROM package_data LIMIT 1;`;
  return !data?.[0]?.package_is_partial && carriesEvent(sql, "add_reaction");
}

/**
 * Whether the database counts `channel_opened`, so that no rows mean the
 * channel was never opened: the processor counts it from `package_version`
 * 0.2.0 on (0.1.0 before), and only in a package with an activity stream.
 */
export function countsChannelOpenings(sql: ReturnType<typeof useSQL>) {
  const { data } = sql<PackageData>`SELECT * FROM package_data LIMIT 1;`;
  const row = data?.[0];
  return !!row?.activity_stream && row.package_version !== "0.1.0";
}

function fromVersion(sql: ReturnType<typeof useSQL>, version: string) {
  const { data } = sql<PackageData>`SELECT * FROM package_data LIMIT 1;`;
  const have = (data?.[0]?.package_version ?? "0").split(".").map(Number);
  const want = version.split(".").map(Number);
  for (let i = 0; i < want.length; i++) {
    const part = have[i] ?? 0;
    if (part !== want[i]) return part > want[i];
  }
  return true;
}

/**
 * Whether `guilds` has `member_count`, which the processor writes from
 * `package_version` 0.3.0 on: an older database has no such column.
 */
export function countsGuildMembers(sql: ReturnType<typeof useSQL>) {
  return fromVersion(sql, "0.3.0");
}
