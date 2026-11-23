import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BudgetWorkspace } from "@/features/budget/BudgetWorkspace";

type AuthMode = "signIn" | "signUp" | "recover";

export default function HomeScreen() {
  const { isLoading, session } = useAuth();
  const { t } = useTranslation();
  const { confirmed, authError, passwordChanged } = useLocalSearchParams<{
    confirmed?: string;
    authError?: string;
    passwordChanged?: string;
  }>();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const routeNotice =
    confirmed === "1"
      ? t("auth.confirmed")
      : authError === "1"
        ? t("auth.expired")
        : passwordChanged === "1"
          ? t("auth.passwordChanged")
          : "";
  const visibleNotice = notice || routeNotice;
  const visibleError = isError || authError === "1";
  const modeTitle =
    mode === "signIn"
      ? t("auth.signIn")
      : mode === "signUp"
        ? t("auth.signUp")
        : t("auth.recover");
  const submitLabel =
    mode === "signIn"
      ? t("auth.submitSignIn")
      : mode === "signUp"
        ? t("auth.submitSignUp")
        : t("auth.submitRecover");

  async function submitAuth() {
    setNotice("");
    setIsError(false);
    setIsSubmitting(true);

    try {
      if (!supabase) return;

      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        return;
      }

      if (mode === "signUp") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: Linking.createURL("auth/callback"),
          },
        });
        if (error) throw error;
        setNotice(t("auth.confirmationSent"));
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: Linking.createURL("auth/callback", {
            queryParams: { flow: "recovery" },
          }),
        },
      );
      if (error) throw error;
      setNotice(t("auth.recoverySent"));
    } catch {
      setIsError(true);
      setNotice(
        mode === "signIn"
          ? t("auth.signInError")
          : mode === "signUp"
            ? t("auth.signUpError")
            : t("auth.recoverError"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setNotice("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setIsError(true);
      setNotice(t("common.error"));
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#35684b" />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.topActions}>
            <Brand />
            <LanguageSwitcher />
          </View>
          <Text style={styles.title}>{t("auth.configuredTitle")}</Text>
          <Text style={styles.description}>
            {t("auth.configuredDescription")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <BudgetWorkspace
          accessToken={session.access_token}
          onSignOut={signOut}
          userEmail={session.user.email ?? undefined}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <View style={styles.topActions}>
              <Brand />
              <LanguageSwitcher />
            </View>
            <Text style={styles.title}>{modeTitle}</Text>
            <Text style={styles.description}>{t("auth.description")}</Text>

            <View style={styles.form}>
              {mode === "signUp" && (
                <>
                  <Text style={styles.label}>{t("auth.fullName")}</Text>
                  <TextInput
                    accessibilityLabel={t("auth.fullName")}
                    autoComplete="name"
                    maxLength={120}
                    onChangeText={setFullName}
                    placeholder={t("auth.fullNamePlaceholder")}
                    style={styles.input}
                    textContentType="name"
                    value={fullName}
                  />
                </>
              )}
              <Text style={styles.label}>{t("auth.email")}</Text>
              <TextInput
                accessibilityLabel={t("auth.email")}
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder={t("auth.emailPlaceholder")}
                returnKeyType={mode === "recover" ? "done" : "next"}
                style={styles.input}
                textContentType="emailAddress"
                value={email}
              />

              {mode !== "recover" && (
                <>
                  <Text style={styles.label}>{t("auth.password")}</Text>
                  <TextInput
                    accessibilityLabel={t("auth.password")}
                    autoCapitalize="none"
                    autoComplete={
                      mode === "signUp" ? "new-password" : "password"
                    }
                    onChangeText={setPassword}
                    onSubmitEditing={submitAuth}
                    placeholder={t("auth.passwordPlaceholder")}
                    returnKeyType="go"
                    secureTextEntry
                    style={styles.input}
                    textContentType={
                      mode === "signUp" ? "newPassword" : "password"
                    }
                    value={password}
                  />
                </>
              )}

              {visibleNotice ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={visibleError ? styles.error : styles.notice}
                >
                  {visibleNotice}
                </Text>
              ) : null}

              <PrimaryButton
                disabled={
                  isSubmitting ||
                  !email.trim() ||
                  (mode === "signUp" && !fullName.trim()) ||
                  (mode !== "recover" && !password) ||
                  (mode === "signUp" && password.length < 8)
                }
                label={isSubmitting ? t("common.loading") : submitLabel}
                onPress={submitAuth}
              />
            </View>

            <View style={styles.links}>
              {mode === "signIn" && (
                <>
                  <TextLink
                    label={t("auth.createAccountLink")}
                    onPress={() => changeMode("signUp")}
                  />
                  <TextLink
                    label={t("auth.forgotPasswordLink")}
                    onPress={() => changeMode("recover")}
                  />
                </>
              )}
              {mode !== "signIn" && (
                <TextLink
                  label={t("auth.backToSignIn")}
                  onPress={() => changeMode("signIn")}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setNotice("");
    setIsError(false);
  }
}

function Brand() {
  const { t } = useTranslation();
  return (
    <>
      <Text style={styles.eyebrow}>{t("auth.eyebrow")}</Text>
      <Text style={styles.brand}>SpendWise</Text>
    </>
  );
}

function PrimaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void | Promise<void>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabledButton]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f7f2" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 48,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  eyebrow: {
    color: "#35684b",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  brand: {
    color: "#18291f",
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1,
    marginTop: 6,
  },
  title: { color: "#18291f", fontSize: 26, fontWeight: "700", marginTop: 34 },
  description: {
    color: "#4c5d52",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
  },
  email: {
    color: "#234b34",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 24,
    marginBottom: 20,
  },
  loadingText: { color: "#4c5d52", fontSize: 14 },
  code: { fontFamily: Platform.OS === "web" ? "monospace" : undefined },
  form: { gap: 10, marginTop: 28 },
  label: { color: "#26382d", fontSize: 14, fontWeight: "600", marginTop: 8 },
  input: {
    minHeight: 48,
    borderColor: "#bdcbbf",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#fff",
    color: "#18291f",
    paddingHorizontal: 14,
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#285c3c",
    borderRadius: 10,
    paddingHorizontal: 18,
    marginTop: 10,
  },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  links: { alignItems: "flex-start", gap: 18, marginTop: 22 },
  link: {
    color: "#285c3c",
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  notice: { color: "#285c3c", fontSize: 14, lineHeight: 20, marginTop: 10 },
  error: { color: "#a33024", fontSize: 14, lineHeight: 20, marginTop: 10 },
});
