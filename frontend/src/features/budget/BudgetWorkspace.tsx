import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  calculateAnnualSummary,
  calculateMonthlySummaries,
  calculatePeriodCategoryBalances,
  periodsOverlappingYear,
  type AnnualSummary,
  type MonthlySummary,
} from "@/features/budget/budget-summary";
import { AccountSettings } from "@/features/profile/AccountSettings";
import { BudgetInvitations } from "@/features/budget/BudgetInvitations";
import {
  spendwiseApi,
  SpendWiseApiError,
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
type WorkspaceView = "dashboard" | "movement" | "statistics";

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
  if (!/^\d{1,15}(\.\d{1,4})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isValidDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
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
  const { width } = useWindowDimensions();
  const isCompact = width < 600;
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
  const [annualMonths, setAnnualMonths] = useState<MonthlySummary[]>([]);
  const [annualRefreshKey, setAnnualRefreshKey] = useState(0);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);
  const [workspaceView, setWorkspaceView] =
    useState<WorkspaceView>("dashboard");
  const [isLoadingAnnual, setIsLoadingAnnual] = useState(false);
  const [tab, setTab] = useState<MovementTab>("income");
  const [isLoading, setIsLoading] = useState(true);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [isCreatingBudget, setIsCreatingBudget] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
  const [categoryNameErrors, setCategoryNameErrors] = useState<number[]>([]);
  const [categoryPercentageErrors, setCategoryPercentageErrors] = useState<
    number[]
  >([]);
  const [allocationTotalError, setAllocationTotalError] = useState(false);
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

  const categoryBalances = calculatePeriodCategoryBalances(
    activeCategories,
    incomes,
    expenses,
    adjustments,
  );
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const currentMonthIncomes = incomes
    .filter((item) => item.occurred_on.startsWith(currentMonthKey))
    .sort((left, right) => right.occurred_on.localeCompare(left.occurred_on));
  const currentMonthExpenses = expenses
    .filter((item) => item.spent_on.startsWith(currentMonthKey))
    .sort((left, right) => right.spent_on.localeCompare(left.spent_on));
  const currentMonthIncomeTotal = currentMonthIncomes.reduce(
    (total, item) => total + item.amount,
    0,
  );
  const currentMonthExpenseTotal = currentMonthExpenses.reduce(
    (total, item) => total + item.amount,
    0,
  );
  const currentMonthAdjustmentTotal = adjustments
    .filter((item) => item.occurred_on.startsWith(currentMonthKey))
    .reduce((total, item) => total + item.amount_delta, 0);
  const currentMonthSummary: MonthlySummary = {
    month: currentMonthKey,
    income: currentMonthIncomeTotal,
    expense: currentMonthExpenseTotal,
    adjustment: currentMonthAdjustmentTotal,
    remaining:
      currentMonthIncomeTotal -
      currentMonthExpenseTotal +
      currentMonthAdjustmentTotal,
  };
  const currentMonthLabel = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    year: "numeric",
  }).format(new Date());
  const annualHasActivity = annualMonths.some(
    (item) => item.income !== 0 || item.expense !== 0 || item.adjustment !== 0,
  );
  const dashboardStatsReady = !isLoadingMovements && Boolean(selectedPeriodId);

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
    setIsLoadingMovements(true);
    try {
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
    } finally {
      setIsLoadingMovements(false);
    }
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
      .catch((error: unknown) => {
        if (active) {
          setIsError(true);
          setNotice(
            error instanceof SpendWiseApiError && error.status === 401
              ? t("budget.sessionError")
              : t("budget.setupError"),
          );
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
    const missingCategoryNames = draftCategories.flatMap((category, index) =>
      category.name.trim() ? [] : [index],
    );
    const invalidCategoryPercentages = draftCategories.flatMap(
      (category, index) =>
        Number(category.percentage.replace(",", ".")) > 0 ? [] : [index],
    );
    const nextFieldErrors: Record<string, string> = {};
    if (!budgetName.trim())
      nextFieldErrors.budgetName = t("budget.nameRequired");
    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      nextFieldErrors.currency = t("budget.currencyInvalid");
    }
    if (!isValidDate(startsOn)) {
      nextFieldErrors.startsOn = t("budget.invalidPeriod");
    }
    if (!isValidDate(endsOn) || startsOn > endsOn) {
      nextFieldErrors.endsOn = t("budget.invalidPeriod");
    }
    setCategoryNameErrors(missingCategoryNames);
    setCategoryPercentageErrors(invalidCategoryPercentages);
    const invalidAllocationTotal = Math.abs(percentageTotal - 100) > 0.0001;
    setAllocationTotalError(invalidAllocationTotal);
    setFieldErrors(nextFieldErrors);
    if (
      missingCategoryNames.length ||
      invalidCategoryPercentages.length ||
      invalidAllocationTotal ||
      Object.keys(nextFieldErrors).length
    ) {
      setIsError(false);
      setNotice("");
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
      setIsCreatingBudget(false);
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
    } catch (error) {
      setIsError(true);
      setNotice(
        error instanceof SpendWiseApiError && error.status === 401
          ? t("budget.sessionError")
          : t("budget.setupError"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function submitMovement() {
    if (!selectedBudgetId || !selectedPeriodId) return;
    setNotice("");
    setIsError(false);
    const parsedAmount = numberValue(amount);
    const nextFieldErrors: Record<string, string> = {};
    if (!parsedAmount)
      nextFieldErrors.movementAmount = t("movement.amountInvalid");
    if (!isValidDate(movementDate)) {
      nextFieldErrors.movementDate = t("movement.dateInvalid");
    }
    if (
      tab === "income" &&
      incomeRecurring &&
      scheduleEndDate &&
      (!isValidDate(scheduleEndDate) || scheduleEndDate < movementDate)
    ) {
      nextFieldErrors.scheduleEndDate = t("schedule.endDateInvalid");
    }
    if (tab !== "income" && !movementCategoryId) {
      nextFieldErrors.movementCategory = t("movement.categoryRequired");
    }
    if (tab === "adjustment" && !reason.trim()) {
      nextFieldErrors.movementReason = t("movement.reasonRequired");
    }
    setFieldErrors(nextFieldErrors);
    if (!parsedAmount || Object.keys(nextFieldErrors).length) {
      return;
    }
    setIsSaving(true);
    try {
      if (tab === "income") {
        if (incomeRecurring) {
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
        await spendwiseApi.createExpense(accessToken, selectedBudgetId, {
          period_id: selectedPeriodId,
          category_id: movementCategoryId,
          amount: parsedAmount,
          spent_on: movementDate,
          description: description.trim() || null,
        });
        setNotice(t("movement.expenseSaved"));
      } else {
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
      setAnnualRefreshKey((current) => current + 1);
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
    if (!selectedBudgetId) return;
    const nextFieldErrors: Record<string, string> = {};
    if (!isValidDate(additionalPeriodStart)) {
      nextFieldErrors.additionalPeriodStart = t("budget.invalidPeriod");
    }
    if (
      !isValidDate(additionalPeriodEnd) ||
      additionalPeriodStart > additionalPeriodEnd
    ) {
      nextFieldErrors.additionalPeriodEnd = t("budget.invalidPeriod");
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length) {
      setNotice("");
      setIsError(false);
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

  const loadAnnualSummary = useCallback(async () => {
    if (
      !selectedBudgetId ||
      !/^\d{4}$/.test(annualYear) ||
      Number(annualYear) < 1
    )
      return;

    // Defer state updates to the async continuation when this loader is
    // triggered by the dashboard effect.
    await Promise.resolve();
    const year = Number(annualYear);
    const relevantPeriods = periodsOverlappingYear(periods, year);
    setIsLoadingAnnual(true);
    try {
      const annualIncomes: IncomeEntry[] = [];
      const annualExpenses: ExpenseEntry[] = [];
      const annualAdjustments: BudgetAdjustment[] = [];
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
        annualIncomes.push(...periodIncomes);
        annualExpenses.push(...periodExpenses);
        annualAdjustments.push(...periodAdjustments);
      }
      setAnnualSummary(
        calculateAnnualSummary(
          year,
          annualIncomes,
          annualExpenses,
          annualAdjustments,
        ),
      );
      setAnnualMonths(
        calculateMonthlySummaries(
          year,
          annualIncomes,
          annualExpenses,
          annualAdjustments,
        ),
      );
      setAnnualSummaryBudgetId(selectedBudgetId);
    } catch {
      setIsError(true);
      setNotice(t("dashboard.loadError"));
    } finally {
      setIsLoadingAnnual(false);
    }
  }, [accessToken, annualYear, periods, selectedBudgetId, t]);

  useEffect(() => {
    if (
      !selectedBudgetId ||
      !periods.length ||
      !/^\d{4}$/.test(annualYear) ||
      Number(annualYear) < 1
    )
      return;
    void Promise.resolve().then(loadAnnualSummary);
  }, [
    annualRefreshKey,
    annualYear,
    loadAnnualSummary,
    periods.length,
    selectedBudgetId,
  ]);

  const handleLoadAnnualSummary = () => {
    if (
      !selectedBudgetId ||
      !/^\d{4}$/.test(annualYear) ||
      Number(annualYear) < 1
    ) {
      setFieldErrors({ annualYear: t("dashboard.invalidYear") });
      setNotice("");
      setIsError(false);
      return;
    }
    setIsError(false);
    setNotice("");
    void loadAnnualSummary();
  };

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
    if (field === "name" && value.trim()) {
      setCategoryNameErrors((current) =>
        current.filter((item) => item !== index),
      );
    }
    if (field === "percentage" && Number(value.replace(",", ".")) > 0) {
      setCategoryPercentageErrors((current) =>
        current.filter((item) => item !== index),
      );
    }
    if (field === "percentage") setAllocationTotalError(false);
  };

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
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
    setAnnualMonths([]);
    setWorkspaceView("dashboard");
  }

  function selectPeriod(periodId: string) {
    setSelectedPeriodId(periodId);
    setIncomes([]);
    setExpenses([]);
    setAdjustments([]);
    setIsLoadingMovements(true);
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
      contentContainerStyle={[styles.page, isCompact && styles.pageCompact]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.header, isCompact && styles.headerCompact]}>
        <View>
          <Text style={styles.eyebrow}>SPENDWISE</Text>
          <Text style={styles.brand}>{t("budget.title")}</Text>
        </View>
        <View
          style={[
            styles.headerActions,
            isCompact && styles.headerActionsCompact,
          ]}
        >
          <LanguageSwitcher />
          {budgets.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsCreatingBudget(true)}
              style={styles.headerCreateButton}
            >
              <Text style={styles.link}>{t("budget.new")}</Text>
            </Pressable>
          ) : null}
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

      {budgets.length > 0 && !isCreatingBudget ? (
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
          {selectedBudget?.budget_type === "SHARED" ? (
            <BudgetInvitations
              accessToken={accessToken}
              budgetId={selectedBudget.id}
            />
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
                    onPress={() => selectPeriod(period.id)}
                  />
                ))}
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.muted}>{t("budget.noPeriods")}</Text>
              <TextInput
                accessibilityLabel={t("budget.startsOn")}
                onChangeText={(value) => {
                  setAdditionalPeriodStart(value);
                  clearFieldError("additionalPeriodStart");
                  clearFieldError("additionalPeriodEnd");
                }}
                placeholder={t("budget.startsOn")}
                style={[
                  styles.input,
                  fieldErrors.additionalPeriodStart && styles.inputInvalid,
                ]}
                value={additionalPeriodStart}
              />
              <FieldError message={fieldErrors.additionalPeriodStart} />
              <TextInput
                accessibilityLabel={t("budget.endsOn")}
                onChangeText={(value) => {
                  setAdditionalPeriodEnd(value);
                  clearFieldError("additionalPeriodEnd");
                }}
                placeholder={t("budget.endsOn")}
                style={[
                  styles.input,
                  fieldErrors.additionalPeriodEnd && styles.inputInvalid,
                ]}
                value={additionalPeriodEnd}
              />
              <FieldError message={fieldErrors.additionalPeriodEnd} />
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
              {workspaceView !== "dashboard" ? (
                <View style={styles.detailHeader}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setWorkspaceView("dashboard")}
                    style={styles.formBack}
                  >
                    <Text style={styles.link}>
                      {t("dashboard.backToDashboard")}
                    </Text>
                  </Pressable>
                  <Text style={styles.sectionTitle}>
                    {workspaceView === "statistics"
                      ? t("dashboard.statisticsTitle")
                      : t(`movement.${tab}`)}
                  </Text>
                  <Text style={styles.muted}>
                    {t("dashboard.detailDescription")}
                  </Text>
                </View>
              ) : null}
              {workspaceView === "dashboard" ? (
                <>
                  <View
                    style={[
                      styles.summaryCards,
                      isCompact && styles.summaryCardsCompact,
                    ]}
                  >
                    <DashboardCard
                      label={t("dashboard.incomeCardTitle")}
                      value={
                        dashboardStatsReady
                          ? formatAmount.format(
                              currentMonthSummary?.income ?? 0,
                            )
                          : "—"
                      }
                      recent={currentMonthIncomes.slice(0, 2).map((item) => ({
                        label: t("movement.income"),
                        date: item.occurred_on,
                        amount: item.amount,
                      }))}
                      empty={t("dashboard.recentIncomeEmpty")}
                      format={formatAmount}
                      onPress={() => {
                        setTab("income");
                        setWorkspaceView("movement");
                      }}
                    />
                    <DashboardCard
                      label={t("dashboard.expenseCardTitle")}
                      value={
                        dashboardStatsReady
                          ? formatAmount.format(
                              currentMonthSummary?.expense ?? 0,
                            )
                          : "—"
                      }
                      recent={currentMonthExpenses.slice(0, 2).map((item) => ({
                        label: `${categories.find((category) => category.id === item.category_id)?.name ?? t("movement.expense")} · ${item.description ?? ""}`,
                        date: item.spent_on,
                        amount: -item.amount,
                      }))}
                      empty={t("dashboard.recentExpenseEmpty")}
                      format={formatAmount}
                      onPress={() => {
                        setTab("expense");
                        setWorkspaceView("movement");
                      }}
                    />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setWorkspaceView("statistics")}
                      style={styles.summaryItem}
                    >
                      <Text style={styles.muted}>
                        {t("dashboard.remainingTitle")}
                      </Text>
                      <Text style={styles.summaryValue}>
                        {dashboardStatsReady
                          ? formatAmount.format(
                              currentMonthSummary?.remaining ?? 0,
                            )
                          : "—"}
                      </Text>
                      <Text style={styles.cardHint}>
                        {t("dashboard.remainingDescription")}
                      </Text>
                      <Text style={styles.link}>
                        {t("dashboard.openDetails")}
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>
                      {t("dashboard.periodBalances")}
                    </Text>
                    <Text style={styles.muted}>
                      {t("dashboard.periodLabel", {
                        start:
                          periods.find(
                            (period) => period.id === selectedPeriodId,
                          )?.starts_on ?? "",
                        end:
                          periods.find(
                            (period) => period.id === selectedPeriodId,
                          )?.ends_on ?? "",
                      })}
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
                            <Text style={styles.muted}>
                              {t("dashboard.balance")}
                            </Text>
                            <Text style={styles.entryAmount}>
                              {formatAmount.format(item.balance)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setTab("adjustment");
                        setWorkspaceView("movement");
                      }}
                      style={styles.inlineAction}
                    >
                      <Text style={styles.link}>
                        {t("movement.saveAdjustment")}
                      </Text>
                    </Pressable>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("dashboard.viewStatistics")}
                    onPress={() => setWorkspaceView("statistics")}
                    style={styles.statisticsPreview}
                  >
                    <View style={styles.statisticsHeading}>
                      <View style={styles.entryText}>
                        <Text style={styles.sectionTitle}>
                          {t("dashboard.previewTitle")}
                        </Text>
                        <Text style={styles.muted}>
                          {t("dashboard.monthSummary", {
                            month: currentMonthLabel,
                          })}
                        </Text>
                      </View>
                      <Text style={styles.link}>
                        {t("dashboard.viewStatistics")}
                      </Text>
                    </View>
                    {dashboardStatsReady ? (
                      <View style={styles.monthSummaryRow}>
                        <Summary
                          label={t("movement.income")}
                          value={currentMonthSummary?.income ?? 0}
                          format={formatAmount}
                        />
                        <Summary
                          label={t("movement.expense")}
                          value={currentMonthSummary?.expense ?? 0}
                          format={formatAmount}
                        />
                        <Summary
                          label={t("dashboard.remainingTitle")}
                          value={currentMonthSummary?.remaining ?? 0}
                          format={formatAmount}
                        />
                      </View>
                    ) : (
                      <Text style={styles.muted}>{t("common.loading")}</Text>
                    )}
                    {isLoadingAnnual ? (
                      <Text style={styles.muted}>{t("common.loading")}</Text>
                    ) : annualHasActivity ? (
                      <AnnualBarChart months={annualMonths} />
                    ) : (
                      <Text style={styles.muted}>
                        {t("dashboard.noChartData")}
                      </Text>
                    )}
                  </Pressable>
                </>
              ) : null}
              {workspaceView === "movement" ? (
                <>
                  {tab === "income" ? (
                    <>
                      <View style={styles.card}>
                        <Text style={styles.sectionTitle}>
                          {t("schedule.title")}
                        </Text>
                        <Text style={styles.muted}>
                          {t("schedule.description")}
                        </Text>
                        {incomeSchedules.length ? (
                          <View style={styles.scheduleList}>
                            {incomeSchedules.map((schedule) => {
                              const pending =
                                schedule.status === "ACTIVE" &&
                                schedule.next_occurrence_on <= today();
                              return (
                                <View
                                  key={schedule.id}
                                  style={styles.scheduleItem}
                                >
                                  <View style={styles.entryText}>
                                    <Text style={styles.entryTitle}>
                                      {formatAmount.format(schedule.amount)} ·{" "}
                                      {t(
                                        `schedule.frequencies.${schedule.frequency}`,
                                      )}
                                    </Text>
                                    <Text style={styles.muted}>
                                      {t(
                                        `schedule.statuses.${schedule.status}`,
                                      )}{" "}
                                      · {t("schedule.nextDate")}:{" "}
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
                                        void setIncomeScheduleStatus(
                                          schedule,
                                          "PAUSED",
                                        )
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
                                        void setIncomeScheduleStatus(
                                          schedule,
                                          "ACTIVE",
                                        )
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
                    </>
                  ) : null}
                  <View style={styles.tabs}>
                    {(["income", "expense", "adjustment"] as const).map(
                      (item) => (
                        <Choice
                          key={item}
                          label={t(`movement.${item}`)}
                          selected={tab === item}
                          onPress={() => {
                            setTab(item);
                            setFieldErrors({});
                          }}
                        />
                      ),
                    )}
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
                        <Text style={styles.label}>
                          {t("movement.category")}
                        </Text>
                        <View style={styles.rowWrap}>
                          {activeCategories.map((category) => (
                            <Choice
                              key={category.id}
                              label={category.name}
                              selected={movementCategoryId === category.id}
                              onPress={() => {
                                setMovementCategoryId(category.id);
                                clearFieldError("movementCategory");
                              }}
                            />
                          ))}
                        </View>
                        <FieldError message={fieldErrors.movementCategory} />
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
                      onChangeText={(value) => {
                        setAmount(value);
                        clearFieldError("movementAmount");
                      }}
                      placeholder="0,00"
                      style={[
                        styles.input,
                        fieldErrors.movementAmount && styles.inputInvalid,
                      ]}
                      value={amount}
                    />
                    <FieldError message={fieldErrors.movementAmount} />
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
                      onChangeText={(value) => {
                        setMovementDate(value);
                        clearFieldError("movementDate");
                        clearFieldError("scheduleEndDate");
                      }}
                      placeholder="AAAA-MM-DD"
                      style={[
                        styles.input,
                        fieldErrors.movementDate && styles.inputInvalid,
                      ]}
                      value={movementDate}
                    />
                    <FieldError message={fieldErrors.movementDate} />
                    {tab === "income" && incomeRecurring ? (
                      <>
                        <Text style={styles.label}>
                          {t("schedule.frequency")}
                        </Text>
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
                              {(["LAST_DAY", "SKIP"] as const).map(
                                (behavior) => (
                                  <Choice
                                    key={behavior}
                                    label={t(
                                      `schedule.shortMonthBehaviors.${behavior}`,
                                    )}
                                    selected={shortMonthBehavior === behavior}
                                    onPress={() =>
                                      setShortMonthBehavior(behavior)
                                    }
                                  />
                                ),
                              )}
                            </View>
                          </>
                        ) : null}
                        <Text style={styles.label}>
                          {t("schedule.endDateOptional")}
                        </Text>
                        <TextInput
                          accessibilityLabel={t("schedule.endDateOptional")}
                          onChangeText={(value) => {
                            setScheduleEndDate(value);
                            clearFieldError("scheduleEndDate");
                          }}
                          placeholder="AAAA-MM-DD"
                          style={[
                            styles.input,
                            fieldErrors.scheduleEndDate && styles.inputInvalid,
                          ]}
                          value={scheduleEndDate}
                        />
                        <FieldError message={fieldErrors.scheduleEndDate} />
                      </>
                    ) : null}
                    {tab === "expense" ? (
                      <>
                        <Text style={styles.label}>
                          {t("movement.description")}
                        </Text>
                        <TextInput
                          accessibilityLabel={t("movement.description")}
                          maxLength={500}
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
                          maxLength={500}
                          onChangeText={(value) => {
                            setReason(value);
                            clearFieldError("movementReason");
                          }}
                          placeholder={t("movement.reasonPlaceholder")}
                          style={[
                            styles.input,
                            fieldErrors.movementReason && styles.inputInvalid,
                          ]}
                          value={reason}
                        />
                        <FieldError message={fieldErrors.movementReason} />
                      </>
                    ) : null}
                    <ActionButton
                      disabled={isSaving}
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
                  <Text style={styles.sectionTitle}>
                    {t("movement.recent")}
                  </Text>
                  <EntryList
                    empty={t(`movement.${tab}Empty`)}
                    items={
                      tab === "income"
                        ? incomes.map((item) => ({
                            label: t("movement.income"),
                            date: item.occurred_on,
                            amount: item.amount,
                          }))
                        : tab === "expense"
                          ? expenses.map((item) => ({
                              label: `${categories.find((category) => category.id === item.category_id)?.name ?? t("movement.expense")} · ${item.description ?? ""}`,
                              date: item.spent_on,
                              amount: -item.amount,
                            }))
                          : adjustments.map((item) => ({
                              label: `${categories.find((category) => category.id === item.category_id)?.name ?? t("movement.adjustment")} · ${item.reason}`,
                              date: item.occurred_on,
                              amount: item.amount_delta,
                            }))
                    }
                    format={formatAmount}
                  />
                </>
              ) : null}
              {workspaceView === "statistics" ? (
                <View style={styles.card}>
                  <Text style={styles.muted}>
                    {t("dashboard.annualDescription")}
                  </Text>
                  <View style={styles.annualRow}>
                    <View style={styles.annualInput}>
                      <TextInput
                        accessibilityLabel={t("dashboard.year")}
                        keyboardType="number-pad"
                        maxLength={4}
                        onChangeText={(value) => {
                          setAnnualYear(value);
                          setAnnualSummary(null);
                          setAnnualMonths([]);
                          setAnnualSummaryBudgetId("");
                          clearFieldError("annualYear");
                        }}
                        style={[
                          styles.input,
                          styles.yearInput,
                          fieldErrors.annualYear && styles.inputInvalid,
                        ]}
                        value={annualYear}
                      />
                      <FieldError message={fieldErrors.annualYear} />
                    </View>
                    <Text style={styles.muted}>{t("dashboard.year")}</Text>
                    <ActionButton
                      disabled={isLoadingAnnual}
                      label={
                        isLoadingAnnual
                          ? t("common.loading")
                          : t("dashboard.loadAnnual")
                      }
                      onPress={handleLoadAnnualSummary}
                    />
                  </View>
                  {annualSummary &&
                  annualSummaryBudgetId === selectedBudgetId ? (
                    <View style={styles.monthSummaryRow}>
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
                  <Text style={styles.sectionTitle}>
                    {t("dashboard.annualChartTitle")}
                  </Text>
                  {isLoadingAnnual ? (
                    <Text style={styles.muted}>{t("common.loading")}</Text>
                  ) : annualHasActivity ? (
                    <AnnualBarChart months={annualMonths} />
                  ) : (
                    <Text style={styles.muted}>
                      {t("dashboard.noChartData")}
                    </Text>
                  )}
                  {annualSummary &&
                  annualSummaryBudgetId === selectedBudgetId ? (
                    <Text style={styles.muted}>
                      {t("movement.adjustment")}:{" "}
                      {formatAmount.format(annualSummary.adjustment)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}
        </>
      ) : isCreatingBudget ? (
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setIsCreatingBudget(false);
              setFieldErrors({});
              setCategoryNameErrors([]);
              setCategoryPercentageErrors([]);
              setAllocationTotalError(false);
            }}
            style={styles.formBack}
          >
            <Text style={styles.link}>{t("common.cancel")}</Text>
          </Pressable>
          <Text style={styles.sectionTitle}>{t("budget.setupTitle")}</Text>
          <Text style={styles.muted}>{t("budget.setupDescription")}</Text>
          <Text style={styles.label}>{t("budget.name")}</Text>
          <TextInput
            accessibilityLabel={t("budget.name")}
            onChangeText={(value) => {
              setBudgetName(value);
              clearFieldError("budgetName");
            }}
            maxLength={120}
            placeholder={t("budget.namePlaceholder")}
            style={[
              styles.input,
              fieldErrors.budgetName && styles.inputInvalid,
            ]}
            value={budgetName}
          />
          <FieldError message={fieldErrors.budgetName} />
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
            onChangeText={(value) => {
              setCurrency(value);
              clearFieldError("currency");
            }}
            style={[styles.input, fieldErrors.currency && styles.inputInvalid]}
            value={currency}
          />
          <FieldError message={fieldErrors.currency} />
          <Text style={styles.label}>{t("budget.period")}</Text>
          <TextInput
            accessibilityLabel={t("budget.startsOn")}
            onChangeText={(value) => {
              setStartsOn(value);
              clearFieldError("startsOn");
              clearFieldError("endsOn");
            }}
            placeholder={t("budget.startsOn")}
            style={[styles.input, fieldErrors.startsOn && styles.inputInvalid]}
            value={startsOn}
          />
          <FieldError message={fieldErrors.startsOn} />
          <TextInput
            accessibilityLabel={t("budget.endsOn")}
            onChangeText={(value) => {
              setEndsOn(value);
              clearFieldError("endsOn");
            }}
            placeholder={t("budget.endsOn")}
            style={[styles.input, fieldErrors.endsOn && styles.inputInvalid]}
            value={endsOn}
          />
          <FieldError message={fieldErrors.endsOn} />
          <Text style={styles.sectionTitle}>{t("budget.categories")}</Text>
          {draftCategories.map((category, index) => (
            <View key={index} style={styles.categoryItem}>
              <View style={styles.categoryRow}>
                <TextInput
                  accessibilityLabel={t("budget.categoryName")}
                  accessibilityHint={
                    categoryNameErrors.includes(index)
                      ? t("budget.categoryNameRequired")
                      : undefined
                  }
                  onChangeText={(value) =>
                    setCategoryField(index, "name", value)
                  }
                  maxLength={80}
                  placeholder={t("budget.categoryPlaceholder")}
                  style={[
                    styles.input,
                    styles.categoryName,
                    categoryNameErrors.includes(index) && styles.inputInvalid,
                  ]}
                  value={category.name}
                />
                <TextInput
                  accessibilityLabel={t("budget.percentage")}
                  keyboardType="decimal-pad"
                  onChangeText={(value) =>
                    setCategoryField(index, "percentage", value)
                  }
                  style={[
                    styles.input,
                    styles.percentage,
                    categoryPercentageErrors.includes(index) &&
                      styles.inputInvalid,
                  ]}
                  value={category.percentage}
                />
                <Text style={styles.percent}>%</Text>
                {draftCategories.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("budget.removeCategory")}
                    onPress={() => {
                      setDraftCategories((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      );
                      setCategoryNameErrors((current) =>
                        current
                          .filter((item) => item !== index)
                          .map((item) => (item > index ? item - 1 : item)),
                      );
                      setCategoryPercentageErrors((current) =>
                        current
                          .filter((item) => item !== index)
                          .map((item) => (item > index ? item - 1 : item)),
                      );
                      setAllocationTotalError(false);
                    }}
                  >
                    <Text style={styles.link}>×</Text>
                  </Pressable>
                ) : null}
              </View>
              {categoryNameErrors.includes(index) ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={styles.fieldError}
                >
                  {t("budget.categoryNameRequired")}
                </Text>
              ) : null}
              {categoryPercentageErrors.includes(index) ? (
                <FieldError message={t("budget.percentageRequired")} />
              ) : null}
            </View>
          ))}
          <Text
            style={allocationTotalError ? styles.fieldError : styles.muted}
            accessibilityLiveRegion={
              allocationTotalError ? "polite" : undefined
            }
          >
            {t("budget.total", { percentage: percentageTotal })}
          </Text>
          {allocationTotalError ? (
            <FieldError message={t("budget.invalidTotal")} />
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDraftCategories((current) => [
                ...current,
                { name: "", percentage: "0" },
              ]);
              setAllocationTotalError(false);
            }}
          >
            <Text style={styles.link}>{t("budget.addCategory")}</Text>
          </Pressable>
          <ActionButton
            disabled={isSaving}
            label={isSaving ? t("common.saving") : t("budget.setup")}
            onPress={createBudgetAndSetup}
          />
        </View>
      ) : (
        <View style={[styles.emptyCard, isCompact && styles.emptyCardCompact]}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>＋</Text>
          </View>
          <Text style={styles.emptyTitle}>{t("budget.emptyTitle")}</Text>
          <Text style={styles.emptyDescription}>
            {t("budget.emptyDescription")}
          </Text>
          <View style={styles.emptySteps}>
            <Text style={styles.emptyStep}>{t("budget.emptyStepOne")}</Text>
            <Text style={styles.emptyStep}>{t("budget.emptyStepTwo")}</Text>
          </View>
          <ActionButton
            label={t("budget.createFirst")}
            onPress={() => setIsCreatingBudget(true)}
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
      {message}
    </Text>
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

function DashboardCard({
  label,
  value,
  recent,
  empty,
  format,
  onPress,
}: {
  label: string;
  value: string;
  recent: { label: string; date: string; amount: number }[];
  empty: string;
  format: Intl.NumberFormat;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.summaryItem}
    >
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      {recent.length ? (
        <View style={styles.cardRecentList}>
          {recent.map((item, index) => (
            <View key={`${item.date}-${index}`} style={styles.cardRecentItem}>
              <View style={styles.cardRecentText}>
                <Text numberOfLines={1} style={styles.cardRecentLabel}>
                  {item.label}
                </Text>
                <Text style={styles.cardRecentDate}>{item.date}</Text>
              </View>
              <Text style={styles.cardRecentAmount}>
                {format.format(item.amount)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.cardHint}>{empty}</Text>
      )}
      <Text style={styles.link}>{t("dashboard.openDetails")}</Text>
    </Pressable>
  );
}

function AnnualBarChart({ months }: { months: MonthlySummary[] }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const largestValue = Math.max(
    1,
    ...months.flatMap((month) => [month.income, month.expense]),
  );
  const numberFormat = new Intl.NumberFormat(language, {
    maximumFractionDigits: 2,
  });
  const monthFormat = new Intl.DateTimeFormat(language, { month: "short" });

  return (
    <View>
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.incomeSwatch]} />
          <Text style={styles.muted}>{t("dashboard.incomeLegend")}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.expenseSwatch]} />
          <Text style={styles.muted}>{t("dashboard.expenseLegend")}</Text>
        </View>
      </View>
      <View style={styles.chart}>
        {months.map((item) => {
          const date = new Date(`${item.month}-01T12:00:00`);
          const label = monthFormat.format(date).replace(".", "");
          const incomeHeight = Math.max(
            2,
            Math.round((item.income / largestValue) * 88),
          );
          const expenseHeight = Math.max(
            2,
            Math.round((item.expense / largestValue) * 88),
          );
          return (
            <View
              key={item.month}
              accessible
              accessibilityLabel={`${label}: ${t("dashboard.incomeLegend")} ${numberFormat.format(item.income)}, ${t("dashboard.expenseLegend")} ${numberFormat.format(item.expense)}`}
              style={styles.chartColumn}
            >
              <View style={styles.chartBars}>
                <View
                  style={[
                    styles.chartBar,
                    styles.incomeBar,
                    { height: incomeHeight },
                  ]}
                />
                <View
                  style={[
                    styles.chartBar,
                    styles.expenseBar,
                    { height: expenseHeight },
                  ]}
                />
              </View>
              <Text style={styles.chartMonth}>{label}</Text>
            </View>
          );
        })}
      </View>
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
  pageCompact: { paddingHorizontal: 16, paddingTop: 18 },
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
  headerCompact: { alignItems: "flex-start", flexDirection: "column" },
  headerActionsCompact: {
    alignItems: "flex-start",
    flexWrap: "wrap",
    rowGap: 10,
  },
  headerCreateButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
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
  detailHeader: { gap: 4, marginTop: 4, marginBottom: 4 },
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
  emptyCard: {
    padding: 28,
    backgroundColor: "#fff",
    borderColor: "#dce5dd",
    borderWidth: 1,
    borderRadius: 18,
    gap: 12,
    alignItems: "flex-start",
  },
  emptyCardCompact: { padding: 20 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e6f0e7",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconText: { color: "#285c3c", fontSize: 28, lineHeight: 32 },
  emptyTitle: { color: "#18291f", fontSize: 22, fontWeight: "700" },
  emptyDescription: { color: "#4c5d52", fontSize: 15, lineHeight: 23 },
  emptySteps: { gap: 8, paddingTop: 4 },
  emptyStep: { color: "#365643", fontSize: 14, lineHeight: 21 },
  formBack: {
    minHeight: 40,
    justifyContent: "center",
    alignSelf: "flex-start",
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
  inputInvalid: { borderColor: "#a33024" },
  fieldError: { color: "#a33024", fontSize: 13, lineHeight: 18 },
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
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  categoryItem: { gap: 4 },
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
  summaryCards: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  summaryCardsCompact: { flexDirection: "column" },
  summaryItem: {
    flex: 1,
    minWidth: 210,
    backgroundColor: "#fff",
    padding: 18,
    borderColor: "#dce5dd",
    borderWidth: 1,
    borderRadius: 14,
    gap: 8,
  },
  summaryValue: { color: "#18291f", fontSize: 18, fontWeight: "700" },
  cardHint: { color: "#627168", fontSize: 13, lineHeight: 19 },
  cardRecentList: { gap: 5, marginTop: 4 },
  cardRecentItem: {
    minHeight: 25,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardRecentText: { flex: 1, gap: 2 },
  cardRecentLabel: { flex: 1, color: "#365643", fontSize: 12 },
  cardRecentDate: { color: "#627168", fontSize: 11 },
  cardRecentAmount: { color: "#26382d", fontSize: 12, fontWeight: "600" },
  statisticsPreview: {
    padding: 18,
    backgroundColor: "#fff",
    borderColor: "#dce5dd",
    borderWidth: 1,
    borderRadius: 14,
    gap: 14,
  },
  statisticsHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  monthSummaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  inlineAction: { alignSelf: "flex-start", paddingTop: 12 },
  chartLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 8,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  incomeSwatch: { backgroundColor: "#285c3c" },
  expenseSwatch: { backgroundColor: "#d27b4b" },
  chart: {
    minHeight: 128,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 4,
    paddingTop: 14,
    borderBottomColor: "#dce5dd",
    borderBottomWidth: 1,
  },
  chartColumn: { flex: 1, minWidth: 0, alignItems: "center", gap: 6 },
  chartBars: {
    height: 100,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
  },
  chartBar: {
    width: 7,
    minHeight: 2,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  incomeBar: { backgroundColor: "#285c3c" },
  expenseBar: { backgroundColor: "#d27b4b" },
  chartMonth: { color: "#627168", fontSize: 10, textTransform: "capitalize" },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  balanceValue: { alignItems: "flex-end", gap: 2 },
  annualRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  annualInput: { gap: 4 },
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
