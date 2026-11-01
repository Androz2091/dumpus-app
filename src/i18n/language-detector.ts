import LanguageDetector from "next-language-detector";
import { detection } from "./client";
import { fallbackLocale, locales } from "./settings";

export default LanguageDetector({
  supportedLngs: locales,
  fallbackLng: fallbackLocale,
  ...detection,
});
