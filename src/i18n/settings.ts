import { _locales } from "./_locales";

export const fallbackLocale = "en";
export const locales = [fallbackLocale, ..._locales];

// `zh.json` is in Traditional characters, but under a bare "zh" browsers
// draw some of them in their Simplified forms, and `Intl` writes Simplified
// words, for eg. "小时" for "小時".
const LANGUAGE_TAGS: Record<string, string> = { zh: "zh-Hant" };

export function languageTag(language: string) {
  return LANGUAGE_TAGS[language] ?? language;
}

export function getOptions(locale = fallbackLocale) {
  return {
    supportedLngs: locales,
    fallbackLng: fallbackLocale,
    lng: locale,
  };
}
