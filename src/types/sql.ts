// api/docs/sqlite_database_structure.md

export type Activity = {
  event_name: string;
  day: string;
  hour?: number;
  occurence_count: number;
  associated_user_id?: string;
  associated_channel_id?: string;
  associated_guild_id?: string;
};

export type DmChannelsData = {
  channel_id: string;
  dm_user_id: string;
  user_name: string;
  display_name?: string;
  user_avatar_url?: string;
  total_message_count: number;
  total_voice_channel_duration: number;
  sentiment_score: number;
};

/** From `package_version` 0.4.0 on, see `countsGroupDMs`. */
export type GroupDmChannelsData = {
  channel_id: string;
  /** Null for a group nobody named, see `groupName`. */
  channel_name: string | null;
  /** The recipients but the owner, deleted accounts included. */
  member_count: number;
  total_message_count: number;
};

/**
 * A member of a group DM with a real user id, never the owner. From
 * `package_version` 0.4.0 on, see `countsGroupDMs`.
 */
export type GroupDmMember = {
  channel_id: string;
  user_id: string;
  /** A friend's username, else the name of the owner's DM with them. */
  user_name: string | null;
  /** A friend's display name. */
  display_name: string | null;
  /** A friend's avatar. */
  user_avatar_url: string | null;
};

export type GuildChannelsData = {
  channel_id: string;
  channel_name: string;
  guild_id: string;
  total_message_count: number;
  total_voice_channel_duration: number;
};

export type Guild = {
  guild_id: string;
  guild_name: string;
  total_message_count: number;
  /**
   * The server's size the last time one of its channels was opened, null when
   * the package doesn't say, see `countsGuildMembers`.
   */
  member_count?: number | null;
};

export type PackageData = {
  package_id: string;
  package_version: string;
  package_owner_id: string;
  package_owner_name: string;
  package_owner_display_name: string;
  package_owner_avatar_url: string;
  package_is_partial: boolean;
  /**
   * The activity stream the export had, see `carriesEvent`: missing from the
   * databases processed before the processor recorded it.
   */
  activity_stream?: "analytics" | "reporting" | null;
};
