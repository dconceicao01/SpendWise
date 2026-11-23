import type { SupportedLanguage } from "@/i18n/language";

const LANGUAGE_KEY = "spendwise.language";

export async function readLanguagePreference(): Promise<SupportedLanguage | null> {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(LANGUAGE_KEY);
  return saved === "pt" || saved === "en" ? saved : null;
}

export async function writeLanguagePreference(
  language: SupportedLanguage,
): Promise<void> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_KEY, language);
  }
}
