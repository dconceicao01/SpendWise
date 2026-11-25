import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import { exchangeAuthCode } from "@/auth/social-auth";

const emailOtpTypes = [
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
  "email",
] as const;
type EmailOtpType = (typeof emailOtpTypes)[number];

function isEmailOtpType(value: unknown): value is EmailOtpType {
  return (
    typeof value === "string" && emailOtpTypes.includes(value as EmailOtpType)
  );
}

export default function AuthCallbackScreen() {
  const {
    code,
    flow,
    token_hash: tokenHash,
    type,
  } = useLocalSearchParams<{
    code?: string;
    flow?: string;
    token_hash?: string;
    type?: string;
  }>();
  const { t } = useTranslation();

  useEffect(() => {
    let isMounted = true;
    async function completeEmailCallback() {
      if (!supabase) {
        if (isMounted) router.replace("/?authError=1");
        return;
      }

      let hasError = false;
      let callbackType: string | undefined;
      try {
        if (typeof code === "string" && code) {
          await exchangeAuthCode(code);
        } else if (
          typeof tokenHash === "string" &&
          tokenHash &&
          isEmailOtpType(type)
        ) {
          const result = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          hasError = Boolean(result.error);
          callbackType = type;
        } else {
          hasError = true;
        }
      } catch {
        hasError = true;
      }

      if (!isMounted) return;
      router.replace(
        hasError
          ? "/?authError=1"
          : flow === "recovery" || callbackType === "recovery"
            ? "/auth/reset-password"
            : flow === "oauth"
              ? "/"
              : "/?confirmed=1",
      );
    }

    void completeEmailCallback();
    return () => {
      isMounted = false;
    };
  }, [code, flow, tokenHash, type]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.brand}>SpendWise</Text>
        <ActivityIndicator color="#35684b" style={styles.indicator} />
        <Text style={styles.description}>{t("auth.callbackLoading")}</Text>
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
  indicator: { alignSelf: "flex-start", marginTop: 28 },
  description: {
    color: "#4c5d52",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
});
