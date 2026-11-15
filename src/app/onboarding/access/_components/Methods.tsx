"use client";

import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { type TypeOptions } from "i18next";
import { useId } from "react";
import DetailCard from "~/components/data/DetailCard";
import { useTranslation } from "~/i18n/client";
import { fallbackLocale } from "~/i18n/settings";

// The method to start with: from a link, the server reads the package, not the
// phone, and can read it again for a reprocess.
const RECOMMENDED = "link";

export default function Methods() {
  const { t } = useTranslation();
  const recommendedID = useId();

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
        <div key={key} className="relative">
          <DetailCard
            href={href}
            title={title}
            description={
              key === "demo"
                ? t("onboarding.access.noPackageYet")
                : t("onboarding.access.method", { n: i + 1 })
            }
            reverseTexts
            rightIcon={ChevronRightIcon}
            className={
              key === RECOMMENDED ? "ring-1 ring-brand-300" : undefined
            }
            aria-describedby={key === RECOMMENDED ? recommendedID : undefined}
          />
          {key === RECOMMENDED && (
            <span
              id={recommendedID}
              className="pointer-events-none absolute -top-2.5 right-3 rounded-full bg-brand-300 px-2 py-0.5 text-xs font-semibold text-gray-950"
            >
              {t("onboarding.access.recommended")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
