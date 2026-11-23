import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  spendwiseApi,
  type AccountDeletionOption,
  type UserProfile,
} from "@/lib/spendwise-api";

type Props = {
  accessToken: string;
  onBack: () => void;
  onSignOut: () => void | Promise<void>;
};

export function AccountSettings({ accessToken, onBack, onSignOut }: Props) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [options, setOptions] = useState<AccountDeletionOption[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [selectedTargets, setSelectedTargets] = useState<
    Record<string, string>
  >({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      spendwiseApi.getProfile(accessToken),
      spendwiseApi.getAccountDeletionOptions(accessToken),
    ])
      .then(([nextProfile, nextOptions]) => {
        if (!active) return;
        setProfile(nextProfile);
        setFullName(nextProfile.full_name);
        setPhone(nextProfile.phone_e164 ?? "");
        setCurrency(nextProfile.default_currency);
        setOptions(nextOptions);
        setSelectedTargets({});
      })
      .catch(() => {
        if (active) {
          setIsError(true);
          setNotice(t("account.loadError"));
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, t]);

  async function saveProfile() {
    setIsSaving(true);
    setNotice("");
    setIsError(false);
    try {
      const updated = await spendwiseApi.updateProfile(accessToken, {
        fullName: fullName.trim(),
        phoneE164: phone.trim() || null,
        defaultCurrency: currency.trim().toUpperCase(),
      });
      setProfile(updated);
      setNotice(t("account.profileSaved"));
    } catch {
      setIsError(true);
      setNotice(t("account.profileSaveError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAccount() {
    if (!canDelete) return;
    setIsDeleting(true);
    setNotice("");
    setIsError(false);
    try {
      await spendwiseApi.deleteAccount(
        accessToken,
        options.map((option) => ({
          budgetId: option.budgetId,
          targetMemberId: selectedTargets[option.budgetId],
        })),
      );
      await onSignOut();
    } catch {
      setIsError(true);
      setNotice(t("account.deleteError"));
    } finally {
      setIsDeleting(false);
    }
  }

  const transfersComplete = options.every(
    (option) =>
      option.transferTargets.length > 0 &&
      Boolean(selectedTargets[option.budgetId]),
  );
  const canDelete =
    acknowledged && transfersComplete && !isDeleting && !isLoading;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#285c3c" />
        <Text style={styles.muted}>{t("common.loading")}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SPENDWISE</Text>
          <Text style={styles.brand}>{t("account.title")}</Text>
        </View>
        <View style={styles.headerActions}>
          <LanguageSwitcher />
          <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8}>
            <Text style={styles.link}>{t("account.back")}</Text>
          </Pressable>
        </View>
      </View>

      {notice ? (
        <Text
          accessibilityRole="alert"
          style={isError ? styles.error : styles.notice}
        >
          {notice}
        </Text>
      ) : null}

      {profile ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("account.profileTitle")}</Text>
          <Text style={styles.description}>
            {t("account.profileDescription")}
          </Text>
          <Text style={styles.label}>{t("account.email")}</Text>
          <Text accessibilityLabel={t("account.email")} style={styles.readOnly}>
            {profile.email ?? "—"}
          </Text>
          <Text style={styles.label}>{t("account.fullName")}</Text>
          <TextInput
            accessibilityLabel={t("account.fullName")}
            autoComplete="name"
            maxLength={120}
            onChangeText={setFullName}
            style={styles.input}
            value={fullName}
          />
          <Text style={styles.label}>{t("account.phone")}</Text>
          <TextInput
            accessibilityLabel={t("account.phone")}
            autoComplete="tel"
            keyboardType="phone-pad"
            onChangeText={setPhone}
            placeholder={t("account.phonePlaceholder")}
            style={styles.input}
            value={phone}
          />
          <Text style={styles.label}>{t("account.currency")}</Text>
          <TextInput
            accessibilityLabel={t("account.currency")}
            autoCapitalize="characters"
            maxLength={3}
            onChangeText={setCurrency}
            style={styles.input}
            value={currency}
          />
          <ActionButton
            disabled={
              isSaving || !fullName.trim() || currency.trim().length !== 3
            }
            label={isSaving ? t("common.saving") : t("common.save")}
            onPress={saveProfile}
          />
        </View>
      ) : null}

      <View style={[styles.card, styles.dangerCard]}>
        <Text style={styles.dangerTitle}>{t("account.deleteTitle")}</Text>
        <Text style={styles.description}>{t("account.deleteDescription")}</Text>
        {options.map((option) => (
          <View key={option.budgetId} style={styles.transfer}>
            <Text style={styles.label}>
              {t("account.transferBudget", { name: option.budgetName })}
            </Text>
            {option.transferTargets.length ? (
              <View style={styles.targets}>
                {option.transferTargets.map((target) => (
                  <Choice
                    key={target.memberId}
                    label={target.displayName || t("account.unnamedMember")}
                    selected={
                      selectedTargets[option.budgetId] === target.memberId
                    }
                    onPress={() =>
                      setSelectedTargets((current) => ({
                        ...current,
                        [option.budgetId]: target.memberId,
                      }))
                    }
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.error}>{t("account.noTransferTargets")}</Text>
            )}
          </View>
        ))}

        <View style={styles.acknowledgement}>
          <Switch
            accessibilityLabel={t("account.acknowledge")}
            onValueChange={setAcknowledged}
            value={acknowledged}
            trackColor={{ false: "#bdcbbf", true: "#7c9b82" }}
            thumbColor={acknowledged ? "#285c3c" : undefined}
          />
          <Text style={styles.description}>{t("account.acknowledge")}</Text>
        </View>
        <ActionButton
          danger
          disabled={!canDelete}
          label={isDeleting ? t("account.deleting") : t("account.deleteButton")}
          onPress={deleteAccount}
        />
      </View>
    </ScrollView>
  );
}

function Choice({
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
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  disabled,
  danger,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        danger && styles.dangerAction,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 56,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
    gap: 18,
    backgroundColor: "#f5f7f2",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  eyebrow: {
    color: "#35684b",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  brand: { color: "#18291f", fontSize: 28, fontWeight: "700", marginTop: 4 },
  card: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderColor: "#dbe4dc",
    borderWidth: 1,
    gap: 8,
  },
  dangerCard: { borderColor: "#e5c7c3" },
  sectionTitle: { color: "#18291f", fontSize: 20, fontWeight: "700" },
  dangerTitle: { color: "#8d2c23", fontSize: 20, fontWeight: "700" },
  description: { color: "#4c5d52", fontSize: 15, lineHeight: 22 },
  muted: { color: "#4c5d52", fontSize: 14 },
  readOnly: { color: "#4c5d52", fontSize: 16, paddingVertical: 10 },
  label: { color: "#26382d", fontSize: 14, fontWeight: "600", marginTop: 6 },
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
  link: { color: "#285c3c", fontSize: 14, fontWeight: "700" },
  notice: { color: "#285c3c", fontSize: 14, lineHeight: 20 },
  error: { color: "#a33024", fontSize: 14, lineHeight: 20 },
  transfer: { paddingTop: 8, gap: 8 },
  targets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderColor: "#bdcbbf",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  choiceSelected: { backgroundColor: "#e6f0e7", borderColor: "#285c3c" },
  choiceText: { color: "#365643", fontSize: 14 },
  choiceTextSelected: { color: "#234b34", fontWeight: "700" },
  acknowledgement: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
  },
  action: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#285c3c",
    borderRadius: 10,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  dangerAction: { backgroundColor: "#a33024" },
  actionText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
