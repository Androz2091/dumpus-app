"use client";

import { DEFAULT_WIDGET_API_URL } from "~/constants";
import { useSelectedPackage } from "~/stores";
import { WidgetAPIGuildResponse } from "~/types/widget-api";

export default function useWidgetAPI({
  baseURL = DEFAULT_WIDGET_API_URL,
}: {
  baseURL?: string;
}) {
  const { package_id } = useSelectedPackage();

  function api({
    path,
    method,
    headers,
    body,
  }: {
    path: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    headers?: HeadersInit;
    body?: any;
  }) {
    return fetch(baseURL + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
  }

  async function getGuild({
    id,
  }: {
    id: string;
  }): Promise<WidgetAPIGuildResponse> {
    // The demo's servers are made up, so the widget API always answers 404
    // for them: answer it here instead of asking.
    if (package_id === "demo") {
      return { error: "guild not found or bot lacks access" };
    }

    const data = (await api({
      path: `/${id}`,
      method: "GET",
      headers: { Accept: "application/json" },
    }).then((res) => res.json())) as WidgetAPIGuildResponse;

    return data;
  }

  return { getGuild };
}
