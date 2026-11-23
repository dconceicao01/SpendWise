import * as SecureStore from "expo-secure-store";
import type { SupportedLanguage } from "@/i18n/language";

const LANGUAGE_KEY = "spendwise.language";

export async function readLanguagePreference(): Promise<SupportedLanguage | null> {
  const saved = await SecureStore.getItemAsync(LANGUAGE_KEY);
  return saved === "pt" || saved === "en" ? saved : null;
}

export async function writeLanguagePreference(
  language: SupportedLanguage,
): Promise<void> {
  await SecureStore.setItemAsync(LANGUAGE_KEY, language);
}
