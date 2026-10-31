"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { useMeasure, useUnmount } from "react-use";
import { useShallow } from "zustand/react/shallow";
import LinkPending, { usePendingHref } from "~/components/LinkPending";
import PendingBar from "~/components/PendingBar";
import { links as _links } from "~/constants";
import { useTranslation } from "~/i18n/client";
import { useAppStore } from "~/stores";
import TimeSelector, { useTimeRangePending } from "./TimeSelector";

const links = _links.filter((link) => !link.desktop);

export default function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const pendingHref = usePendingHref();
  const rangePending = useTimeRangePending();
  const litLink =
    links.find((link) => link.href === pendingHref) ??
    links.find((link) => link.active(pathname));

  // The bar's content box, without its inset padding.
  const [ref, { height }] = useMeasure<HTMLDivElement>();
  const [setHeight, setShown] = useAppStore(
    useShallow(({ ui }) => [ui.setBottomNavHeight, ui.setBottomNavShown]),
  );

  useEffect(() => {
    setHeight(height);
  }, [height, setHeight]);

  // Before the bar paints, so the page's own inset strip goes in the same
  // frame instead of showing over the bar.
  useLayoutEffect(() => {
    setShown(true);
    return () => setShown(false);
  }, [setShown]);

  useUnmount(() => {
    setHeight(0);
  });

  return (
    <div className="contents sm:hidden">
      <div
        className="mt-auto"
        style={{ height: `calc(${height}px + var(--safe-area-bottom-inset))` }}
      />
      <div
        ref={ref}
        className="fixed right-0 bottom-0 left-0 z-20 bg-gray-900 pb-safe-area-bottom-inset"
      >
        <PendingBar
          active={pendingHref !== null || rangePending}
          className="top-0"
        />
        <TimeSelector />
        <div className="border-t border-gray-800 bg-gray-900">
          <div className="flex items-center space-x-1 px-1 py-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "flex w-full pressable flex-col items-center rounded-lg py-1 [--press-scale:0.94]",
                  link === litLink
                    ? "bg-gray-800 text-brand-300"
                    : "text-gray-400 hover:bg-gray-800 active:bg-gray-800",
                )}
              >
                <link.icon className="h-6 w-6" />
                <span className="mt-1">
                  {t(
                    `nav.${
                      link.name as "overview" | "stats" | "top" | "settings"
                    }`,
                  )}
                </span>
                <LinkPending href={link.href} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
