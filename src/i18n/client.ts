"use client";

import i18next from "i18next";
import {
  initReactI18next,
  useTranslation as useTranslationOrg,
} from "react-i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import LanguageDetector, {
  type DetectorOptions,
} from "i18next-browser-languagedetector";
import { getOptions, languageTag } from "./settings";

// Browsers say Norwegian Bokmål ("nb") or Nynorsk ("nn"), and Crowdin names
// the file after the language covering both, "no".
const ALIASES: Record<string, string> = { nb: "no", nn: "no" };

export const detection: DetectorOptions = {
  // Not "htmlTag": it reads the prerendered `lang="en"`, which then wins
  // over a browser listing only region tags, as Safari does ("fr-FR").
  order: ["localStorage", "navigator"],
  // The files are named by language alone. Not `load: "languageOnly"`:
  // it keeps "fr-FR" as the language, and `useTranslation` below then
  // calls `changeLanguage` on every render.
  convertDetectedLanguage: (code) => {
    const language = code.split(/[-_]/)[0].toLowerCase();
    return ALIASES[language] ?? language;
  },
  // Only a language the user picks is saved, by `pickLanguage`. A detected
  // one is found again on the next visit, and the English saved for a
  // language not offered yet would win over it once it is.
  caches: [],
};

i18next
  .use(initReactI18next)
  .use(LanguageDetector)
  .use(
    resourcesToBackend(
      // A relative path, for the reason given in `index.ts`.
      (language: string) => import(`../../locales/${language}.json`),
    ),
  )
  .init({
    ...getOptions(),
    lng: undefined, // let detect the language on client side
    detection,
  });

// The language is known only in the browser, after the English prerender
// hydrated, so `<html>` gets it here rather than from React.
i18next.on("languageChanged", (language) => {
  if (typeof document === "undefined") return;
  document.documentElement.lang = languageTag(language);
});

export function pickLanguage(language: string) {
  i18next.changeLanguage(language);
  (i18next.services.languageDetector as LanguageDetector).cacheUserLanguage(
    language,
    ["localStorage"],
  );
}

export function useTranslation(locale = i18next.language) {
  if (i18next.resolvedLanguage !== locale) i18next.changeLanguage(locale);
  return useTranslationOrg();
}
