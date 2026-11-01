"use client";

import Header from "~/components/layout/Header";
import { Cog6ToothIcon } from "@heroicons/react/24/solid";
import { useTranslation } from "~/i18n/client";

export default function PageHeader() {
  const { t } = useTranslation();

  return (
    <Header
      title={t("nav.stats")}
      transparent
      revealBorderOnScroll
      revealBackgroundOnScroll
      rightSlot={
        <Header.Icon
          href={{
            pathname: "/settings",
            query: { redirect: "/stats" },
          }}
          icon={Cog6ToothIcon}
        />
      }
    />
  );
}
