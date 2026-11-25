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
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useTranslation } from "react-i18next";
import Svg, { Path } from "react-native-svg";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BudgetWorkspace } from "@/features/budget/BudgetWorkspace";
import {
  getAuthCallbackUrl,
  getSocialProfileName,
  signInWithSocialProvider,
  type SocialProvider,
} from "@/auth/social-auth";
import type { Metadata } from "expo-router/server";

export function generateMetadata(): Metadata {
  return { title: "SpendWise" };
}

type AuthMode = "signIn" | "signUp" | "recover";

export default function HomeScreen() {
  const { isLoading, session } = useAuth();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
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
  const [socialProvider, setSocialProvider] = useState<SocialProvider | null>(
    null,
  );
  const [nameDraft, setNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
  const profileName = session
    ? getSocialProfileName(session.user.user_metadata ?? {})
    : "";
  const isWideWeb = Platform.OS === "web" && width >= 960;
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
    const errors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = t("auth.emailInvalid");
    }
    if (mode === "signUp" && !fullName.trim()) {
      errors.fullName = t("auth.fullNameRequired");
    }
    if (mode !== "recover" && !password) {
      errors.password = t("auth.passwordRequired");
    } else if (mode === "signUp" && password.length < 8) {
      errors.password = t("auth.passwordTooShort");
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
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
            emailRedirectTo: getAuthCallbackUrl(),
          },
        });
        if (error) throw error;
        setNotice(t("auth.confirmationSent"));
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: getAuthCallbackUrl("recovery"),
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

  async function signInWithProvider(provider: SocialProvider) {
    setNotice("");
    setIsError(false);
    setSocialProvider(provider);
    try {
      await signInWithSocialProvider(provider);
    } catch {
      setIsError(true);
      setNotice(t("auth.socialSignInError"));
    } finally {
      setSocialProvider(null);
    }
  }

  async function saveRequiredName() {
    const value = nameDraft.trim();
    if (!value) {
      setFieldErrors({ fullName: t("auth.fullNameRequired") });
      return;
    }
    if (!supabase) return;
    setFieldErrors({});
    setIsSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: value },
      });
      if (error) throw error;
    } catch {
      setIsError(true);
      setNotice(t("auth.profileNameError"));
    } finally {
      setIsSavingName(false);
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
    if (!profileName) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.nameGate}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>S</Text>
            </View>
            <Text style={styles.eyebrow}>{t("auth.eyebrow")}</Text>
            <Text style={styles.title}>{t("auth.profileNameTitle")}</Text>
            <Text style={styles.description}>
              {t("auth.profileNameDescription")}
            </Text>
            <Text style={styles.label}>{t("auth.fullName")}</Text>
            <TextInput
              accessibilityLabel={t("auth.fullName")}
              autoComplete="name"
              maxLength={120}
              onChangeText={(value) => {
                setNameDraft(value);
                setFieldErrors({});
                setNotice("");
              }}
              placeholder={t("auth.fullNamePlaceholder")}
              style={[
                styles.input,
                fieldErrors.fullName && styles.inputInvalid,
              ]}
              textContentType="name"
              value={nameDraft}
            />
            {fieldErrors.fullName ? (
              <Text style={styles.error}>{fieldErrors.fullName}</Text>
            ) : null}
            {visibleNotice ? (
              <Text style={styles.error}>{visibleNotice}</Text>
            ) : null}
            <PrimaryButton
              disabled={isSavingName}
              label={
                isSavingName ? t("common.saving") : t("auth.profileNameSave")
              }
              onPress={saveRequiredName}
            />
            <TextLink label={t("common.signOut")} onPress={signOut} />
          </View>
        </SafeAreaView>
      );
    }
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
          <View style={[styles.authLayout, isWideWeb && styles.authLayoutWide]}>
            {isWideWeb ? (
              <View style={styles.welcomePanel}>
                <View style={styles.welcomeBrand}>
                  <Brand />
                </View>
                <Text style={styles.welcomeTitle}>
                  {t("auth.welcomeTitle")}
                </Text>
                <Text style={styles.welcomeDescription}>
                  {t("auth.description")}
                </Text>
                <View style={styles.valueList}>
                  <ValuePoint
                    title={t("auth.valueOneTitle")}
                    description={t("auth.valueOneDescription")}
                  />
                  <ValuePoint
                    title={t("auth.valueTwoTitle")}
                    description={t("auth.valueTwoDescription")}
                  />
                  <ValuePoint
                    title={t("auth.valueThreeTitle")}
                    description={t("auth.valueThreeDescription")}
                  />
                </View>
                <Text style={styles.virtualNote}>
                  {t("auth.virtualValues")}
                </Text>
              </View>
            ) : null}
            <View style={[styles.authCard, isWideWeb && styles.authCardWide]}>
              <View style={styles.cardTopActions}>
                {!isWideWeb ? <Brand /> : <View />}
                <LanguageSwitcher />
              </View>
              {!isWideWeb ? (
                <View style={styles.mobileWelcome}>
                  <Text style={styles.mobileWelcomeTitle}>
                    {t("auth.welcomeTitle")}
                  </Text>
                  <Text style={styles.mobileWelcomeDescription}>
                    {t("auth.description")}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.title}>{modeTitle}</Text>
              {mode !== "recover" ? (
                <View style={styles.socialOptions}>
                  <SocialButton
                    disabled={Boolean(socialProvider) || isSubmitting}
                    label={t("auth.continueWithGoogle")}
                    provider="google"
                    onPress={() => signInWithProvider("google")}
                    pending={socialProvider === "google"}
                  />
                  <SocialButton
                    disabled={Boolean(socialProvider) || isSubmitting}
                    label={t("auth.continueWithApple")}
                    provider="apple"
                    onPress={() => signInWithProvider("apple")}
                    pending={socialProvider === "apple"}
                  />
                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>
                      {t("auth.orContinueWithEmail")}
                    </Text>
                    <View style={styles.dividerLine} />
                  </View>
                </View>
              ) : null}

              <View style={styles.form}>
                {mode === "signUp" && (
                  <>
                    <Text style={styles.label}>{t("auth.fullName")}</Text>
                    <TextInput
                      accessibilityLabel={t("auth.fullName")}
                      autoComplete="name"
                      maxLength={120}
                      onChangeText={(value) => {
                        setFullName(value);
                        setFieldErrors((current) => ({
                          ...current,
                          fullName: "",
                        }));
                      }}
                      placeholder={t("auth.fullNamePlaceholder")}
                      style={[
                        styles.input,
                        fieldErrors.fullName && styles.inputInvalid,
                      ]}
                      textContentType="name"
                      value={fullName}
                    />
                    {fieldErrors.fullName ? (
                      <Text
                        accessibilityLiveRegion="polite"
                        style={styles.error}
                      >
                        {fieldErrors.fullName}
                      </Text>
                    ) : null}
                  </>
                )}
                <Text style={styles.label}>{t("auth.email")}</Text>
                <TextInput
                  accessibilityLabel={t("auth.email")}
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={(value) => {
                    setEmail(value);
                    setFieldErrors((current) => ({ ...current, email: "" }));
                  }}
                  placeholder={t("auth.emailPlaceholder")}
                  returnKeyType={mode === "recover" ? "done" : "next"}
                  style={[
                    styles.input,
                    fieldErrors.email && styles.inputInvalid,
                  ]}
                  textContentType="emailAddress"
                  value={email}
                />
                {fieldErrors.email ? (
                  <Text accessibilityLiveRegion="polite" style={styles.error}>
                    {fieldErrors.email}
                  </Text>
                ) : null}

                {mode !== "recover" && (
                  <>
                    <Text style={styles.label}>{t("auth.password")}</Text>
                    <TextInput
                      accessibilityLabel={t("auth.password")}
                      autoCapitalize="none"
                      autoComplete={
                        mode === "signUp" ? "new-password" : "current-password"
                      }
                      onChangeText={(value) => {
                        setPassword(value);
                        setFieldErrors((current) => ({
                          ...current,
                          password: "",
                        }));
                      }}
                      onSubmitEditing={submitAuth}
                      placeholder={t("auth.passwordPlaceholder")}
                      returnKeyType="go"
                      secureTextEntry
                      style={[
                        styles.input,
                        fieldErrors.password && styles.inputInvalid,
                      ]}
                      textContentType={
                        mode === "signUp" ? "newPassword" : "password"
                      }
                      value={password}
                    />
                    {fieldErrors.password ? (
                      <Text
                        accessibilityLiveRegion="polite"
                        style={styles.error}
                      >
                        {fieldErrors.password}
                      </Text>
                    ) : null}
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
                  disabled={isSubmitting}
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
              <Text style={styles.virtualNoteMobile}>
                {t("auth.virtualValues")}
              </Text>
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
    setFieldErrors({});
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

function SocialButton({
  disabled,
  label,
  onPress,
  pending,
  provider,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void | Promise<void>;
  pending: boolean;
  provider: SocialProvider;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.socialButton, disabled && styles.disabledButton]}
    >
      {pending ? (
        <ActivityIndicator color="#18291f" />
      ) : provider === "google" ? (
        <Svg
          width={20}
          height={20}
          viewBox="0 0 48 48"
          accessibilityLabel="Google"
        >
          <Path
            fill="#4285F4"
            d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15Z"
          />
          <Path
            fill="#34A853"
            d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z"
          />
          <Path
            fill="#FBBC05"
            d="M12.6 27.7a12 12 0 0 1 0-7.4v-5.2H5.8a20 20 0 0 0 0 17.8l6.8-5.2Z"
          />
          <Path
            fill="#EA4335"
            d="M24 11.9c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.8 15.1l6.8 5.2c1.6-4.8 6.1-8.4 11.4-8.4Z"
          />
        </Svg>
      ) : (
        <Svg
          width={20}
          height={22}
          viewBox="0 0 24 24"
          accessibilityLabel="Apple"
        >
          <Path
            fill="#18291f"
            d="M17.1 20.3c-1 .9-2 .8-3.1.3-1.1-.4-2.1-.5-3.2 0-1.4.6-2.2.4-3.1-.3C2.6 15.4 3.2 6.7 8.5 6.4c1.3.1 2.1.7 2.9.8 1.1-.3 2.2-.9 3.4-.8 1.5.1 2.6.7 3.3 1.8-3 1.8-2.3 5.8.5 6.9-.5 1.4-1.3 2.9-2.5 4.2ZM11.9 6.4c-.1-2.2 1.6-4 3.7-4.2.3 2.5-2.3 4.4-3.7 4.2Z"
          />
        </Svg>
      )}
      <Text style={styles.socialButtonText}>{pending ? "…" : label}</Text>
    </Pressable>
  );
}

function ValuePoint({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={styles.valuePoint}>
      <View style={styles.valueCheck}>
        <Text style={styles.valueCheckText}>✓</Text>
      </View>
      <View style={styles.valueCopy}>
        <Text style={styles.valueTitle}>{title}</Text>
        <Text style={styles.valueDescription}>{description}</Text>
      </View>
    </View>
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
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingVertical: 20 },
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
  authLayout: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  authLayoutWide: {
    maxWidth: 1180,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 28,
    paddingHorizontal: 32,
  },
  welcomePanel: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 26,
    paddingVertical: 34,
  },
  welcomeBrand: { marginBottom: 44 },
  welcomeTitle: {
    color: "#18291f",
    fontSize: 42,
    lineHeight: 50,
    fontWeight: "700",
    letterSpacing: -1.4,
    maxWidth: 550,
  },
  welcomeDescription: {
    color: "#4c5d52",
    fontSize: 18,
    lineHeight: 28,
    marginTop: 16,
    maxWidth: 500,
  },
  valueList: { gap: 20, marginTop: 34 },
  valuePoint: { flexDirection: "row", alignItems: "flex-start", gap: 13 },
  valueCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e1eee4",
    alignItems: "center",
    justifyContent: "center",
  },
  valueCheckText: { color: "#285c3c", fontSize: 16, fontWeight: "700" },
  valueCopy: { flex: 1, gap: 3 },
  valueTitle: { color: "#18291f", fontSize: 15, fontWeight: "700" },
  valueDescription: { color: "#4c5d52", fontSize: 14, lineHeight: 20 },
  authCard: {
    backgroundColor: "#fff",
    borderColor: "#e1e8df",
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 22,
    width: "100%",
  },
  authCardWide: {
    width: 470,
    alignSelf: "center",
    paddingHorizontal: 34,
    paddingVertical: 34,
    borderRadius: 24,
    shadowColor: "#1a3023",
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  cardTopActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    minHeight: 40,
  },
  mobileWelcome: { marginTop: 28 },
  mobileWelcomeTitle: {
    color: "#18291f",
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  mobileWelcomeDescription: {
    color: "#4c5d52",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 7,
  },
  socialOptions: { gap: 10, marginTop: 20 },
  socialButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderColor: "#cbd5cc",
    borderWidth: 1,
    borderRadius: 11,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
  },
  socialButtonText: { color: "#18291f", fontSize: 15, fontWeight: "600" },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 7,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#e3e9e3" },
  dividerText: { color: "#68766d", fontSize: 12 },
  virtualNote: {
    color: "#68766d",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 30,
  },
  virtualNoteMobile: {
    color: "#68766d",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 25,
  },
  nameGate: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    justifyContent: "center",
    padding: 28,
    gap: 12,
  },
  brandMark: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#285c3c",
  },
  brandMarkText: { color: "#fff", fontSize: 26, fontWeight: "700" },
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
  inputInvalid: { borderColor: "#a33024" },
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
