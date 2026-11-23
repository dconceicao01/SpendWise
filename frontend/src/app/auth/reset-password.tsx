import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function updatePassword() {
    if (!supabase) {
      setIsError(true);
      setNotice(t("reset.expired"));
      return;
    }

    setIsSubmitting(true);
    setIsError(false);
    try {
      const activeSession =
        session ?? (await supabase.auth.getSession()).data.session;
      if (!activeSession) {
        setIsError(true);
        setNotice(t("reset.expired"));
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setIsError(true);
        setNotice(t("reset.error"));
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut({
        scope: "local",
      });
      if (signOutError) {
        setIsError(true);
        setNotice(t("reset.signInAgain"));
        return;
      }
      router.replace("/?passwordChanged=1");
    } catch {
      setIsError(true);
      setNotice(t("reset.failed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.topActions}>
          <Text style={styles.brand}>SpendWise</Text>
          <LanguageSwitcher />
        </View>
        <Text style={styles.title}>{t("reset.title")}</Text>
        <Text style={styles.description}>{t("reset.description")}</Text>
        <TextInput
          accessibilityLabel={t("reset.password")}
          autoCapitalize="none"
          autoComplete="new-password"
          onChangeText={setPassword}
          placeholder={t("auth.passwordPlaceholder")}
          secureTextEntry
          style={styles.input}
          textContentType="newPassword"
          value={password}
        />
        {notice ? (
          <Text
            accessibilityLiveRegion="polite"
            style={isError ? styles.error : styles.description}
          >
            {notice}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting || password.length < 8}
          onPress={updatePassword}
          style={[
            styles.button,
            (isSubmitting || password.length < 8) && styles.disabled,
          ]}
        >
          <Text style={styles.buttonText}>
            {isSubmitting ? t("common.saving") : t("reset.save")}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f7f2" },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  brand: { color: "#18291f", fontSize: 34, fontWeight: "700" },
  topActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { color: "#18291f", fontSize: 24, fontWeight: "700", marginTop: 32 },
  description: {
    color: "#4c5d52",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  input: {
    minHeight: 48,
    borderColor: "#bdcbbf",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#fff",
    color: "#18291f",
    paddingHorizontal: 14,
    fontSize: 16,
    marginTop: 24,
  },
  button: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#285c3c",
    borderRadius: 10,
    paddingHorizontal: 18,
    marginTop: 12,
  },
  disabled: { opacity: 0.55 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  error: { color: "#a33024", fontSize: 14, lineHeight: 20, marginTop: 12 },
});
