import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  spendwiseApi,
  SpendWiseApiError,
  type BudgetInvitation,
  type BudgetInvitationRole,
} from "@/lib/spendwise-api";

type Props = { accessToken: string; budgetId: string };
type InvitationListItem = BudgetInvitation & { expired: boolean };

export function BudgetInvitations({ accessToken, budgetId }: Props) {
  const { t, i18n } = useTranslation();
  const [invitations, setInvitations] = useState<InvitationListItem[]>([]);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState(false);
  const [role, setRole] = useState<BudgetInvitationRole>("CONTRIBUTOR");
  const [createdLink, setCreatedLink] = useState("");
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    spendwiseApi
      .listBudgetInvitations(accessToken, budgetId)
      .then((rows) => {
        if (!active) return;
        const now = Date.now();
        setInvitations(
          rows.map((invitation) => ({
            ...invitation,
            expired: Date.parse(invitation.expires_at) <= now,
          })),
        );
        setIsOwner(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof SpendWiseApiError && error.status === 403) {
          setIsOwner(false);
          return;
        }
        setIsOwner(true);
        setIsError(true);
        setNotice(t("invitation.loadError"));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, budgetId, reload, t]);

  const formattedExpiry = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.language],
  );

  async function createInvitation() {
    const normalizedEmail = email.trim();
    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      setEmailError(true);
      setIsError(false);
      setNotice("");
      return;
    }

    setIsSaving(true);
    setEmailError(false);
    setIsError(false);
    setNotice("");
    setCreatedLink("");
    try {
      const invitation = await spendwiseApi.createBudgetInvitation(
        accessToken,
        budgetId,
        { email: normalizedEmail, role },
      );
      setCreatedLink(invitation.invitation_link ?? "");
      setEmail("");
      setNotice(t("invitation.created"));
      setReload((current) => current + 1);
    } catch {
      setIsError(true);
      setNotice(t("invitation.createError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    setIsSaving(true);
    setIsError(false);
    setNotice("");
    try {
      await spendwiseApi.revokeBudgetInvitation(
        accessToken,
        budgetId,
        invitationId,
      );
      setNotice(t("invitation.revoked"));
      setReload((current) => current + 1);
    } catch {
      setIsError(true);
      setNotice(t("invitation.revokeError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function shareLink() {
    if (!createdLink) return;
    try {
      if (Platform.OS === "web") {
        if (typeof navigator === "undefined" || !navigator.clipboard) {
          setIsError(true);
          setNotice(t("invitation.copyError"));
          return;
        }
        await navigator.clipboard.writeText(createdLink);
        setIsError(false);
        setNotice(t("invitation.copied"));
        return;
      }
      await Share.share({ message: createdLink });
    } catch {
      setIsError(true);
      setNotice(t("invitation.shareError"));
    }
  }

  if (isOwner === false) return null;

  if (isLoading && isOwner === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#285c3c" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("invitation.manageTitle")}</Text>
      <Text style={styles.description}>
        {t("invitation.manageDescription")}
      </Text>

      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole={isError ? "alert" : undefined}
          style={isError ? styles.error : styles.notice}
        >
          {notice}
        </Text>
      ) : null}

      {createdLink ? (
        <View style={styles.linkCard}>
          <Text style={styles.linkTitle}>{t("invitation.linkReady")}</Text>
          <Text selectable style={styles.linkText}>
            {createdLink}
          </Text>
          <Text style={styles.description}>{t("invitation.linkWarning")}</Text>
          <View style={styles.actions}>
            <ActionButton
              label={
                Platform.OS === "web"
                  ? t("invitation.copyLink")
                  : t("invitation.shareLink")
              }
              onPress={() => void shareLink()}
            />
            <ActionButton
              label={t("invitation.hideLink")}
              onPress={() => setCreatedLink("")}
              secondary
            />
          </View>
        </View>
      ) : null}

      <Text style={styles.label}>{t("invitation.email")}</Text>
      <TextInput
        accessibilityLabel={t("invitation.email")}
        accessibilityHint={
          emailError ? t("invitation.emailInvalid") : undefined
        }
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        maxLength={254}
        keyboardType="email-address"
        onChangeText={(value) => {
          setEmail(value);
          setEmailError(false);
        }}
        placeholder={t("invitation.emailPlaceholder")}
        style={[styles.input, emailError && styles.inputInvalid]}
        value={email}
      />
      {emailError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {t("invitation.emailInvalid")}
        </Text>
      ) : null}
      <Text style={styles.label}>{t("invitation.role")}</Text>
      <View style={styles.actions}>
        <RoleChoice
          label={t("invitation.contributor")}
          selected={role === "CONTRIBUTOR"}
          onPress={() => setRole("CONTRIBUTOR")}
        />
        <RoleChoice
          label={t("invitation.viewer")}
          selected={role === "VIEWER"}
          onPress={() => setRole("VIEWER")}
        />
      </View>
      <ActionButton
        disabled={isSaving || !email.trim()}
        label={isSaving ? t("common.saving") : t("invitation.create")}
        onPress={() => void createInvitation()}
      />

      <Text style={styles.sectionTitle}>{t("invitation.pendingTitle")}</Text>
      {isLoading ? <ActivityIndicator color="#285c3c" /> : null}
      {!isLoading && invitations.length === 0 ? (
        <Text style={styles.description}>{t("invitation.empty")}</Text>
      ) : null}
      {invitations.map((invitation) => {
        const pending =
          !invitation.accepted_at &&
          !invitation.revoked_at &&
          !invitation.expired;
        const status = invitation.revoked_at
          ? t("invitation.statuses.revoked")
          : invitation.accepted_at
            ? t("invitation.statuses.accepted")
            : pending
              ? t("invitation.statuses.pending")
              : t("invitation.statuses.expired");
        return (
          <View key={invitation.id} style={styles.invitationRow}>
            <View style={styles.invitationDetails}>
              <Text style={styles.emailText}>
                {invitation.email ?? t("invitation.recipientUnavailable")}
              </Text>
              <Text style={styles.description}>
                {t(`invitation.roles.${invitation.role}`)} · {status}
              </Text>
              <Text style={styles.description}>
                {t("invitation.expiresAt", {
                  date: formattedExpiry.format(new Date(invitation.expires_at)),
                })}
              </Text>
            </View>
            {pending ? (
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => void revokeInvitation(invitation.id)}
                style={styles.revokeButton}
              >
                <Text style={styles.revokeText}>{t("invitation.revoke")}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function RoleChoice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.roleChoice, selected && styles.roleChoiceSelected]}
    >
      <Text style={styles.roleText}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        secondary && styles.secondaryAction,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionText, secondary && styles.secondaryText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { padding: 12, alignItems: "center" },
  card: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderColor: "#dbe4dc",
    borderWidth: 1,
    gap: 10,
  },
  title: { color: "#18291f", fontSize: 20, fontWeight: "700" },
  sectionTitle: {
    color: "#18291f",
    fontSize: 17,
    fontWeight: "700",
    marginTop: 12,
  },
  description: { color: "#4c5d52", fontSize: 14, lineHeight: 20 },
  label: { color: "#26382d", fontSize: 14, fontWeight: "600", marginTop: 4 },
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
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#285c3c",
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  secondaryAction: { backgroundColor: "#e6f0e7" },
  actionText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryText: { color: "#234b34" },
  disabled: { opacity: 0.55 },
  roleChoice: {
    borderColor: "#bdcbbf",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  roleChoiceSelected: { backgroundColor: "#e6f0e7", borderColor: "#285c3c" },
  roleText: { color: "#234b34", fontSize: 14 },
  linkCard: {
    backgroundColor: "#f5f7f2",
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  linkTitle: { color: "#18291f", fontSize: 15, fontWeight: "700" },
  linkText: { color: "#234b34", fontSize: 14, lineHeight: 20 },
  invitationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderTopColor: "#e6ece7",
    borderTopWidth: 1,
    paddingTop: 12,
  },
  invitationDetails: { flex: 1, gap: 3 },
  emailText: { color: "#18291f", fontSize: 15, fontWeight: "600" },
  revokeButton: { padding: 8 },
  revokeText: { color: "#a33024", fontSize: 14, fontWeight: "700" },
  notice: { color: "#285c3c", fontSize: 14, lineHeight: 20 },
  error: { color: "#a33024", fontSize: 14, lineHeight: 20 },
});
