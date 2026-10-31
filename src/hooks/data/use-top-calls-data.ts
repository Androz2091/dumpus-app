"use client";

import type { DmChannelsData } from "~/types/sql";
import { useDataSources } from "./_shared";

const TOP = 5;
const DAY_SECONDS = 86_400;

type Row = Pick<
  DmChannelsData,
  "dm_user_id" | "user_name" | "user_avatar_url"
> & { call_count: number; call_minutes: number };

/**
 * A call is a voice session in a DM's channel: group DMs aren't in
 * `dm_channels_data`, so their calls count for nobody.
 */
export default function useTopCallsData() {
  const { sql, start, end } = useDataSources();
  // The last day counts whole, as it does for the activity's days. The dates
  // are Unix seconds stored as text, which compare as numbers at 10 digits.
  const from = Date.parse(`${start}T00:00:00Z`) / 1000;
  const to = Date.parse(`${end}T00:00:00Z`) / 1000 + DAY_SECONDS;

  const { data } = sql.rows<Row>`
    SELECT
      d.dm_user_id,
      d.user_name,
      d.user_avatar_url,
      COUNT(*) AS call_count,
      SUM(v.duration_mins) AS call_minutes
    FROM voice_sessions v
    JOIN dm_channels_data d ON d.channel_id = v.channel_id
    WHERE v.started_date >= '${from}' AND v.started_date < '${to}'
    GROUP BY d.dm_user_id
    ORDER BY call_minutes DESC, call_count DESC, d.dm_user_id
    LIMIT ${TOP};
  `;

  return data?.map((row, i) => ({ ...row, rank: i + 1 })) ?? null;
}
