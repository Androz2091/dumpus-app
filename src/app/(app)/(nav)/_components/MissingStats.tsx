"use client";

import {
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";
import clsx from "clsx";
import { useId, useState } from "react";
import useMissingStatsData from "~/hooks/data/use-missing-stats-data";
import { useTranslation } from "~/i18n/client";

/** `YYYY-MM-DD` as local midnight, so formatting gives back the same day. */
function localDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export default function MissingStats() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelID = useId();
  const missing = useMissingStatsData();

  if (!missing || missing.days === 0) return null;

  const locale = i18n.resolvedLanguage || i18n.language;
  const number = new Intl.NumberFormat(locale);
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="desktop-container px-2 pt-4 sm:pt-8">
      <div className="rounded-lg bg-gray-900">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelID}
          onClick={() => setOpen(!open)}
          className="flex w-full pressable items-center space-x-2 rounded-lg p-2 text-left [--press-scale:0.98] hover:bg-gray-800 active:bg-gray-800"
        >
          <ExclamationTriangleIcon className="h-8 w-8 shrink-0 text-yellow-300" />
          <div className="flex-1">
            <div className="font-semibold text-white">
              {t("missingStats.title")}
            </div>
            <div className="text-sm text-gray-400">
              {t("missingStats.summary", {
                count: missing.days,
                value: number.format(missing.days),
              })}
            </div>
          </div>
          <ChevronDownIcon
            className={clsx(
              "h-6 w-6 shrink-0 text-gray-400 transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
        <div id={panelID} hidden={!open} className="px-2 pb-2 sm:pl-12">
          <p className="text-sm text-gray-400">{t("missingStats.details")}</p>
          <ul className="mt-2 space-y-1">
            {missing.periods.map(({ from, to, days }) => (
              <li
                key={from}
                className="flex flex-wrap justify-between gap-x-2 text-sm"
              >
                <span className="text-white">
                  {dates.formatRange(localDay(from), localDay(to))}
                </span>
                <span className="text-gray-400">
                  {t("missingStats.days", {
                    count: days,
                    value: number.format(days),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
