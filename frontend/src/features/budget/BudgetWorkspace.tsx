import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AccountSettings } from "@/features/profile/AccountSettings";
import {
  spendwiseApi,
  type Budget,
  type BudgetAdjustment,
  type BudgetCategory,
  type BudgetPeriod,
  type ExpenseEntry,
  type IncomeEntry,
  type IncomeSchedule,
  type IncomeScheduleFrequency,
  type MonthlyShortMonthBehavior,
} from "@/lib/spendwise-api";

type Props = { accessToken: string; onSignOut: () => void; userEmail?: string };
type DraftCategory = { name: string; percentage: string };
type MovementTab = "income" | "expense" | "adjustment";
type AnnualSummary = { income: number; expense: number; adjustment: number };

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function numberValue(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function allPages<T>(
  page: (offset: number) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const current = await page(offset);
    rows.push(...current);
    if (current.length < 100) return rows;
  }
}

export function BudgetWorkspace({ accessToken, onSignOut, userEmail }: Props) {
  const { t, i18n } = useTranslation();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [periods, setPeriods] = useState<BudgetPeriod[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [incomeSchedules, setIncomeSchedules] = useState<IncomeSchedule[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [adjustments, setAdjustments] = useState<BudgetAdjustment[]>([]);
  const [annualYear, setAnnualYear] = useState(
    String(new Date().getFullYear()),
  );
  const [annualSummary, setAnnualSummary] = useState<AnnualSummary | null>(
    null,
  );
  const [annualSummaryBudgetId, setAnnualSummaryBudgetId] = useState("");
  const [isLoadingAnnual, setIsLoadingAnnual] = useState(false);
  const [tab, setTab] = useState<MovementTab>("income");
  const [isLoading, setIsLoading] = useState(true);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const [budgetName, setBudgetName] = useState("");
  const [budgetType, setBudgetType] = useState<"PERSONAL" | "SHARED">(
    "PERSONAL",
  );
  const [currency, setCurrency] = useState("EUR");
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState(today());
  const [additionalPeriodStart, setAdditionalPeriodStart] = useState(today());
  const [additionalPeriodEnd, setAdditionalPeriodEnd] = useState(today());
  const [draftCategories, setDraftCategories] = useState<DraftCategory[]>([
    { name: "", percentage: "100" },
  ]);
  const [amount, setAmount] = useState("");
  const [movementDate, setMovementDate] = useState(today());
  const [scheduleFrequency, setScheduleFrequency] =
    useState<IncomeScheduleFrequency>("MONTHLY");
  const [shortMonthBehavior, setShortMonthBehavior] =
    useState<MonthlyShortMonthBehavior>("LAST_DAY");
  const [scheduleEndDate, setScheduleEndDate] = useState("");
  const [incomeRecurring, setIncomeRecurring] = useState(false);
  const [movementCategoryId, setMovementCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [adjustmentSign, setAdjustmentSign] = useState<1 | -1>(1);
  const [reason, setReason] = useState("");

  const selectedBudget = budgets.find(
    (budget) => budget.id === selectedBudgetId,
  );
  const activeCategories = categories.filter(
    (category) => !category.archived_at,
  );
  const percentageTotal = draftCategories.reduce(
    (total, category) =>
      total + (Number(category.percentage.replace(",", ".")) || 0),
    0,
  );

  const categoryBalances = activeCategories.map((category) => {
    const allocated = incomes.reduce(
      (total, income) =>
        total +
        income.allocation_snapshot
          .filter((allocation) => allocation.category_id === category.id)
          .reduce((sum, allocation) => sum + allocation.allocated_amount, 0),
      0,
    );
    const spent = expenses
      .filter((expense) => expense.category_id === category.id)
      .reduce((total, expense) => total + expense.amount, 0);
    const adjusted = adjustments
      .filter((adjustment) => adjustment.category_id === category.id)
      .reduce((total, adjustment) => total + adjustment.amount_delta, 0);
    return {
      category,
      allocated,
      spent,
      adjusted,
      balance: allocated - spent + adjusted,
    };
  });

  const loadBudgets = useCallback(async () => {
    const nextBudgets = await spendwiseApi.listBudgets(accessToken);
    setBudgets(nextBudgets.filter((budget) => !budget.archived_at));
    setSelectedBudgetId((current) =>
      nextBudgets.some((budget) => budget.id === current && !budget.archived_at)
        ? current
        : (nextBudgets.find((budget) => !budget.archived_at)?.id ?? ""),
    );
  }, [accessToken]);

  const loadWorkspace = useCallback(
    async (budgetId = selectedBudgetId) => {
      if (!budgetId) return;
      const [nextPeriods, nextCategories, nextSchedules] = await Promise.all([
        spendwiseApi.listPeriods(accessToken, budgetId),
        spendwiseApi.listCategories(accessToken, budgetId),
        allPages((offset) =>
          spendwiseApi.listIncomeSchedules(accessToken, budgetId, offset),
        ),
      ]);
      setPeriods(nextPeriods);
      setCategories(nextCategories);
      setIncomeSchedules(nextSchedules);
      setSelectedPeriodId((current) =>
        nextPeriods.some((period) => period.id === current)
          ? current
          : (nextPeriods[0]?.id ?? ""),
      );
    },
    [accessToken, selectedBudgetId],
  );

  const loadMovements = useCallback(async () => {
    if (!selectedBudgetId || !selectedPeriodId) return;
    const [nextIncomes, nextExpenses, nextAdjustments] = await Promise.all([
      allPages((offset) =>
        spendwiseApi.listIncomes(
          accessToken,
          selectedBudgetId,
          selectedPeriodId,
          offset,
        ),
      ),
      allPages((offset) =>
        spendwiseApi.listExpenses(
          accessToken,
          selectedBudgetId,
          selectedPeriodId,
          offset,
        ),
      ),
      allPages((offset) =>
        spendwiseApi.listAdjustments(
          accessToken,
          selectedBudgetId,
          selectedPeriodId,
          offset,
        ),
      ),
    ]);
    setIncomes(nextIncomes);
    setExpenses(nextExpenses);
    setAdjustments(nextAdjustments);
  }, [accessToken, selectedBudgetId, selectedPeriodId]);

  useEffect(() => {
    let active = true;
    spendwiseApi
      .listBudgets(accessToken)
      .then((nextBudgets) => {
        if (!active) return;
        const visible = nextBudgets.filter((budget) => !budget.archived_at);
        setBudgets(visible);
        setSelectedBudgetId((current) =>
          visible.some((budget) => budget.id === current)
            ? current
            : (visible[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (active) {
          setIsError(true);
          setNotice(t("budget.setupError"));
        }
      })
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [accessToken, t]);

  useEffect(() => {
    if (!selectedBudgetId) return;
    const timer = setTimeout(() => {
      void loadWorkspace().catch(() => {
        setIsError(true);
        setNotice(t("budget.setupError"));
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [loadWorkspace, selectedBudgetId, t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadMovements().catch(() => {
        setIsError(true);
        setNotice(t("movement.loadError"));
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [loadMovements, t]);

  const formatAmount = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: selectedBudget?.currency_code ?? currency,
        maximumFractionDigits: 4,
      }),
    [currency, i18n.language, selectedBudget?.currency_code],
  );

  async function createBudgetAndSetup() {
    setNotice("");
    setIsError(false);
    const currencyCode = currency.trim().toUpperCase();
    const categoriesValid = draftCategories.every(
      (category) =>
        category.name.trim() &&
        Number(category.percentage.replace(",", ".")) > 0,
    );
    if (
      !budgetName.trim() ||
      !/^[A-Z]{3}$/.test(currencyCode) ||
      !datePattern.test(startsOn) ||
      !datePattern.test(endsOn) ||
      startsOn > endsOn ||
      !categoriesValid ||
      Math.abs(percentageTotal - 100) > 0.0001
    ) {
      setIsError(true);
      setNotice(t("budget.invalidSetup"));
      return;
    }
    setIsSaving(true);
    try {
      const budget = await spendwiseApi.createBudget(accessToken, {
        name: budgetName.trim(),
        budgetType,
        currencyCode,
      });
      setBudgets((current) => [budget, ...current]);
      setSelectedBudgetId(budget.id);
      try {
        await spendwiseApi.createPeriod(accessToken, budget.id, {
          startsOn,
          endsOn,
        });
        const createdCategories: BudgetCategory[] = [];
        for (const category of draftCategories) {
          createdCategories.push(
            await spendwiseApi.createCategory(
              accessToken,
              budget.id,
              category.name.trim(),
            ),
          );
        }
        const allocation = await spendwiseApi.createAllocationSet(
          accessToken,
          budget.id,
          createdCategories.map((category, index) => ({
            categoryId: category.id,
            percentage: Number(
              draftCategories[index].percentage.replace(",", "."),
            ),
          })),
        );
        await spendwiseApi.activateAllocationSet(
          accessToken,
          budget.id,
          allocation.id,
        );
        await Promise.all([loadBudgets(), loadWorkspace(budget.id)]);
        setNotice(t("budget.setupComplete"));
      } catch {
        setIsError(true);
        setNotice(t("budget.setupIncomplete"));
        await loadWorkspace(budget.id).catch(() => undefined);
      }
    } catch {
      setIsError(true);
      setNotice(t("budget.setupError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function submitMovement() {
    if (!selectedBudgetId || !selectedPeriodId) return;
    const parsedAmount = numberValue(amount);
    if (!parsedAmount) {
      setIsError(true);
      setNotice(t("movement.amountInvalid"));
      return;
    }
    if (!datePattern.test(movementDate)) {
      setIsError(true);
      setNotice(t("movement.saveError"));
      return;
    }
    setIsSaving(true);
    setIsError(false);
    setNotice("");
    try {
      if (tab === "income") {
        if (incomeRecurring) {
          if (
            scheduleEndDate &&
            (!datePattern.test(scheduleEndDate) ||
              scheduleEndDate < movementDate)
          ) {
            setIsError(true);
            setNotice(t("schedule.invalid"));
            return;
          }
          await spendwiseApi.createIncomeSchedule(
            accessToken,
            selectedBudgetId,
            {
              amount: parsedAmount,
              frequency: scheduleFrequency,
              monthlyShortMonthBehavior: shortMonthBehavior,
              startDate: movementDate,
              endDate: scheduleEndDate || null,
            },
          );
          setNotice(t("schedule.created"));
          setScheduleEndDate("");
          await loadWorkspace();
        } else {
          await spendwiseApi.createIncome(accessToken, selectedBudgetId, {
            period_id: selectedPeriodId,
            amount: parsedAmount,
            occurred_on: movementDate,
          });
          setNotice(t("movement.incomeSaved"));
        }
      } else if (tab === "expense") {
        if (!movementCategoryId) throw new Error("Choose a category");
        await spendwiseApi.createExpense(accessToken, selectedBudgetId, {
          period_id: selectedPeriodId,
          category_id: movementCategoryId,
          amount: parsedAmount,
          spent_on: movementDate,
          description: description.trim() || null,
        });
        setNotice(t("movement.expenseSaved"));
      } else {
        if (!movementCategoryId || !reason.trim())
          throw new Error("Adjustment details required");
        await spendwiseApi.createAdjustment(accessToken, selectedBudgetId, {
          period_id: selectedPeriodId,
          category_id: movementCategoryId,
          amount_delta: parsedAmount * adjustmentSign,
          reason: reason.trim(),
          occurred_on: movementDate,
          corrected_expense_entry_id: null,
        });
        setNotice(t("movement.adjustmentSaved"));
      }
      setAmount("");
      setDescription("");
      setReason("");
      await loadMovements();
    } catch {
      setIsError(true);
      setNotice(t("movement.saveError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function setIncomeScheduleStatus(
    schedule: IncomeSchedule,
    status: "ACTIVE" | "PAUSED" | "CANCELLED",
  ) {
    if (!selectedBudgetId) return;
    setIsSaving(true);
    setIsError(false);
    setNotice("");
    try {
      await spendwiseApi.updateIncomeSchedule(
        accessToken,
        selectedBudgetId,
        schedule.id,
        status,
      );
      await loadWorkspace();
    } catch {
      setIsError(true);
      setNotice(t("schedule.saveError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function addPeriod() {
    if (
      !selectedBudgetId ||
      !datePattern.test(additionalPeriodStart) ||
      !datePattern.test(additionalPeriodEnd) ||
      additionalPeriodStart > additionalPeriodEnd
    ) {
      setIsError(true);
      setNotice(t("budget.invalidPeriod"));
      return;
    }
    setIsSaving(true);
    setIsError(false);
    try {
      const period = await spendwiseApi.createPeriod(
        accessToken,
        selectedBudgetId,
        {
          startsOn: additionalPeriodStart,
          endsOn: additionalPeriodEnd,
        },
      );
      setPeriods((current) => [...current, period]);
      setSelectedPeriodId(period.id);
      setNotice(t("budget.periodSaved"));
    } catch {
      setIsError(true);
      setNotice(t("budget.setupError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function loadAnnualSummary() {
    if (
      !selectedBudgetId ||
      !/^\d{4}$/.test(annualYear) ||
      Number(annualYear) < 1
    ) {
      setIsError(true);
      setNotice(t("dashboard.invalidYear"));
      return;
    }
    const year = Number(annualYear);
    const from = `${annualYear}-01-01`;
    const to = `${annualYear}-12-31`;
    const relevantPeriods = periods.filter(
      (period) => period.starts_on <= to && period.ends_on >= from,
    );
    setIsLoadingAnnual(true);
    setIsError(false);
    setNotice("");
    try {
      let incomeTotal = 0;
      let expenseTotal = 0;
      let adjustmentTotal = 0;
      for (const period of relevantPeriods) {
        const [periodIncomes, periodExpenses, periodAdjustments] =
          await Promise.all([
            allPages((offset) =>
              spendwiseApi.listIncomes(
                accessToken,
                selectedBudgetId,
                period.id,
                offset,
              ),
            ),
            allPages((offset) =>
              spendwiseApi.listExpenses(
                accessToken,
                selectedBudgetId,
                period.id,
                offset,
              ),
            ),
            allPages((offset) =>
              spendwiseApi.listAdjustments(
                accessToken,
                selectedBudgetId,
                period.id,
                offset,
              ),
            ),
          ]);
        incomeTotal += periodIncomes
          .filter((item) => item.occurred_on.startsWith(`${year}-`))
          .reduce((total, item) => total + item.amount, 0);
        expenseTotal += periodExpenses
          .filter((item) => item.spent_on.startsWith(`${year}-`))
          .reduce((total, item) => total + item.amount, 0);
        adjustmentTotal += periodAdjustments
          .filter((item) => item.occurred_on.startsWith(`${year}-`))
          .reduce((total, item) => total + item.amount_delta, 0);
      }
      setAnnualSummary({
        income: incomeTotal,
        expense: expenseTotal,
        adjustment: adjustmentTotal,
      });
      setAnnualSummaryBudgetId(selectedBudgetId);
    } catch {
      setIsError(true);
      setNotice(t("dashboard.loadError"));
    } finally {
      setIsLoadingAnnual(false);
    }
  }

  const canRecordMovements = Boolean(
    selectedPeriodId && activeCategories.length,
  );
  const setCategoryField = (
    index: number,
    field: keyof DraftCategory,
    value: string,
  ) => {
    setDraftCategories((current) =>
      current.map((category, itemIndex) =>
        itemIndex === index ? { ...category, [field]: value } : category,
      ),
    );
  };

  function selectBudget(budgetId: string) {
    setSelectedBudgetId(budgetId);
    setSelectedPeriodId("");
    setPeriods([]);
    setCategories([]);
    setIncomes([]);
    setExpenses([]);
    setAdjustments([]);
    setAnnualSummary(null);
    setAnnualSummaryBudgetId("");
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#285c3c" />
        <Text style={styles.muted}>{t("common.loading")}</Text>
      </View>
    );
  }

  if (showAccountSettings) {
    return (
      <AccountSettings
        accessToken={accessToken}
        onBack={() => setShowAccountSettings(false)}
        onSignOut={onSignOut}
      />
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
          <Text style={styles.brand}>{t("budget.title")}</Text>
        </View>
        <View style={styles.headerActions}>
          <LanguageSwitcher />
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowAccountSettings(true)}
          >
            <Text style={styles.link}>{t("account.openSettings")}</Text>
          </Pressable>
          <Pressable onPress={onSignOut} accessibilityRole="button">
            <Text style={styles.link}>{t("common.signOut")}</Text>
          </Pressable>
        </View>
      </View>
      {userEmail ? <Text style={styles.muted}>{userEmail}</Text> : null}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerTitle}>{t("budget.virtualTitle")}</Text>
        <Text style={styles.disclaimerText}>{t("budget.virtualNotice")}</Text>
      </View>
      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          style={isError ? styles.error : styles.notice}
        >
          {notice}
        </Text>
      ) : null}

      {budgets.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>{t("budget.select")}</Text>
          <View style={styles.rowWrap}>
            {budgets.map((budget) => (
              <Choice
                key={budget.id}
                label={budget.name}
                selected={budget.id === selectedBudgetId}
                onPress={() => selectBudget(budget.id)}
              />
            ))}
          </View>
          {selectedBudget ? (
            <Text style={styles.muted}>
              {selectedBudget.budget_type === "SHARED"
                ? t("budget.shared")
                : t("budget.personal")}{" "}
              · {selectedBudget.currency_code}
            </Text>
          ) : null}
          {periods.length ? (
            <>
              <Text style={styles.sectionTitle}>{t("budget.period")}</Text>
              <View style={styles.rowWrap}>
                {periods.map((period) => (
                  <Choice
                    key={period.id}
                    label={`${period.starts_on} – ${period.ends_on}`}
                    selected={period.id === selectedPeriodId}
                    onPress={() => setSelectedPeriodId(period.id)}
                  />
                ))}
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.muted}>{t("budget.noPeriods")}</Text>
              <TextInput
                accessibilityLabel={t("budget.startsOn")}
                onChangeText={setAdditionalPeriodStart}
                placeholder={t("budget.startsOn")}
                style={styles.input}
                value={additionalPeriodStart}
              />
              <TextInput
                accessibilityLabel={t("budget.endsOn")}
                onChangeText={setAdditionalPeriodEnd}
                placeholder={t("budget.endsOn")}
                style={styles.input}
                value={additionalPeriodEnd}
              />
              <ActionButton
                disabled={isSaving}
                label={isSaving ? t("common.saving") : t("budget.addPeriod")}
                onPress={addPeriod}
              />
            </View>
          )}
          {!activeCategories.length ? (
            <Text style={styles.muted}>{t("budget.noAllocation")}</Text>
          ) : null}
          {canRecordMovements ? (
            <>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t("schedule.title")}</Text>
                <Text style={styles.muted}>{t("schedule.description")}</Text>
                {incomeSchedules.length ? (
                  <View style={styles.scheduleList}>
                    {incomeSchedules.map((schedule) => {
                      const pending =
                        schedule.status === "ACTIVE" &&
                        schedule.next_occurrence_on <= today();
                      return (
                        <View key={schedule.id} style={styles.scheduleItem}>
                          <View style={styles.entryText}>
                            <Text style={styles.entryTitle}>
                              {formatAmount.format(schedule.amount)} ·{" "}
                              {t(`schedule.frequencies.${schedule.frequency}`)}
                            </Text>
                            <Text style={styles.muted}>
                              {t(`schedule.statuses.${schedule.status}`)} ·{" "}
                              {t("schedule.nextDate")}:{" "}
                              {schedule.next_occurrence_on}
                            </Text>
                            {schedule.frequency === "MONTHLY" ? (
                              <Text style={styles.muted}>
                                {t("schedule.shortMonths")}:{" "}
                                {t(
                                  `schedule.shortMonthBehaviors.${schedule.monthly_short_month_behavior}`,
                                )}
                              </Text>
                            ) : null}
                            {pending ? (
                              <Text style={styles.error}>
                                {t("schedule.pendingNoPeriod")}
                              </Text>
                            ) : null}
                          </View>
                          {schedule.status === "ACTIVE" ? (
                            <Pressable
                              accessibilityRole="button"
                              disabled={isSaving}
                              onPress={() =>
                                void setIncomeScheduleStatus(schedule, "PAUSED")
                              }
                            >
                              <Text style={styles.link}>
                                {t("schedule.pause")}
                              </Text>
                            </Pressable>
                          ) : schedule.status === "PAUSED" ? (
                            <Pressable
                              accessibilityRole="button"
                              disabled={isSaving}
                              onPress={() =>
                                void setIncomeScheduleStatus(schedule, "ACTIVE")
                              }
                            >
                              <Text style={styles.link}>
                                {t("schedule.resume")}
                              </Text>
                            </Pressable>
                          ) : null}
                          {schedule.status === "ACTIVE" ||
                          schedule.status === "PAUSED" ? (
                            <Pressable
                              accessibilityRole="button"
                              disabled={isSaving}
                              onPress={() =>
                                void setIncomeScheduleStatus(
                                  schedule,
                                  "CANCELLED",
                                )
                              }
                            >
                              <Text style={styles.link}>
                                {t("schedule.cancel")}
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
              <Text style={styles.sectionTitle}>
                {t("dashboard.periodBalances")}
              </Text>
              <View style={styles.list}>
                {categoryBalances.map((item) => (
                  <View key={item.category.id} style={styles.entry}>
                    <View style={styles.entryText}>
                      <Text style={styles.entryTitle}>
                        {item.category.name}
                      </Text>
                      <Text style={styles.muted}>
                        {t("dashboard.allocated")}:{" "}
                        {formatAmount.format(item.allocated)} ·{" "}
                        {t("dashboard.spent")}:{" "}
                        {formatAmount.format(item.spent)}
                      </Text>
                    </View>
                    <View style={styles.balanceValue}>
                      <Text style={styles.muted}>{t("dashboard.balance")}</Text>
                      <Text style={styles.entryAmount}>
                        {formatAmount.format(item.balance)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.summary}>
                <Summary
                  label={t("movement.income")}
                  value={incomes.reduce((sum, item) => sum + item.amount, 0)}
                  format={formatAmount}
                />
                <Summary
                  label={t("movement.expense")}
                  value={expenses.reduce((sum, item) => sum + item.amount, 0)}
                  format={formatAmount}
                />
                <Summary
                  label={t("movement.adjustment")}
                  value={adjustments.reduce(
                    (sum, item) => sum + item.amount_delta,
                    0,
                  )}
                  format={formatAmount}
                />
              </View>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {t("dashboard.annualTitle")}
                </Text>
                <Text style={styles.muted}>
                  {t("dashboard.annualDescription")}
                </Text>
                <View style={styles.annualRow}>
                  <TextInput
                    accessibilityLabel={t("dashboard.year")}
                    keyboardType="number-pad"
                    maxLength={4}
                    onChangeText={(value) => {
                      setAnnualYear(value);
                      setAnnualSummary(null);
                    }}
                    style={[styles.input, styles.yearInput]}
                    value={annualYear}
                  />
                  <ActionButton
                    disabled={isLoadingAnnual}
                    label={
                      isLoadingAnnual
                        ? t("common.loading")
                        : t("dashboard.loadAnnual")
                    }
                    onPress={loadAnnualSummary}
                  />
                </View>
                {annualSummary && annualSummaryBudgetId === selectedBudgetId ? (
                  <View style={styles.summary}>
                    <Summary
                      label={t("movement.income")}
                      value={annualSummary.income}
                      format={formatAmount}
                    />
                    <Summary
                      label={t("movement.expense")}
                      value={annualSummary.expense}
                      format={formatAmount}
                    />
                    <Summary
                      label={t("movement.adjustment")}
                      value={annualSummary.adjustment}
                      format={formatAmount}
                    />
                    <Summary
                      label={t("dashboard.netChange")}
                      value={
                        annualSummary.income -
                        annualSummary.expense +
                        annualSummary.adjustment
                      }
                      format={formatAmount}
                    />
                  </View>
                ) : null}
              </View>
              <View style={styles.tabs}>
                {(["income", "expense", "adjustment"] as const).map((item) => (
                  <Choice
                    key={item}
                    label={t(`movement.${item}`)}
                    selected={tab === item}
                    onPress={() => setTab(item)}
                  />
                ))}
              </View>
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {t(
                    tab === "income"
                      ? "movement.saveIncome"
                      : tab === "expense"
                        ? "movement.saveExpense"
                        : "movement.saveAdjustment",
                  )}
                </Text>
                {tab === "income" ? (
                  <>
                    <View style={styles.rowWrap}>
                      <Choice
                        label={t("schedule.single")}
                        selected={!incomeRecurring}
                        onPress={() => setIncomeRecurring(false)}
                      />
                      <Choice
                        label={t("schedule.recurring")}
                        selected={incomeRecurring}
                        onPress={() => setIncomeRecurring(true)}
                      />
                    </View>
                    <Text style={styles.muted}>
                      {incomeRecurring
                        ? t("schedule.recurringDescription")
                        : t("movement.activeAllocation")}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>{t("movement.category")}</Text>
                    <View style={styles.rowWrap}>
                      {activeCategories.map((category) => (
                        <Choice
                          key={category.id}
                          label={category.name}
                          selected={movementCategoryId === category.id}
                          onPress={() => setMovementCategoryId(category.id)}
                        />
                      ))}
                    </View>
                  </>
                )}
                <Text style={styles.label}>
                  {tab === "income"
                    ? t("movement.incomeAmount")
                    : tab === "expense"
                      ? t("movement.expenseAmount")
                      : t("movement.amount")}
                </Text>
                <TextInput
                  accessibilityLabel={t("movement.amount")}
                  keyboardType="decimal-pad"
                  onChangeText={setAmount}
                  placeholder="0,00"
                  style={styles.input}
                  value={amount}
                />
                <Text style={styles.label}>
                  {tab === "income" && incomeRecurring
                    ? t("schedule.startDate")
                    : t("movement.date")}
                </Text>
                <TextInput
                  accessibilityLabel={
                    tab === "income" && incomeRecurring
                      ? t("schedule.startDate")
                      : t("movement.date")
                  }
                  onChangeText={setMovementDate}
                  placeholder="AAAA-MM-DD"
                  style={styles.input}
                  value={movementDate}
                />
                {tab === "income" && incomeRecurring ? (
                  <>
                    <Text style={styles.label}>{t("schedule.frequency")}</Text>
                    <View style={styles.rowWrap}>
                      {(["WEEKLY", "FORTNIGHTLY", "MONTHLY"] as const).map(
                        (frequency) => (
                          <Choice
                            key={frequency}
                            label={t(`schedule.frequencies.${frequency}`)}
                            selected={scheduleFrequency === frequency}
                            onPress={() => setScheduleFrequency(frequency)}
                          />
                        ),
                      )}
                    </View>
                    {scheduleFrequency === "MONTHLY" ? (
                      <>
                        <Text style={styles.label}>
                          {t("schedule.shortMonths")}
                        </Text>
                        <Text style={styles.muted}>
                          {t("schedule.shortMonthDescription")}
                        </Text>
                        <View style={styles.rowWrap}>
                          {(["LAST_DAY", "SKIP"] as const).map((behavior) => (
                            <Choice
                              key={behavior}
                              label={t(
                                `schedule.shortMonthBehaviors.${behavior}`,
                              )}
                              selected={shortMonthBehavior === behavior}
                              onPress={() => setShortMonthBehavior(behavior)}
                            />
                          ))}
                        </View>
                      </>
                    ) : null}
                    <Text style={styles.label}>
                      {t("schedule.endDateOptional")}
                    </Text>
                    <TextInput
                      accessibilityLabel={t("schedule.endDateOptional")}
                      onChangeText={setScheduleEndDate}
                      placeholder="AAAA-MM-DD"
                      style={styles.input}
                      value={scheduleEndDate}
                    />
                  </>
                ) : null}
                {tab === "expense" ? (
                  <>
                    <Text style={styles.label}>
                      {t("movement.description")}
                    </Text>
                    <TextInput
                      accessibilityLabel={t("movement.description")}
                      onChangeText={setDescription}
                      placeholder={t("movement.descriptionPlaceholder")}
                      style={styles.input}
                      value={description}
                    />
                  </>
                ) : null}
                {tab === "adjustment" ? (
                  <>
                    <Text style={styles.label}>
                      {t("movement.adjustmentSign")}
                    </Text>
                    <View style={styles.rowWrap}>
                      <Choice
                        label={t("movement.positiveAdjustment")}
                        selected={adjustmentSign === 1}
                        onPress={() => setAdjustmentSign(1)}
                      />
                      <Choice
                        label={t("movement.negativeAdjustment")}
                        selected={adjustmentSign === -1}
                        onPress={() => setAdjustmentSign(-1)}
                      />
                    </View>
                    <Text style={styles.label}>{t("movement.reason")}</Text>
                    <TextInput
                      accessibilityLabel={t("movement.reason")}
                      onChangeText={setReason}
                      placeholder={t("movement.reasonPlaceholder")}
                      style={styles.input}
                      value={reason}
                    />
                  </>
                ) : null}
                <ActionButton
                  disabled={
                    isSaving ||
                    (tab !== "income" && !movementCategoryId) ||
                    (tab === "adjustment" && !reason.trim())
                  }
                  label={
                    isSaving
                      ? t("common.saving")
                      : tab === "income" && incomeRecurring
                        ? t("schedule.create")
                        : t("common.save")
                  }
                  onPress={submitMovement}
                />
              </View>
              <Text style={styles.sectionTitle}>{t("movement.recent")}</Text>
              <EntryList
                empty={t("movement.incomeEmpty")}
                items={incomes.map((item) => ({
                  label: t("movement.income"),
                  date: item.occurred_on,
                  amount: item.amount,
                }))}
                format={formatAmount}
              />
              <EntryList
                empty={t("movement.expenseEmpty")}
                items={expenses.map((item) => ({
                  label: `${categories.find((category) => category.id === item.category_id)?.name ?? t("movement.expense")} · ${item.description ?? ""}`,
                  date: item.spent_on,
                  amount: -item.amount,
                }))}
                format={formatAmount}
              />
              <EntryList
                empty={t("movement.adjustmentEmpty")}
                items={adjustments.map((item) => ({
                  label: `${categories.find((category) => category.id === item.category_id)?.name ?? t("movement.adjustment")} · ${item.reason}`,
                  date: item.occurred_on,
                  amount: item.amount_delta,
                }))}
                format={formatAmount}
              />
            </>
          ) : null}
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("budget.empty")}</Text>
          <Text style={styles.label}>{t("budget.name")}</Text>
          <TextInput
            accessibilityLabel={t("budget.name")}
            onChangeText={setBudgetName}
            placeholder={t("budget.namePlaceholder")}
            style={styles.input}
            value={budgetName}
          />
          <Text style={styles.label}>{t("budget.type")}</Text>
          <View style={styles.rowWrap}>
            <Choice
              label={t("budget.personal")}
              selected={budgetType === "PERSONAL"}
              onPress={() => setBudgetType("PERSONAL")}
            />
            <Choice
              label={t("budget.shared")}
              selected={budgetType === "SHARED"}
              onPress={() => setBudgetType("SHARED")}
            />
          </View>
          <Text style={styles.label}>{t("budget.currency")}</Text>
          <TextInput
            accessibilityLabel={t("budget.currency")}
            autoCapitalize="characters"
            maxLength={3}
            onChangeText={setCurrency}
            style={styles.input}
            value={currency}
          />
          <Text style={styles.label}>{t("budget.period")}</Text>
          <TextInput
            accessibilityLabel={t("budget.startsOn")}
            onChangeText={setStartsOn}
            placeholder={t("budget.startsOn")}
            style={styles.input}
            value={startsOn}
          />
          <TextInput
            accessibilityLabel={t("budget.endsOn")}
            onChangeText={setEndsOn}
            placeholder={t("budget.endsOn")}
            style={styles.input}
            value={endsOn}
          />
          <Text style={styles.sectionTitle}>{t("budget.categories")}</Text>
          {draftCategories.map((category, index) => (
            <View key={index} style={styles.categoryRow}>
              <TextInput
                accessibilityLabel={t("budget.categoryName")}
                onChangeText={(value) => setCategoryField(index, "name", value)}
                placeholder={t("budget.categoryPlaceholder")}
                style={[styles.input, styles.categoryName]}
                value={category.name}
              />
              <TextInput
                accessibilityLabel={t("budget.percentage")}
                keyboardType="decimal-pad"
                onChangeText={(value) =>
                  setCategoryField(index, "percentage", value)
                }
                style={[styles.input, styles.percentage]}
                value={category.percentage}
              />
              <Text style={styles.percent}>%</Text>
              {draftCategories.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("budget.removeCategory")}
                  onPress={() =>
                    setDraftCategories((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Text style={styles.link}>×</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          <Text style={styles.muted}>
            {t("budget.total", { percentage: percentageTotal })}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              setDraftCategories((current) => [
                ...current,
                { name: "", percentage: "0" },
              ])
            }
          >
            <Text style={styles.link}>{t("budget.addCategory")}</Text>
          </Pressable>
          <ActionButton
            disabled={isSaving}
            label={isSaving ? t("common.saving") : t("budget.setup")}
            onPress={createBudgetAndSetup}
          />
        </View>
      )}
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
      accessibilityRole="button"
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
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled && styles.disabled]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}
function Summary({
  label,
  value,
  format,
}: {
  label: string;
  value: number;
  format: Intl.NumberFormat;
}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.summaryValue}>{format.format(value)}</Text>
    </View>
  );
}
function EntryList({
  empty,
  items,
  format,
}: {
  empty: string;
  items: { label: string; date: string; amount: number }[];
  format: Intl.NumberFormat;
}) {
  if (!items.length) return <Text style={styles.muted}>{empty}</Text>;
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <View key={`${item.date}-${index}`} style={styles.entry}>
          <View style={styles.entryText}>
            <Text style={styles.entryTitle}>{item.label}</Text>
            <Text style={styles.muted}>{item.date}</Text>
          </View>
          <Text style={styles.entryAmount}>{format.format(item.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 56,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
    gap: 14,
    backgroundColor: "#f5f7f2",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#f5f7f2",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  eyebrow: {
    color: "#35684b",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.8,
  },
  brand: { color: "#18291f", fontSize: 28, fontWeight: "700", marginTop: 4 },
  disclaimer: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#e6f0e7",
    borderColor: "#c5d9c7",
    borderWidth: 1,
    gap: 4,
  },
  disclaimerTitle: { color: "#234b34", fontWeight: "700", fontSize: 15 },
  disclaimerText: { color: "#365643", fontSize: 14, lineHeight: 21 },
  sectionTitle: {
    color: "#18291f",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  label: { color: "#26382d", fontSize: 14, fontWeight: "600", marginTop: 10 },
  muted: { color: "#627168", fontSize: 14, lineHeight: 20 },
  link: {
    color: "#285c3c",
    fontSize: 14,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  card: {
    padding: 18,
    backgroundColor: "#fff",
    borderColor: "#dce5dd",
    borderWidth: 1,
    borderRadius: 14,
    gap: 7,
  },
  input: {
    minHeight: 46,
    borderColor: "#bdcbbf",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#fff",
    color: "#18291f",
    paddingHorizontal: 13,
    fontSize: 16,
  },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    minHeight: 40,
    justifyContent: "center",
    borderColor: "#bdcbbf",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceSelected: { backgroundColor: "#e6f0e7", borderColor: "#43805a" },
  choiceText: { color: "#34473b", fontSize: 14 },
  choiceTextSelected: { color: "#234b34", fontWeight: "700" },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  categoryName: { flex: 1 },
  percentage: { width: 76, textAlign: "right" },
  percent: { color: "#627168" },
  action: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#285c3c",
    borderRadius: 10,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  disabled: { opacity: 0.55 },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  notice: { color: "#285c3c", fontSize: 14, lineHeight: 20 },
  error: { color: "#a33024", fontSize: 14, lineHeight: 20 },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summaryItem: {
    flex: 1,
    minWidth: 130,
    backgroundColor: "#fff",
    padding: 14,
    borderColor: "#dce5dd",
    borderWidth: 1,
    borderRadius: 12,
    gap: 6,
  },
  summaryValue: { color: "#18291f", fontSize: 18, fontWeight: "700" },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  balanceValue: { alignItems: "flex-end", gap: 2 },
  annualRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  yearInput: { width: 100 },
  list: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14 },
  scheduleList: { marginTop: 8, borderTopColor: "#edf1ed", borderTopWidth: 1 },
  scheduleItem: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderBottomColor: "#edf1ed",
    borderBottomWidth: 1,
  },
  entry: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomColor: "#edf1ed",
    borderBottomWidth: 1,
  },
  entryText: { flex: 1, gap: 3 },
  entryTitle: { color: "#26382d", fontSize: 14, fontWeight: "600" },
  entryAmount: { color: "#18291f", fontSize: 14, fontWeight: "700" },
});
