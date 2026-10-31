"use client";

import clsx from "clsx";
import { useAppStore } from "~/stores";
import { useShallow } from "zustand/react/shallow";

export default function SafeArea({ children }: { children: React.ReactNode }) {
  const [topColor, bottomNavShown] = useAppStore(
    useShallow(({ ui }) => [ui.safeAreaTopColor, ui.bottomNavShown]),
  );

  return (
    <>
      <div
        className="sticky top-0 z-50 h-safe-area-top-inset transition"
        style={{ backgroundColor: topColor }}
      />
      {children}
      {/* On phones the bottom bar fills the inset itself, below this strip. */}
      <div
        className={clsx(
          "sticky bottom-0 z-50 h-safe-area-bottom-inset bg-gray-950",
          bottomNavShown && "max-sm:hidden",
        )}
      />
    </>
  );
}
