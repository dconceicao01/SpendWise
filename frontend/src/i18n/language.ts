export type SupportedLanguage = "pt" | "en";

export function resolveDeviceLanguage(): SupportedLanguage {
  return Intl.DateTimeFormat()
    .resolvedOptions()
    .locale.toLowerCase()
    .startsWith("pt")
    ? "pt"
    : "en";
}
