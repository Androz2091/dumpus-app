"use client";

import { ComputerDesktopIcon } from "@heroicons/react/24/solid";
import i18next from "i18next";
import { useMemo } from "react";
import { SimpleIconsAndroid, SimpleIconsIos } from "~/components/icons";
import { useTranslation } from "~/i18n/client";
import { fallbackLocale } from "~/i18n/settings";
import type { Icon } from "~/types";

const icons: Record<string, Icon> = {
  android: SimpleIconsAndroid,
  ios: SimpleIconsIos,
  desktop: ComputerDesktopIcon,
};

/** The steps with a screenshot in `public/assets/onboarding/`. */
const SCREENSHOTS = new Set(["settings", "privacy", "request"]);

type Data = {
  os: string;
  display: string;
  icon: Icon;
  steps: {
    name: string;
    image?: string;
  }[];
};

export default function useTranslationData() {
  const { t } = useTranslation();

  const data = useMemo(() => {
    const osDisplays = t("onboarding.setup.osDisplays", {
      returnObjects: true,
    });
    // English's steps, each read on its own: a language's `steps` object,
    // read whole, has only the steps it was translated with.
    const english = t("onboarding.setup.steps", {
      returnObjects: true,
      lng: fallbackLocale,
    });
    const steps = Object.keys(english) as (keyof typeof english)[];
    const data: Data[] = [];
    for (const [os, display] of Object.entries(osDisplays)) {
      const _data: Data = {
        os,
        display,
        icon: icons[os as string],
        steps: [],
      };
      for (const step of steps) {
        _data.steps.push({
          name: t(`onboarding.setup.steps.${step}`),
          image: SCREENSHOTS.has(step)
            ? `/assets/onboarding/${i18next.language}/${os}/${step}.png`
            : undefined,
        });
      }
      data.push(_data);
    }
    return data;
  }, [t]);

  return data;
}
