"use client";

import { carriesEvent } from "./_availability";
import { messagesPerDayHour, messageTotals, topLocalHour } from "./_hours";
import { avgAppOpensPerDay, useDataSources } from "./_shared";

const DAY_SECONDS = 86_400;

export default function useUsageStatsData(forceLifetime?: boolean) {
  const { sql, timeRange, start, end, startLimit, endLimit } = useDataSources();

  const lifetime = forceLifetime || timeRange === "lifetime";
  const startDate = forceLifetime ? startLimit : start;
  const endDate = forceLifetime ? endLimit : end;
  const from = Date.parse(`${startDate}T00:00:00Z`) / 1000;
  const to = Date.parse(`${endDate}T00:00:00Z`) / 1000 + DAY_SECONDS;

  function getNetworkSize() {
    const { data, hasError } = sql<{ network_size: number }>`
      SELECT
        COUNT(DISTINCT dm_user_id) as network_size
      FROM dm_channels_data;
    `;

    return hasError ? null : data[0].network_size;
  }

  /**
   * The servers the account is in come from the servers index, which has no
   * dates, so a range shorter than the lifetime counts the servers joined in
   * it instead, from `guild_joined`.
   */
  function getServers() {
    const { data, hasError } = lifetime
      ? sql<{ server_count: number }>`
          SELECT COUNT(*) AS server_count FROM guilds;
        `
      : sql<{ server_count: number }>`
          SELECT COUNT(DISTINCT associated_guild_id) AS server_count
          FROM activity
          WHERE event_name = 'guild_joined'
          AND day BETWEEN '${startDate}' AND '${endDate}';
        `;

    return {
      count: hasError ? null : data[0].server_count,
      joinedInRange: !lifetime,
    };
  }

  /** On the device's clock, as the sending times chart. */
  function getTopHour() {
    return topLocalHour(messagesPerDayHour(sql, startDate, endDate));
  }

  function getSpentMoney() {
    const { data, hasError } = sql<{ total_spent: number }>`
      SELECT
        SUM(payment_amount) / 100 as total_spent
      FROM payments
    `;

    return hasError ? null : data[0].total_spent;
  }

  // Summed from the rows `getTopHour` reads, so a range's messages are read
  // once.
  function getMessageCount() {
    return (
      messageTotals(messagesPerDayHour(sql, startDate, endDate))?.total ?? null
    );
  }

  function getAvgMessageCountPerDay() {
    return (
      messageTotals(messagesPerDayHour(sql, startDate, endDate))?.perDay ?? null
    );
  }

  function getAppStarted() {
    const { data, hasError } = sql<{ app_started: number }>`
      SELECT SUM(a.occurence_count) AS app_started
      FROM activity a
      WHERE a.event_name = 'app_opened'
      AND a.day BETWEEN '${startDate}' AND '${endDate}';
    `;

    return hasError ? null : data[0].app_started;
  }

  function getAvgAppStartedPerDay() {
    return avgAppOpensPerDay(sql, startDate, endDate);
  }

  function getAvgSessionDuration() {
    const { data, hasError } = sql<{ average_session_duration: number }>`
      SELECT AVG(duration_mins) as average_session_duration
      FROM sessions
      WHERE started_date >= '${from}' AND started_date < '${to}'
    `;

    return hasError ? null : data[0].average_session_duration || 0;
  }

  function getTotalSessionDuration() {
    const { data, hasError } = sql<{ total_session_duration: number }>`
      SELECT SUM(duration_mins) as total_session_duration
      FROM sessions
      WHERE started_date >= '${from}' AND started_date < '${to}'
    `;

    return hasError ? null : data[0].total_session_duration || 0;
  }

  function getReceivedCalls() {
    const { data, hasError } = sql<{ received_calls: number }>`
      SELECT count(*) as received_calls
      FROM voice_sessions
      WHERE started_date >= '${from}' AND started_date < '${to}';
    `;

    return hasError ? null : data[0].received_calls;
  }

  /** Null when the export can't tell, see `carriesEvent`. */
  function countEvent(eventName: string) {
    if (!carriesEvent(sql, eventName)) return null;

    const { data, hasError } = sql<{ event_count: number | null }>`
      SELECT SUM(occurence_count) as event_count
      FROM activity
      WHERE event_name = '${eventName}'
      AND day BETWEEN '${startDate}' AND '${endDate}';
    `;
    // The export carries this type, so no rows means it never happened.
    return hasError ? null : (data[0].event_count ?? 0);
  }

  function getTimeSpentInVoiceChannels() {
    const { data, hasError } = sql<{ time_spent: number }>`
      SELECT SUM(duration_mins) as time_spent
      FROM voice_sessions
      WHERE started_date >= '${from}' AND started_date < '${to}';
    `;
    return hasError ? null : (data[0].time_spent || 0) * 60 * 1000;
  }

  return {
    networkSize: () => getNetworkSize(),
    servers: () => getServers(),
    topHour: () => getTopHour(),
    spentMoney: () => getSpentMoney(),
    messageCount: () => getMessageCount(),
    avgMessageCountPerDay: () => getAvgMessageCountPerDay(),
    appStarted: () => getAppStarted(),
    avgAppStartedPerDay: () => getAvgAppStartedPerDay(),
    avgSessionDuration: () => getAvgSessionDuration(),
    totalSessionDuration: () => getTotalSessionDuration(),
    receivedCalls: () => getReceivedCalls(),
    notificationClicked: () => countEvent("notification_clicked"),
    emailReceived: () => countEvent("email_opened"),
    loginSuccessful: () => countEvent("login_successful"),
    userAvatarUpdated: () => countEvent("user_avatar_updated"),
    appCrashed: () => countEvent("app_crashed"),
    oauth2Authorized: () => countEvent("oauth2_authorize_accepted"),
    voiceMessageRecorded: () => countEvent("voice_message_recorded"),
    messageReported: () => countEvent("message_reported"),
    messageEdited: () => countEvent("message_edited"),
    nitroAds: () => countEvent("premium_upsell_viewed"),
    captchaServed: () => countEvent("captcha_served"),
    timeSpentVoice: () => getTimeSpentInVoiceChannels(),
  };
}
