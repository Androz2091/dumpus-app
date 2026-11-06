"use client";

import type { DmChannelsData } from "~/types/sql";
import { countsReactions } from "./_availability";
import { groupDays } from "./_chart";
import { topLocalHour, type DayHourCount } from "./_hours";
import { dmWhere, useDataSources } from "./_shared";

// What the processor writes for every DM, since it doesn't score them: the bar
// would show it as a real score.
const SENTIMENT_PLACEHOLDER = 0.5;

export default function useDMData({ userID }: { userID: string }) {
  const { sql, start, end } = useDataSources();
  const where = dmWhere(userID);

  // Whether the user is in the range's top DMs: a message to them in it.
  const hasData = !!sql.rows`
    SELECT 1 AS found
    FROM activity a
    WHERE a.event_name = 'message_sent'
    AND a.associated_channel_id IN (
      SELECT channel_id FROM dm_channels_data WHERE ${where}
    )
    AND a.day BETWEEN '${start}' AND '${end}'
    LIMIT 1;
  `.data?.length;

  function getUser() {
    const { data, hasError } = sql<
      Pick<DmChannelsData, "user_name" | "user_avatar_url" | "dm_user_id">
    >`
      SELECT
          user_name,
          user_avatar_url,
          '${userID}' AS dm_user_id
      FROM dm_channels_data
      WHERE ${where}
      LIMIT 1;
    `;

    return hasError ? null : data[0];
  }

  // Both the chart and the count read these rows: one query for both.
  function dailyRows() {
    return sql.rows<{ day: string; count: number }>`
      SELECT a.day, SUM(a.occurence_count) AS count
      FROM activity a
      WHERE a.event_name = 'message_sent'
      AND a.associated_channel_id IN (
        SELECT channel_id FROM dm_channels_data WHERE ${where}
      )
      AND a.day BETWEEN '${start}' AND '${end}'
      GROUP BY a.day;
    `;
  }

  function getMessagesCount() {
    if (!hasData) return null;

    const { data, hasError } = dailyRows();

    return hasError ? null : data.reduce((sum, { count }) => sum + count, 0);
  }

  /** On the device's clock, see `localHours`. */
  function getTopChatHour() {
    if (!hasData) return null;

    const { data } = sql<DayHourCount>`
      SELECT a.day, a.hour, SUM(a.occurence_count) AS count
      FROM activity a
      WHERE a.event_name = 'message_sent'
      AND a.associated_channel_id IN (
        SELECT channel_id FROM dm_channels_data WHERE ${where}
      )
      AND a.day BETWEEN '${start}' AND '${end}'
      GROUP BY a.day, a.hour;
    `;

    return topLocalHour(data);
  }

  function getDailySentMessages() {
    const { data, hasError } = dailyRows();

    if (hasError) {
      return null;
    }

    return groupDays(start, end, data);
  }

  /** Null when the database can't tell, see `countsReactions`. */
  function getReactionsCount() {
    const { data, hasError } = sql<{ reaction_count: number | null }>`
      SELECT SUM(a.occurence_count) AS reaction_count
      FROM activity a
      WHERE a.event_name = 'add_reaction'
      AND a.associated_channel_id IN (
        SELECT channel_id FROM dm_channels_data WHERE ${where}
      )
      AND a.day BETWEEN '${start}' AND '${end}';
    `;

    if (hasError) return null;
    return data[0].reaction_count ?? (countsReactions(sql) ? 0 : null);
  }

  function getSentimentScore() {
    const { data, hasError } = sql<Pick<DmChannelsData, "sentiment_score">>`
      SELECT
        sentiment_score
      FROM dm_channels_data
      WHERE ${where};
    `;

    if (hasError) return null;
    const score = data[0].sentiment_score;
    return score === SENTIMENT_PLACEHOLDER ? null : score;
  }

  return {
    hasData,
    user: getUser(),
    stats: {
      messagesCount: getMessagesCount(),
      topChatHour: getTopChatHour(),
      reactionsCount: getReactionsCount(),
    },
    sentimentScore: getSentimentScore(),
    dailySentMessages: getDailySentMessages(),
  };
}
