import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { changeLanguage } from "@/i18n/i18n";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [isChanging, setIsChanging] = useState(false);
  const nextLanguage = i18n.language.startsWith("pt") ? "en" : "pt";
  const nextLanguageName = nextLanguage === "pt" ? "Português" : "English";

  async function selectLanguage() {
    if (isChanging) return;
    setIsChanging(true);
    try {
      await changeLanguage(nextLanguage);
    } finally {
      setIsChanging(false);
    }
  }

  return (
    <Pressable
      accessibilityLabel={t("common.switchLanguage", {
        language: nextLanguageName,
      })}
      accessibilityRole="button"
      disabled={isChanging}
      onPress={selectLanguage}
      style={styles.button}
    >
      <Text style={styles.label}>{nextLanguage.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#bdcbbf",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
  },
  label: { color: "#285c3c", fontSize: 13, fontWeight: "700" },
});
