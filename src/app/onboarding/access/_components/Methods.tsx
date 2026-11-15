"use client";

import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { type TypeOptions } from "i18next";
import DetailCard from "~/components/data/DetailCard";
import { useTranslation } from "~/i18n/client";
import { fallbackLocale } from "~/i18n/settings";

export default function Methods() {
  const { t } = useTranslation();

  // English's methods, each read on its own: a language's `methods` object,
  // read whole, has only the methods it was translated with.
  const english = t("onboarding.access.methods", {
    returnObjects: true,
    lng: fallbackLocale,
  });
  const methods = (
    Object.keys(
      english,
    ) as (keyof TypeOptions["resources"]["translation"]["onboarding"]["access"]["methods"])[]
  ).map((key) => ({
    key,
    title: t(`onboarding.access.methods.${key}.title`),
    href: `/onboarding/access/${key}`,
  }));

  return (
    <div className="grid w-full grid-cols-1 gap-2">
      {methods.map(({ key, title, href }, i) => (
        <DetailCard
          key={key}
          href={href}
          title={title}
          description={
            key === "demo"
              ? t("onboarding.access.noPackageYet")
              : t("onboarding.access.method", { n: i + 1 })
          }
          reverseTexts
          rightIcon={ChevronRightIcon}
        />
      ))}
    </div>
  );
}
