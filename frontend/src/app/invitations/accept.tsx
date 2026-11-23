import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useAuth } from "@/auth/auth-context";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type AcceptanceResult = {
  accepted: boolean;
  budget_id: string;
  role: "CONTRIBUTOR" | "VIEWER";
};

function tokenFromUrl(url: string | null): string | null {
  if (!url) return null;
  const fragment = url.split("#", 2)[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  return params.get("token");
}

export default function AcceptInvitationScreen() {
  const { t } = useTranslation();
  const { token: routeToken } = useLocalSearchParams<{ token?: string }>();
  const linkUrl = Linking.useURL();
  const { isLoading, session } = useAuth();
  const token = routeToken ?? tokenFromUrl(linkUrl);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const missingToken = Boolean(linkUrl && !token);

  async function acceptInvitation() {
    if (!token || !session) return;
    const apiUrl = process.env.EXPO_PUBLIC_SPENDWISE_API_URL;
    if (!apiUrl) {
      setIsError(true);
      setNotice(t("invitation.invalid"));
      return;
    }
    setIsSubmitting(true);
    setIsError(false);
    setNotice("");
    try {
      const response = await fetch(
        `${apiUrl.replace(/\/$/, "")}/api/v1/invitations/accept`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        },
      );
      if (!response.ok) throw new Error("Invitation rejected");
      const result = (await response.json()) as AcceptanceResult;
      if (!result.accepted) throw new Error("Invitation rejected");
      setNotice(t("invitation.accepted"));
    } catch {
      setIsError(true);
      setNotice(t("invitation.invalid"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.topActions}>
          <Text style={styles.eyebrow}>SPENDWISE</Text>
          <LanguageSwitcher />
        </View>
        <Text style={styles.title}>{t("invitation.title")}</Text>
        <Text style={styles.description}>{t("invitation.description")}</Text>
        {isLoading ? <ActivityIndicator color="#285c3c" /> : null}
        {!isLoading && !session ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/")}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{t("invitation.signIn")}</Text>
          </Pressable>
        ) : null}
        {!isLoading && session && token ? (
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || Boolean(notice && !isError)}
            onPress={acceptInvitation}
            style={[
              styles.button,
              (isSubmitting || Boolean(notice && !isError)) && styles.disabled,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t("invitation.accept")}</Text>
            )}
          </Pressable>
        ) : null}
        {missingToken ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {t("invitation.missing")}
          </Text>
        ) : null}
        {notice ? (
          <Text
            accessibilityRole="alert"
            style={isError ? styles.error : styles.notice}
          >
            {notice}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f7f2" },
  content: {
    flex: 1,
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 560,
    padding: 28,
  },
  eyebrow: {
    color: "#35684b",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: "#18291f", fontSize: 26, fontWeight: "700", marginTop: 28 },
  description: {
    color: "#4c5d52",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  button: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#285c3c",
    borderRadius: 10,
    paddingHorizontal: 18,
    marginTop: 24,
  },
  disabled: { opacity: 0.55 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  notice: { color: "#285c3c", fontSize: 14, lineHeight: 20, marginTop: 16 },
  error: { color: "#a33024", fontSize: 14, lineHeight: 20, marginTop: 16 },
});
