import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/i18n/locales/en.json";
import pt from "@/i18n/locales/pt.json";
import {
  readLanguagePreference,
  writeLanguagePreference,
} from "@/i18n/language-preference";
import { resolveDeviceLanguage, type SupportedLanguage } from "@/i18n/language";

export const i18nReady = i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    pt: { translation: pt },
  },
  lng: resolveDeviceLanguage(),
  fallbackLng: "en",
  supportedLngs: ["en", "pt"],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export async function initializeLanguage() {
  await i18nReady;
  const preference = await readLanguagePreference();
  if (preference) await i18n.changeLanguage(preference);
}

export async function changeLanguage(language: SupportedLanguage) {
  await i18n.changeLanguage(language);
  await writeLanguagePreference(language);
}

export default i18n;
