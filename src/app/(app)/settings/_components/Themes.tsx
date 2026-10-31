"use client";

import { Radio, RadioGroup } from "@headlessui/react";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { useShallow } from "zustand/react/shallow";
import Section from "~/components/Section";
import { useTranslation } from "~/i18n/client";
import { useAppStore } from "~/stores";
import { themes, type Theme } from "~/utils/themes";

export default function Themes() {
  const { t } = useTranslation();
  const [theme, setTheme] = useAppStore(
    useShallow(({ config }) => [config.theme, config.setTheme]),
  );

  return (
    <Section title={t("settings.theme.title")}>
      <RadioGroup
        value={theme}
        onChange={setTheme}
        aria-label={t("settings.theme.title")}
        className="grid grid-cols-2 gap-2 px-2 sm:grid-cols-4"
      >
        {(Object.keys(themes) as Theme[]).map((name) => (
          <Radio
            key={name}
            value={name}
            className="group flex pressable cursor-pointer items-center space-x-2 rounded-lg bg-gray-900 p-2 [--press-scale:0.98] hover:bg-gray-800 focus:outline-hidden active:bg-gray-800 data-checked:bg-gray-800 data-focus:ring-2 data-focus:ring-brand-700"
          >
            <span
              className="size-8 shrink-0 rounded-full"
              style={{ background: themes[name][300] }}
            />
            <span className="flex-1 font-semibold text-white">
              {t(`settings.theme.${name}`)}
            </span>
            <CheckCircleIcon className="invisible size-7 shrink-0 text-brand-300 group-data-checked:visible" />
          </Radio>
        ))}
      </RadioGroup>
    </Section>
  );
}
