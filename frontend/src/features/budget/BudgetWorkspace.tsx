import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Circle, default as Svg } from "react-native-svg";
import {
  calculateAnnualSummary,
  calculateMonthlySummaries,
  calculateExpenseCategoryShares,
  calculateExpenseLabelShares,
  calculatePeriodCategoryBalances,
  periodsOverlappingYear,
  type AnnualSummary,
  type CategoryBalance,
  type ExpenseCategoryShare,
  type ExpenseLabelShare,
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
  type AllocationSet,
  type ExpenseEntry,
  type ExpenseLabel,
  type IncomeCorrection,
  type IncomeEntry,
  type IncomeSchedule,
  type IncomeScheduleFrequency,
  type MonthlyShortMonthBehavior,
} from "@/lib/spendwise-api";

type Props = { accessToken: string; onSignOut: () => void; userEmail?: string };
type DraftCategory = {
  categoryId?: string;
  name: string;
  percentage: string;
};
type MovementTab = "income" | "expense" | "adjustment";
type WorkspaceView =
  "budgets" | "dashboard" | "movement" | "statistics" | "invoices";
type MobileDestination = WorkspaceView | "profile";
type BudgetAllocationSummary = {
  items: { categoryId: string; name: string; percentage: number }[];
  loading: boolean;
  failed: boolean;
};

function summarizeAllocations(
  categories: BudgetCategory[],
  allocationSets: AllocationSet[],
): BudgetAllocationSummary["items"] {
  const activeSet = allocationSets.find((item) => item.status === "ACTIVE");
  if (!activeSet) return [];
  const percentages = new Map(
    activeSet.items.map((item) => [item.categoryId, item.percentage]),
  );
  return categories
    .filter((category) => !category.archived_at)
    .flatMap((category) => {
      const percentage = percentages.get(category.id);
      return percentage === undefined
        ? []
        : [{ categoryId: category.id, name: category.name, percentage }];
    });
}

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
  const isNative = Platform.OS !== "web";
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [archivedBudgets, setArchivedBudgets] = useState<Budget[]>([]);
  const [budgetAllocationSummaries, setBudgetAllocationSummaries] = useState<
    Record<string, BudgetAllocationSummary>
  >({});
  const budgetSummaryRequests = useRef(new Set<string>());
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [allocationSets, setAllocationSets] = useState<AllocationSet[]>([]);
  const [periods, setPeriods] = useState<BudgetPeriod[]>([]);
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [expenseLabelsByCategory, setExpenseLabelsByCategory] = useState<
    Record<string, ExpenseLabel[]>
  >({});
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [incomeCorrections, setIncomeCorrections] = useState<
    IncomeCorrection[]
  >([]);
  const [incomeSchedules, setIncomeSchedules] = useState<IncomeSchedule[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [requestedInvoices, setRequestedInvoices] = useState<ExpenseEntry[]>(
    [],
  );
  const [invoiceYear, setInvoiceYear] = useState(
    String(new Date().getFullYear()),
  );
  const [invoiceMonth, setInvoiceMonth] = useState("");
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);
  const [invoiceListFailed, setInvoiceListFailed] = useState(false);
  const [adjustments, setAdjustments] = useState<BudgetAdjustment[]>([]);
  const [annualYear, setAnnualYear] = useState(
    String(new Date().getFullYear()),
  );
  const [annualSummary, setAnnualSummary] = useState<AnnualSummary | null>(
    null,
  );
  const [annualSummaryBudgetId, setAnnualSummaryBudgetId] = useState("");
  const [annualMonths, setAnnualMonths] = useState<MonthlySummary[]>([]);
  const [dashboardMonthSummary, setDashboardMonthSummary] =
    useState<MonthlySummary | null>(null);
  const [dashboardMonthBudgetId, setDashboardMonthBudgetId] = useState("");
  const [dashboardMonthIncomes, setDashboardMonthIncomes] = useState<
    IncomeEntry[]
  >([]);
  const [dashboardMonthExpenses, setDashboardMonthExpenses] = useState<
    ExpenseEntry[]
  >([]);
  const [annualRefreshKey, setAnnualRefreshKey] = useState(0);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [workspaceLoadFailed, setWorkspaceLoadFailed] = useState(false);
  const [workspaceView, setWorkspaceView] =
    useState<WorkspaceView>("dashboard");
  const [isLoadingAnnual, setIsLoadingAnnual] = useState(false);
  const [tab, setTab] = useState<MovementTab>("income");
  const [isLoading, setIsLoading] = useState(true);
  const [budgetLoadFailed, setBudgetLoadFailed] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [isCreatingBudget, setIsCreatingBudget] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [confirmArchiveBudgetId, setConfirmArchiveBudgetId] = useState<
    string | null
  >(null);
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
  const [incomeDescription, setIncomeDescription] = useState("");
  const [movementCategoryId, setMovementCategoryId] = useState("");
  const [movementLabelId, setMovementLabelId] = useState("");
  const [newExpenseLabelName, setNewExpenseLabelName] = useState("");
  const [isAddingExpenseLabel, setIsAddingExpenseLabel] = useState(false);
  const [reclassifyingExpenseId, setReclassifyingExpenseId] = useState<
    string | null
  >(null);
  const [description, setDescription] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<
    "NOT_REQUESTED" | "REQUESTED"
  >("NOT_REQUESTED");
  const [supplierNipc, setSupplierNipc] = useState("");
  const [adjustmentSign, setAdjustmentSign] = useState<1 | -1>(1);
  const [reason, setReason] = useState("");
  const [correctionEntryId, setCorrectionEntryId] = useState<string | null>(
    null,
  );
  const [correctionAmount, setCorrectionAmount] = useState("");
  const [correctionSign, setCorrectionSign] = useState<1 | -1>(1);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionDate, setCorrectionDate] = useState(today());
  const workspaceRequestId = useRef(0);
  const movementRequestId = useRef(0);
  const annualRequestId = useRef(0);
  const invoiceRequestId = useRef(0);

  const selectedBudget = budgets.find(
    (budget) => budget.id === selectedBudgetId,
  );
  const activeAllocationSet = allocationSets.find(
    (allocationSet) => allocationSet.status === "ACTIVE",
  );
  const activeAllocationPercentages = new Map(
    activeAllocationSet?.items.map((item) => [
      item.categoryId,
      item.percentage,
    ]) ?? [],
  );
  const percentageFormat = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 2,
      }),
    [i18n.language],
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
    categories,
    incomes,
    expenses,
    adjustments,
    incomeCorrections,
  );
  const expenseCategoryShares =
    calculateExpenseCategoryShares(categoryBalances);
  const expenseLabelShares = calculateExpenseLabelShares(categories, expenses);
  const periodIncomeTotal =
    incomes.reduce((total, item) => total + item.amount, 0) +
    incomeCorrections.reduce((total, item) => total + item.amount_delta, 0);
  const periodExpenseTotal = expenses.reduce(
    (total, item) => total + item.amount,
    0,
  );
  const periodAdjustmentTotal = adjustments.reduce(
    (total, item) => total + item.amount_delta,
    0,
  );
  const periodRemaining =
    periodIncomeTotal - periodExpenseTotal + periodAdjustmentTotal;
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const currentMonthIncomes = dashboardMonthIncomes
    .filter((item) => item.occurred_on.startsWith(currentMonthKey))
    .sort((left, right) => right.occurred_on.localeCompare(left.occurred_on));
  const currentMonthExpenses = dashboardMonthExpenses
    .filter((item) => item.spent_on.startsWith(currentMonthKey))
    .sort((left, right) => right.spent_on.localeCompare(left.spent_on));
  const currentMonthSummary = dashboardMonthSummary;
  const currentMonthLabel = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    year: "numeric",
  }).format(new Date());
  const annualHasActivity = annualMonths.some(
    (item) => item.income !== 0 || item.expense !== 0 || item.adjustment !== 0,
  );
  const dashboardStatsReady = dashboardMonthBudgetId === selectedBudgetId;

  const loadBudgets = useCallback(async () => {
    const nextBudgets = await spendwiseApi.listBudgets(accessToken);
    const activeBudgets = nextBudgets.filter((budget) => !budget.archived_at);
    setBudgets(activeBudgets);
    setArchivedBudgets(nextBudgets.filter((budget) => budget.archived_at));
    setSelectedBudgetId((current) =>
      activeBudgets.some((budget) => budget.id === current)
        ? current
        : (activeBudgets[0]?.id ?? ""),
    );
  }, [accessToken]);

  const loadWorkspace = useCallback(
    async (budgetId = selectedBudgetId) => {
      if (!budgetId) return;
      const requestId = ++workspaceRequestId.current;
      setIsLoadingWorkspace(true);
      setWorkspaceLoadFailed(false);
      try {
        const [nextPeriods, nextCategories, nextSchedules, nextAllocationSets] =
          await Promise.all([
            spendwiseApi.listPeriods(accessToken, budgetId),
            spendwiseApi.listCategories(accessToken, budgetId),
            allPages((offset) =>
              spendwiseApi.listIncomeSchedules(accessToken, budgetId, offset),
            ),
            spendwiseApi.listAllocationSets(accessToken, budgetId),
          ]);
        const labelGroups = await Promise.all(
          nextCategories.map(
            async (category) =>
              [
                category.id,
                await spendwiseApi.listExpenseLabels(
                  accessToken,
                  budgetId,
                  category.id,
                ),
              ] as const,
          ),
        );
        if (requestId !== workspaceRequestId.current) return;
        setPeriods(nextPeriods);
        setCategories(nextCategories);
        setExpenseLabelsByCategory(Object.fromEntries(labelGroups));
        setIncomeSchedules(nextSchedules);
        setAllocationSets(nextAllocationSets);
        setBudgetAllocationSummaries((current) => ({
          ...current,
          [budgetId]: {
            items: summarizeAllocations(nextCategories, nextAllocationSets),
            loading: false,
            failed: false,
          },
        }));
        setSelectedPeriodId((current) =>
          nextPeriods.some((period) => period.id === current)
            ? current
            : (nextPeriods[0]?.id ?? ""),
        );
      } catch (error) {
        if (requestId !== workspaceRequestId.current) return;
        setWorkspaceLoadFailed(true);
        throw error;
      } finally {
        if (requestId === workspaceRequestId.current) {
          setIsLoadingWorkspace(false);
        }
      }
    },
    [accessToken, selectedBudgetId],
  );

  const loadMovements = useCallback(async () => {
    if (!selectedBudgetId || !selectedPeriodId) return;
    const requestId = ++movementRequestId.current;
    try {
      const [
        nextIncomes,
        nextExpenses,
        nextAdjustments,
        nextIncomeCorrections,
      ] = await Promise.all([
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
        allPages((offset) =>
          spendwiseApi.listIncomeCorrections(
            accessToken,
            selectedBudgetId,
            selectedPeriodId,
            offset,
          ),
        ),
      ]);
      if (requestId !== movementRequestId.current) return;
      setIncomes(nextIncomes);
      setExpenses(nextExpenses);
      setAdjustments(nextAdjustments);
      setIncomeCorrections(nextIncomeCorrections);
    } catch (error) {
      if (requestId !== movementRequestId.current) return;
      throw error;
    }
  }, [accessToken, selectedBudgetId, selectedPeriodId]);

  const loadRequestedInvoices = useCallback(
    async (yearValue = invoiceYear, monthValue = invoiceMonth) => {
      if (!selectedBudgetId) return;
      if (!/^[0-9]{4}$/.test(yearValue) || Number(yearValue) < 1) {
        setFieldErrors((current) => ({
          ...current,
          invoiceYear: t("movement.invoiceYearInvalid"),
        }));
        return;
      }
      const trimmedMonth = monthValue.trim();
      const month = trimmedMonth ? Number(trimmedMonth) : null;
      if (
        trimmedMonth &&
        (!/^[0-9]{1,2}$/.test(trimmedMonth) ||
          month === null ||
          !Number.isInteger(month) ||
          month < 1 ||
          month > 12)
      ) {
        setFieldErrors((current) => ({
          ...current,
          invoiceMonth: t("movement.invoiceMonthInvalid"),
        }));
        return;
      }

      setFieldErrors((current) => {
        const next = { ...current };
        delete next.invoiceYear;
        delete next.invoiceMonth;
        return next;
      });
      const requestId = ++invoiceRequestId.current;
      setIsLoadingInvoices(true);
      setInvoiceListFailed(false);
      try {
        const entries = await allPages((offset) =>
          spendwiseApi.listRequestedInvoices(
            accessToken,
            selectedBudgetId,
            Number(yearValue),
            month,
            offset,
          ),
        );
        if (requestId === invoiceRequestId.current) {
          setRequestedInvoices(entries);
        }
      } catch {
        if (requestId === invoiceRequestId.current) {
          setInvoiceListFailed(true);
          setRequestedInvoices([]);
        }
      } finally {
        if (requestId === invoiceRequestId.current) {
          setIsLoadingInvoices(false);
        }
      }
    },
    [accessToken, invoiceMonth, invoiceYear, selectedBudgetId, t],
  );

  useEffect(() => {
    let active = true;
    spendwiseApi
      .listBudgets(accessToken)
      .then((nextBudgets) => {
        if (!active) return;
        const visible = nextBudgets.filter((budget) => !budget.archived_at);
        setBudgets(visible);
        setArchivedBudgets(nextBudgets.filter((budget) => budget.archived_at));
        setSelectedBudgetId((current) =>
          visible.some((budget) => budget.id === current)
            ? current
            : (visible[0]?.id ?? ""),
        );
      })
      .catch((error: unknown) => {
        if (active) {
          setBudgetLoadFailed(true);
          setIsError(true);
          setNotice(
            error instanceof SpendWiseApiError && error.status === 401
              ? t("budget.sessionError")
              : error instanceof SpendWiseApiError && error.status === 0
                ? t("budget.apiUnavailable")
                : t("budget.apiError"),
          );
        }
      })
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [accessToken, t]);

  useEffect(() => {
    if (workspaceView !== "budgets" || !budgets.length) return;
    const missingBudgets = budgets.filter(
      (budget) =>
        !budgetAllocationSummaries[budget.id] &&
        !budgetSummaryRequests.current.has(budget.id),
    );
    if (!missingBudgets.length) return;

    for (const budget of missingBudgets) {
      budgetSummaryRequests.current.add(budget.id);
    }
    setBudgetAllocationSummaries((current) => ({
      ...current,
      ...Object.fromEntries(
        missingBudgets.map((budget) => [
          budget.id,
          { items: [], loading: true, failed: false },
        ]),
      ),
    }));

    void Promise.all(
      missingBudgets.map(async (budget) => {
        try {
          const [nextCategories, nextAllocationSets] = await Promise.all([
            spendwiseApi.listCategories(accessToken, budget.id),
            spendwiseApi.listAllocationSets(accessToken, budget.id),
          ]);
          return {
            budgetId: budget.id,
            summary: {
              items: summarizeAllocations(nextCategories, nextAllocationSets),
              loading: false,
              failed: false,
            },
          };
        } catch {
          return {
            budgetId: budget.id,
            summary: { items: [], loading: false, failed: true },
          };
        } finally {
          budgetSummaryRequests.current.delete(budget.id);
        }
      }),
    ).then((results) => {
      setBudgetAllocationSummaries((current) => ({
        ...current,
        ...Object.fromEntries(
          results.map(({ budgetId, summary }) => [budgetId, summary]),
        ),
      }));
    });
  }, [accessToken, budgetAllocationSummaries, budgets, workspaceView]);

  useEffect(() => {
    if (!selectedBudgetId) return;
    const timer = setTimeout(() => {
      void loadWorkspace().catch((error: unknown) => {
        setIsError(true);
        setNotice(
          error instanceof SpendWiseApiError && error.status === 401
            ? t("budget.sessionError")
            : error instanceof SpendWiseApiError && error.status === 0
              ? t("budget.apiUnavailable")
              : error instanceof SpendWiseApiError
                ? t("budget.apiOperationError")
                : t("budget.loadError"),
        );
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [loadWorkspace, selectedBudgetId, t]);

  useEffect(() => {
    if (workspaceView === "budgets") return;
    const timer = setTimeout(() => {
      void loadMovements().catch((error: unknown) => {
        setIsError(true);
        setNotice(
          error instanceof SpendWiseApiError && error.status === 401
            ? t("budget.sessionError")
            : error instanceof SpendWiseApiError && error.status === 0
              ? t("budget.apiUnavailable")
              : error instanceof SpendWiseApiError
                ? t("budget.apiOperationError")
                : t("movement.loadError"),
        );
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [loadMovements, t, workspaceView]);

  const formatAmount = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: selectedBudget?.currency_code ?? currency,
        maximumFractionDigits: 4,
      }),
    [currency, i18n.language, selectedBudget?.currency_code],
  );

  async function retryBudgetLoad() {
    setIsLoading(true);
    setBudgetLoadFailed(false);
    setNotice("");
    try {
      const nextBudgets = await spendwiseApi.listBudgets(accessToken);
      const visible = nextBudgets.filter((budget) => !budget.archived_at);
      setBudgets(visible);
      setArchivedBudgets(nextBudgets.filter((budget) => budget.archived_at));
      setSelectedBudgetId((current) =>
        visible.some((budget) => budget.id === current)
          ? current
          : (visible[0]?.id ?? ""),
      );
    } catch (error) {
      setBudgetLoadFailed(true);
      setIsError(true);
      setNotice(
        error instanceof SpendWiseApiError && error.status === 401
          ? t("budget.sessionError")
          : error instanceof SpendWiseApiError && error.status === 0
            ? t("budget.apiUnavailable")
            : t("budget.apiError"),
      );
    } finally {
      setIsLoading(false);
    }
  }

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
    if (tab === "expense" && !movementLabelId) {
      nextFieldErrors.movementLabel = t("movement.labelRequired");
    }
    if (
      tab === "expense" &&
      invoiceStatus === "REQUESTED" &&
      !/^[0-9]{9}$/.test(supplierNipc)
    ) {
      nextFieldErrors.supplierNipc = t("movement.supplierNipcRequired");
    }
    if (tab === "adjustment" && !reason.trim()) {
      nextFieldErrors.movementReason = t("movement.reasonRequired");
    }
    setFieldErrors(nextFieldErrors);
    if (!parsedAmount || Object.keys(nextFieldErrors).length) {
      return;
    }
    setIsSaving(true);
    let movementSaved = false;
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
              description: incomeDescription.trim() || null,
            },
          );
          movementSaved = true;
          setNotice(t("schedule.created"));
          setScheduleEndDate("");
          await loadWorkspace();
          setIncomeDescription("");
        } else {
          await spendwiseApi.createIncome(accessToken, selectedBudgetId, {
            period_id: selectedPeriodId,
            amount: parsedAmount,
            occurred_on: movementDate,
            description: incomeDescription.trim() || null,
          });
          movementSaved = true;
          setNotice(t("movement.incomeSaved"));
        }
      } else if (tab === "expense") {
        await spendwiseApi.createExpense(accessToken, selectedBudgetId, {
          period_id: selectedPeriodId,
          category_id: movementCategoryId,
          label_id: movementLabelId,
          amount: parsedAmount,
          spent_on: movementDate,
          description: description.trim() || null,
          invoice_status: invoiceStatus,
          supplier_nipc: invoiceStatus === "REQUESTED" ? supplierNipc : null,
        });
        movementSaved = true;
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
        movementSaved = true;
        setNotice(t("movement.adjustmentSaved"));
      }
      setAmount("");
      setDescription("");
      setInvoiceStatus("NOT_REQUESTED");
      setSupplierNipc("");
      setIncomeDescription("");
      setReason("");
      await loadMovements();
      setAnnualRefreshKey((current) => current + 1);
    } catch {
      setIsError(true);
      setNotice(
        movementSaved
          ? t("movement.savedRefreshError")
          : t("movement.saveError"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function addExpenseLabel() {
    const name = newExpenseLabelName.trim();
    if (!selectedBudgetId || !movementCategoryId || !name) {
      setFieldErrors((current) => ({
        ...current,
        newExpenseLabel: t("movement.labelNameRequired"),
      }));
      return;
    }
    setIsSaving(true);
    try {
      const created = await spendwiseApi.createExpenseLabel(
        accessToken,
        selectedBudgetId,
        movementCategoryId,
        name,
      );
      setExpenseLabelsByCategory((current) => ({
        ...current,
        [movementCategoryId]: [
          ...(current[movementCategoryId] ?? []),
          created,
        ].sort((left, right) => left.name.localeCompare(right.name)),
      }));
      setMovementLabelId(created.id);
      setNewExpenseLabelName("");
      setIsAddingExpenseLabel(false);
      setFieldErrors((current) => {
        const next = { ...current };
        delete next.movementLabel;
        delete next.newExpenseLabel;
        return next;
      });
    } catch {
      setFieldErrors((current) => ({
        ...current,
        newExpenseLabel: t("movement.labelCreateError"),
      }));
    } finally {
      setIsSaving(false);
    }
  }

  async function reclassifyExpense(expense: ExpenseEntry, labelId: string) {
    if (!selectedBudgetId) return;
    setIsSaving(true);
    try {
      const updated = await spendwiseApi.updateExpenseLabel(
        accessToken,
        selectedBudgetId,
        expense.id,
        labelId,
      );
      setExpenses((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setReclassifyingExpenseId(null);
    } catch {
      setIsError(true);
      setNotice(t("movement.labelUpdateError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function submitIncomeCorrection(income: IncomeEntry) {
    if (!selectedBudgetId) return;
    setNotice("");
    setIsError(false);
    const parsedAmount = numberValue(correctionAmount);
    const nextFieldErrors: Record<string, string> = {};
    const selectedPeriod = periods.find(
      (period) => period.id === selectedPeriodId,
    );
    if (!parsedAmount) {
      nextFieldErrors.incomeCorrectionAmount = t("movement.amountInvalid");
    }
    if (
      !selectedPeriod ||
      !isValidDate(correctionDate) ||
      correctionDate < selectedPeriod.starts_on ||
      correctionDate > selectedPeriod.ends_on
    ) {
      nextFieldErrors.incomeCorrectionDate = t(
        "movement.correctionDateInvalid",
      );
    }
    if (!correctionReason.trim()) {
      nextFieldErrors.incomeCorrectionReason = t(
        "movement.correctionDescriptionRequired",
      );
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length || !parsedAmount) return;

    setIsSaving(true);
    let correctionSaved = false;
    try {
      await spendwiseApi.createIncomeCorrection(
        accessToken,
        selectedBudgetId,
        income.id,
        {
          period_id: selectedPeriodId,
          amount_delta: parsedAmount * correctionSign,
          occurred_on: correctionDate,
          reason: correctionReason.trim(),
        },
      );
      correctionSaved = true;
      setCorrectionAmount("");
      setCorrectionReason("");
      setCorrectionEntryId(null);
      setNotice(t("movement.incomeCorrectionSaved"));
      await loadMovements();
      setAnnualRefreshKey((current) => current + 1);
    } catch {
      setIsError(true);
      setNotice(
        correctionSaved
          ? t("movement.savedRefreshError")
          : t("movement.incomeCorrectionError"),
      );
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

    const requestId = ++annualRequestId.current;
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
      const annualIncomeCorrections: IncomeCorrection[] = [];
      for (const period of relevantPeriods) {
        const [
          periodIncomes,
          periodExpenses,
          periodAdjustments,
          periodIncomeCorrections,
        ] = await Promise.all([
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
          allPages((offset) =>
            spendwiseApi.listIncomeCorrections(
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
        annualIncomeCorrections.push(...periodIncomeCorrections);
      }
      if (requestId !== annualRequestId.current) return;
      const nextAnnualSummary = calculateAnnualSummary(
        year,
        annualIncomes,
        annualExpenses,
        annualAdjustments,
        annualIncomeCorrections,
      );
      const nextAnnualMonths = calculateMonthlySummaries(
        year,
        annualIncomes,
        annualExpenses,
        annualAdjustments,
        annualIncomeCorrections,
      );
      setAnnualSummary(nextAnnualSummary);
      setAnnualMonths(nextAnnualMonths);
      setAnnualSummaryBudgetId(selectedBudgetId);
      if (year === new Date().getFullYear()) {
        const currentMonth = nextAnnualMonths.find(
          (month) => month.month === currentMonthKey,
        );
        setDashboardMonthSummary(currentMonth ?? null);
        setDashboardMonthBudgetId(selectedBudgetId);
        setDashboardMonthIncomes(annualIncomes);
        setDashboardMonthExpenses(annualExpenses);
      }
    } catch {
      if (requestId !== annualRequestId.current) return;
      setIsError(true);
      setNotice(t("dashboard.loadError"));
    } finally {
      if (requestId === annualRequestId.current) setIsLoadingAnnual(false);
    }
  }, [accessToken, annualYear, currentMonthKey, periods, selectedBudgetId, t]);

  useEffect(() => {
    if (
      !selectedBudgetId ||
      !periods.length ||
      !/^\d{4}$/.test(annualYear) ||
      Number(annualYear) < 1 ||
      (workspaceView !== "dashboard" && workspaceView !== "statistics")
    )
      return;
    const timer = setTimeout(
      () => {
        void Promise.resolve().then(loadAnnualSummary);
      },
      workspaceView === "dashboard" ? 450 : 0,
    );
    return () => clearTimeout(timer);
  }, [
    annualRefreshKey,
    annualYear,
    loadAnnualSummary,
    periods.length,
    selectedBudgetId,
    workspaceView,
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

  async function startEditingBudget(budget: Budget) {
    if (budget.current_user_role !== "OWNER") return;
    setIsSaving(true);
    setNotice("");
    setIsError(false);
    try {
      const [nextCategories, nextAllocationSets] = await Promise.all([
        spendwiseApi.listCategories(accessToken, budget.id),
        spendwiseApi.listAllocationSets(accessToken, budget.id),
      ]);
      const activeSet = nextAllocationSets.find(
        (allocationSet) => allocationSet.status === "ACTIVE",
      );
      const percentages = new Map(
        activeSet?.items.map((item) => [item.categoryId, item.percentage]) ??
          [],
      );
      const activeBudgetCategories = nextCategories.filter(
        (category) => !category.archived_at,
      );
      setSelectedBudgetId(budget.id);
      setCategories(nextCategories);
      setAllocationSets(nextAllocationSets);
      setBudgetName(budget.name);
      setDraftCategories(
        activeBudgetCategories.length
          ? activeBudgetCategories.map((category) => ({
              categoryId: category.id,
              name: category.name,
              percentage: String(percentages.get(category.id) ?? 0),
            }))
          : [{ name: "", percentage: "100" }],
      );
      setCategoryNameErrors([]);
      setCategoryPercentageErrors([]);
      setAllocationTotalError(false);
      setFieldErrors({});
      setEditingBudgetId(budget.id);
    } catch {
      setIsError(true);
      setNotice(t("budget.manageLoadError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function saveBudgetChanges() {
    if (!editingBudgetId) return;
    const missingCategoryNames = draftCategories.flatMap((category, index) =>
      category.name.trim() ? [] : [index],
    );
    const invalidCategoryPercentages = draftCategories.flatMap(
      (category, index) =>
        Number(category.percentage.replace(",", ".")) > 0 ? [] : [index],
    );
    const nextFieldErrors: Record<string, string> = {};
    if (!budgetName.trim()) {
      nextFieldErrors.budgetName = t("budget.nameRequired");
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
    setIsError(false);
    setNotice("");
    try {
      const currentCategories = categories.filter(
        (category) => !category.archived_at,
      );
      const selectedCategoryIds = new Set<string>();
      const configuredCategories: BudgetCategory[] = [];
      for (const draft of draftCategories) {
        const name = draft.name.trim();
        const currentCategory = draft.categoryId
          ? currentCategories.find(
              (category) => category.id === draft.categoryId,
            )
          : undefined;
        const savedCategory = currentCategory
          ? currentCategory.name === name
            ? currentCategory
            : await spendwiseApi.renameCategory(
                accessToken,
                editingBudgetId,
                currentCategory.id,
                name,
              )
          : await spendwiseApi.createCategory(
              accessToken,
              editingBudgetId,
              name,
            );
        selectedCategoryIds.add(savedCategory.id);
        configuredCategories.push(savedCategory);
      }

      const nextAllocationSet = await spendwiseApi.createAllocationSet(
        accessToken,
        editingBudgetId,
        configuredCategories.map((category, index) => ({
          categoryId: category.id,
          percentage: Number(
            draftCategories[index].percentage.replace(",", "."),
          ),
        })),
      );
      await spendwiseApi.activateAllocationSet(
        accessToken,
        editingBudgetId,
        nextAllocationSet.id,
      );

      for (const category of currentCategories) {
        if (!selectedCategoryIds.has(category.id)) {
          await spendwiseApi.archiveCategory(
            accessToken,
            editingBudgetId,
            category.id,
          );
        }
      }
      await spendwiseApi.renameBudget(
        accessToken,
        editingBudgetId,
        budgetName.trim(),
      );
      await Promise.all([loadBudgets(), loadWorkspace(editingBudgetId)]);
      setEditingBudgetId(null);
      setCategoryNameErrors([]);
      setCategoryPercentageErrors([]);
      setAllocationTotalError(false);
      setNotice(t("budget.manageSaved"));
    } catch {
      setIsError(true);
      setNotice(t("budget.manageSaveError"));
      await Promise.all([
        loadBudgets().catch(() => undefined),
        loadWorkspace(editingBudgetId).catch(() => undefined),
      ]);
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveBudget() {
    if (!confirmArchiveBudgetId) return;
    setIsSaving(true);
    setIsError(false);
    setNotice("");
    try {
      await spendwiseApi.archiveBudget(accessToken, confirmArchiveBudgetId);
      if (selectedBudgetId === confirmArchiveBudgetId) {
        setWorkspaceView("budgets");
      }
      await loadBudgets();
      setConfirmArchiveBudgetId(null);
      setNotice(t("budget.archived"));
    } catch {
      setIsError(true);
      setNotice(t("budget.archiveError"));
    } finally {
      setIsSaving(false);
    }
  }

  async function restoreBudget(budgetId: string) {
    setIsSaving(true);
    setIsError(false);
    setNotice("");
    try {
      await spendwiseApi.restoreBudget(accessToken, budgetId);
      await loadBudgets();
      setNotice(t("budget.restored"));
    } catch {
      setIsError(true);
      setNotice(t("budget.restoreError"));
    } finally {
      setIsSaving(false);
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
    if (budgetId === selectedBudgetId) return;
    workspaceRequestId.current += 1;
    movementRequestId.current += 1;
    annualRequestId.current += 1;
    setSelectedBudgetId(budgetId);
    setIsLoadingWorkspace(true);
    setIsLoadingAnnual(false);
    setWorkspaceLoadFailed(false);
    setSelectedPeriodId("");
    setPeriods([]);
    setCategories([]);
    setAllocationSets([]);
    setIncomes([]);
    setIncomeCorrections([]);
    setExpenses([]);
    setAdjustments([]);
    setCorrectionEntryId(null);
    setAnnualSummary(null);
    setAnnualSummaryBudgetId("");
    setAnnualMonths([]);
    setDashboardMonthSummary(null);
    setDashboardMonthBudgetId("");
    setDashboardMonthIncomes([]);
    setDashboardMonthExpenses([]);
    invoiceRequestId.current += 1;
    setRequestedInvoices([]);
    setInvoiceListFailed(false);
    setWorkspaceView("dashboard");
  }

  function selectPeriod(periodId: string) {
    movementRequestId.current += 1;
    setSelectedPeriodId(periodId);
    setIncomes([]);
    setIncomeCorrections([]);
    setExpenses([]);
    setAdjustments([]);
    setCorrectionEntryId(null);
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
    if (isNative) {
      return (
        <View style={styles.mobileWorkspaceShell}>
          <AccountSettings
            accessToken={accessToken}
            onBack={() => setShowAccountSettings(false)}
            onSignOut={onSignOut}
            showBack={false}
          />
          {!isCreatingBudget ? (
            <MobileNavigation
              current="profile"
              onSelect={(destination) => {
                if (destination === "profile") return;
                setShowAccountSettings(false);
                setWorkspaceView(destination);
              }}
              t={t}
            />
          ) : null}
        </View>
      );
    }
    return (
      <AccountSettings
        accessToken={accessToken}
        onBack={() => setShowAccountSettings(false)}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <View style={styles.mobileWorkspaceShell}>
      <ScrollView
        contentContainerStyle={[
          styles.page,
          isCompact && styles.pageCompact,
          isNative && styles.pageNative,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={!isNative}
      >
        <View style={[styles.header, isCompact && styles.headerCompact]}>
          <View>
            {!isNative ? <Text style={styles.eyebrow}>SPENDWISE</Text> : null}
            <Text style={[styles.brand, isCompact && styles.brandCompact]}>
              {t("budget.title")}
            </Text>
          </View>
          <View
            style={[
              styles.headerActions,
              isCompact && styles.headerActionsCompact,
            ]}
          >
            <LanguageSwitcher />
            {!isNative && budgets.length > 0 && !editingBudgetId ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsCreatingBudget(true)}
                style={styles.headerCreateButton}
              >
                <Text style={styles.link}>{t("budget.new")}</Text>
              </Pressable>
            ) : null}
            {!isNative ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("account.openSettings")}
                  onPress={() => setShowAccountSettings(true)}
                >
                  <Text style={styles.link}>{t("account.openSettings")}</Text>
                </Pressable>
                <Pressable
                  onPress={onSignOut}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.signOut")}
                >
                  <Text style={styles.link}>{t("common.signOut")}</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
        {userEmail && !isNative ? (
          <Text style={styles.muted}>{userEmail}</Text>
        ) : null}
        <View style={[styles.disclaimer, isNative && styles.disclaimerCompact]}>
          <Text style={styles.disclaimerTitle}>{t("budget.virtualTitle")}</Text>
          <Text style={styles.disclaimerText}>{t("budget.virtualNotice")}</Text>
        </View>
        {notice && !budgetLoadFailed ? (
          <Text
            accessibilityLiveRegion="polite"
            style={isError ? styles.error : styles.notice}
          >
            {notice}
          </Text>
        ) : null}

        {!isNative &&
        !isCreatingBudget &&
        !editingBudgetId &&
        !budgetLoadFailed &&
        workspaceView !== "dashboard" ? (
          <BackToDashboardButton
            label={t("dashboard.backToDashboard")}
            onPress={() => setWorkspaceView("dashboard")}
          />
        ) : null}

        {budgetLoadFailed ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t("budget.apiErrorTitle")}</Text>
            <Text style={styles.emptyDescription}>{notice}</Text>
            <ActionButton
              disabled={isLoading}
              label={t("common.retry")}
              onPress={() => void retryBudgetLoad()}
            />
          </View>
        ) : workspaceView === "budgets" &&
          !isCreatingBudget &&
          !editingBudgetId ? (
          <View style={styles.budgetHub}>
            <Text style={styles.sectionTitle}>{t("budget.title")}</Text>
            <Text style={styles.muted}>{t("budget.select")}</Text>
            {budgets.length ? (
              budgets.map((budget) => (
                <View key={budget.id} style={styles.budgetHubEntry}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: budget.id === selectedBudgetId,
                    }}
                    onPress={() => {
                      selectBudget(budget.id);
                      setWorkspaceView("dashboard");
                    }}
                    style={[
                      styles.budgetHubItem,
                      budget.id === selectedBudgetId &&
                        styles.budgetHubItemSelected,
                    ]}
                  >
                    <View style={styles.entryText}>
                      <Text style={styles.entryTitle}>{budget.name}</Text>
                      <Text style={styles.muted}>
                        {budget.budget_type === "SHARED"
                          ? t("budget.shared")
                          : t("budget.personal")}{" "}
                        · {budget.currency_code}
                      </Text>
                      {budgetAllocationSummaries[budget.id]?.loading ? (
                        <Text style={styles.budgetAllocationHint}>
                          {t("common.loading")}
                        </Text>
                      ) : budgetAllocationSummaries[budget.id]?.failed ? (
                        <Text style={styles.budgetAllocationHint}>
                          {t("budget.summaryLoadError")}
                        </Text>
                      ) : budgetAllocationSummaries[budget.id]?.items.length ? (
                        <View style={styles.budgetAllocationTags}>
                          {budgetAllocationSummaries[budget.id].items.map(
                            (item) => (
                              <Text
                                key={item.categoryId}
                                style={styles.budgetAllocationTag}
                              >
                                {item.name} ·{" "}
                                {percentageFormat.format(item.percentage)}%
                              </Text>
                            ),
                          )}
                        </View>
                      ) : (
                        <Text style={styles.budgetAllocationHint}>
                          {t("budget.noAllocation")}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.budgetHubArrow}>›</Text>
                  </Pressable>
                  {budget.current_user_role === "OWNER" ? (
                    <View style={styles.budgetManageActions}>
                      <SecondaryActionButton
                        label={t("budget.edit")}
                        onPress={() => void startEditingBudget(budget)}
                      />
                      <ArchiveActionButton
                        label={t("budget.archive")}
                        onPress={() => setConfirmArchiveBudgetId(budget.id)}
                      />
                    </View>
                  ) : null}
                  {confirmArchiveBudgetId === budget.id ? (
                    <View style={styles.archiveConfirmation}>
                      <Text style={styles.muted}>
                        {t("budget.archiveConfirm", { name: budget.name })}
                      </Text>
                      <View style={styles.budgetManageActions}>
                        <CancelActionButton
                          label={t("common.cancel")}
                          onPress={() => setConfirmArchiveBudgetId(null)}
                        />
                        <ArchiveActionButton
                          disabled={isSaving}
                          label={t("budget.confirmArchive")}
                          onPress={() => void archiveBudget()}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <View
                style={[styles.emptyCard, isCompact && styles.emptyCardCompact]}
              >
                <Text style={styles.emptyTitle}>{t("budget.emptyTitle")}</Text>
                <Text style={styles.emptyDescription}>
                  {t("budget.emptyDescription")}
                </Text>
                <ActionButton
                  label={t("budget.createFirst")}
                  onPress={() => setIsCreatingBudget(true)}
                />
              </View>
            )}
            {budgets.length ? (
              <ActionButton
                label={t("budget.new")}
                onPress={() => setIsCreatingBudget(true)}
              />
            ) : null}
            {archivedBudgets.length ? (
              <View style={styles.archivedBudgetSection}>
                <Text style={styles.sectionTitle}>
                  {t("budget.archivedTitle")}
                </Text>
                {archivedBudgets.map((budget) => (
                  <View key={budget.id} style={styles.archivedBudgetItem}>
                    <View style={styles.entryText}>
                      <Text style={styles.entryTitle}>{budget.name}</Text>
                      <Text style={styles.muted}>
                        {t("budget.archivedStatus")} · {budget.currency_code}
                      </Text>
                    </View>
                    {budget.current_user_role === "OWNER" ? (
                      <ActionButton
                        disabled={isSaving}
                        label={t("budget.restore")}
                        onPress={() => void restoreBudget(budget.id)}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : budgets.length > 0 && !isCreatingBudget && !editingBudgetId ? (
          <>
            <Text style={styles.sectionTitle}>{t("budget.select")}</Text>
            {isNative ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.rowWrap}>
                  {budgets.map((budget) => (
                    <Choice
                      key={budget.id}
                      label={budget.name}
                      selected={budget.id === selectedBudgetId}
                      onPress={() => selectBudget(budget.id)}
                    />
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("budget.new")}
                    onPress={() => setIsCreatingBudget(true)}
                    style={[styles.choice, styles.newBudgetChoice]}
                  >
                    <Text style={styles.choiceText}>＋</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
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
            )}
            {selectedBudget ? (
              <Text style={styles.muted}>
                {selectedBudget.budget_type === "SHARED"
                  ? t("budget.shared")
                  : t("budget.personal")}{" "}
                · {selectedBudget.currency_code}
              </Text>
            ) : null}
            {!isNative && workspaceView === "dashboard" ? (
              <SecondaryActionButton
                label={t("budget.openList")}
                onPress={() => setWorkspaceView("budgets")}
              />
            ) : null}
            {isNative && workspaceView === "movement" ? (
              <MovementTypeSelector
                selected={tab}
                onSelect={(item) => {
                  setTab(item);
                  setFieldErrors({});
                }}
                t={t}
              />
            ) : null}
            {workspaceView !== "dashboard" ? (
              <View style={styles.detailHeader}>
                <Text style={styles.sectionTitle}>
                  {workspaceView === "statistics"
                    ? t("dashboard.statisticsTitle")
                    : workspaceView === "invoices"
                      ? t("movement.invoiceListTitle")
                      : t(`movement.${tab}`)}
                </Text>
                <Text style={styles.muted}>
                  {workspaceView === "invoices"
                    ? t("movement.invoiceListDescription")
                    : t("dashboard.detailDescription")}
                </Text>
              </View>
            ) : null}
            {selectedBudget?.budget_type === "SHARED" ? (
              <BudgetInvitations
                accessToken={accessToken}
                budgetId={selectedBudget.id}
              />
            ) : null}
            {isLoadingWorkspace ? (
              <View style={styles.card}>
                <Text style={styles.muted}>{t("common.loading")}</Text>
              </View>
            ) : workspaceLoadFailed ? (
              <View style={styles.card}>
                <Text style={styles.error}>{t("budget.loadError")}</Text>
                <ActionButton
                  label={t("common.retry")}
                  onPress={() => void loadWorkspace().catch(() => undefined)}
                />
              </View>
            ) : workspaceView === "invoices" ? null : periods.length ? (
              <>
                <Text style={styles.sectionTitle}>{t("budget.period")}</Text>
                <View style={styles.rowWrap}>
                  {periods.map((period) => (
                    <Choice
                      key={period.id}
                      label={`${period.starts_on} – ${period.ends_on}`}
                      selected={period.id === selectedPeriodId}
                      disabled={workspaceView === "dashboard"}
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
            {!activeCategories.length && workspaceView !== "invoices" ? (
              <Text style={styles.muted}>{t("budget.noAllocation")}</Text>
            ) : null}
            {canRecordMovements || workspaceView === "invoices" ? (
              <>
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
                        compact={isCompact}
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
                        recent={currentMonthExpenses
                          .slice(0, 2)
                          .map((item) => ({
                            label: `${categories.find((category) => category.id === item.category_id)?.name ?? t("movement.expense")} · ${item.description ?? ""}`,
                            date: item.spent_on,
                            amount: -item.amount,
                          }))}
                        empty={t("dashboard.recentExpenseEmpty")}
                        format={formatAmount}
                        compact={isCompact}
                        onPress={() => {
                          setTab("expense");
                          setWorkspaceView("movement");
                        }}
                      />
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setWorkspaceView("statistics")}
                        style={[
                          styles.summaryItem,
                          isCompact && styles.summaryItemWideCompact,
                        ]}
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
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("dashboard.invoiceCardTitle")}
                      onPress={() => {
                        setInvoiceMonth("");
                        setRequestedInvoices([]);
                        setInvoiceListFailed(false);
                        setWorkspaceView("invoices");
                        void loadRequestedInvoices(invoiceYear, "");
                      }}
                      style={[styles.card, styles.invoiceDashboardCard]}
                    >
                      <Text style={styles.sectionTitle}>
                        {t("dashboard.invoiceCardTitle")}
                      </Text>
                      <Text style={styles.muted}>
                        {t("dashboard.invoiceCardDescription")}
                      </Text>
                      <Text style={styles.link}>
                        {t("dashboard.openInvoices")}
                      </Text>
                    </Pressable>
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
                                {activeAllocationPercentages.has(
                                  item.category.id,
                                )
                                  ? ` · ${percentageFormat.format(activeAllocationPercentages.get(item.category.id) ?? 0)}%`
                                  : ""}
                              </Text>
                              <Text style={styles.muted}>
                                {t("dashboard.allocated")}:{" "}
                                {formatAmount.format(item.allocated)} ·{" "}
                                {t("dashboard.spent")}:{" "}
                                {formatAmount.format(item.spent)} ·{" "}
                                {t("dashboard.adjusted")}:{" "}
                                {formatAmount.format(item.adjusted)}
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
                                      {schedule.description ? (
                                        <Text style={styles.muted}>
                                          {schedule.description}
                                        </Text>
                                      ) : null}
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
                    {!isNative ? (
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
                    ) : null}
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
                                  setMovementLabelId("");
                                  clearFieldError("movementCategory");
                                }}
                              />
                            ))}
                          </View>
                          <FieldError message={fieldErrors.movementCategory} />
                          {tab === "expense" ? (
                            <>
                              <Text style={styles.label}>
                                {t("movement.label")}
                              </Text>
                              <View style={styles.rowWrap}>
                                {(
                                  expenseLabelsByCategory[movementCategoryId] ??
                                  []
                                ).map((label) => (
                                  <Choice
                                    key={label.id}
                                    label={label.name}
                                    selected={movementLabelId === label.id}
                                    onPress={() => {
                                      setMovementLabelId(label.id);
                                      clearFieldError("movementLabel");
                                    }}
                                  />
                                ))}
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() =>
                                    setIsAddingExpenseLabel(
                                      (current) => !current,
                                    )
                                  }
                                >
                                  <Text style={styles.link}>
                                    {t("movement.addLabel")}
                                  </Text>
                                </Pressable>
                              </View>
                              <FieldError message={fieldErrors.movementLabel} />
                              {isAddingExpenseLabel ? (
                                <View>
                                  <TextInput
                                    accessibilityLabel={t("movement.newLabel")}
                                    maxLength={80}
                                    onChangeText={(value) => {
                                      setNewExpenseLabelName(value);
                                      clearFieldError("newExpenseLabel");
                                    }}
                                    placeholder={t(
                                      "movement.newLabelPlaceholder",
                                    )}
                                    style={[
                                      styles.input,
                                      fieldErrors.newExpenseLabel &&
                                        styles.inputInvalid,
                                    ]}
                                    value={newExpenseLabelName}
                                  />
                                  <FieldError
                                    message={fieldErrors.newExpenseLabel}
                                  />
                                  <Pressable
                                    accessibilityRole="button"
                                    disabled={isSaving}
                                    onPress={() => void addExpenseLabel()}
                                  >
                                    <Text style={styles.link}>
                                      {t("movement.saveLabel")}
                                    </Text>
                                  </Pressable>
                                </View>
                              ) : null}
                            </>
                          ) : null}
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
                      {tab === "income" ? (
                        <>
                          <Text style={styles.label}>
                            {t("movement.incomeDescription")}
                          </Text>
                          <TextInput
                            accessibilityLabel={t("movement.incomeDescription")}
                            maxLength={500}
                            onChangeText={setIncomeDescription}
                            placeholder={t(
                              "movement.incomeDescriptionPlaceholder",
                            )}
                            style={styles.input}
                            value={incomeDescription}
                          />
                        </>
                      ) : null}
                      {tab === "income" && incomeRecurring ? (
                        <>
                          <Text style={styles.label}>
                            {t("schedule.frequency")}
                          </Text>
                          <View style={styles.rowWrap}>
                            {(
                              ["WEEKLY", "FORTNIGHTLY", "MONTHLY"] as const
                            ).map((frequency) => (
                              <Choice
                                key={frequency}
                                label={t(`schedule.frequencies.${frequency}`)}
                                selected={scheduleFrequency === frequency}
                                onPress={() => setScheduleFrequency(frequency)}
                              />
                            ))}
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
                              fieldErrors.scheduleEndDate &&
                                styles.inputInvalid,
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
                          <Text style={styles.label}>
                            {t("movement.invoiceStatus")}
                          </Text>
                          <View style={styles.rowWrap}>
                            <Choice
                              label={t("movement.invoiceNotRequested")}
                              selected={invoiceStatus === "NOT_REQUESTED"}
                              onPress={() => {
                                setInvoiceStatus("NOT_REQUESTED");
                                setSupplierNipc("");
                                setFieldErrors((current) => {
                                  const next = { ...current };
                                  delete next.supplierNipc;
                                  return next;
                                });
                              }}
                            />
                            <Choice
                              label={t("movement.invoiceRequested")}
                              selected={invoiceStatus === "REQUESTED"}
                              onPress={() => setInvoiceStatus("REQUESTED")}
                            />
                          </View>
                          <Text style={styles.muted}>
                            {t("movement.invoiceRequestedHelp")}
                          </Text>
                          {invoiceStatus === "REQUESTED" ? (
                            <>
                              <Text style={styles.label}>
                                {t("movement.supplierNipc")}
                              </Text>
                              <TextInput
                                accessibilityLabel={t("movement.supplierNipc")}
                                keyboardType="number-pad"
                                maxLength={9}
                                onChangeText={(value) => {
                                  setSupplierNipc(
                                    value.replace(/[^0-9]/g, "").slice(0, 9),
                                  );
                                  clearFieldError("supplierNipc");
                                }}
                                placeholder={t(
                                  "movement.supplierNipcPlaceholder",
                                )}
                                style={[
                                  styles.input,
                                  fieldErrors.supplierNipc &&
                                    styles.inputInvalid,
                                ]}
                                value={supplierNipc}
                              />
                              <FieldError message={fieldErrors.supplierNipc} />
                            </>
                          ) : null}
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
                          <Text style={styles.label}>
                            {t("movement.reason")}
                          </Text>
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
                    {tab === "income" ? (
                      incomes.length ? (
                        <View style={styles.list}>
                          {incomes.map((income) => {
                            const corrections = incomeCorrections.filter(
                              (item) => item.income_entry_id === income.id,
                            );
                            return (
                              <View key={income.id} style={styles.incomeRecord}>
                                <View style={styles.entry}>
                                  <View style={styles.entryText}>
                                    <Text style={styles.entryTitle}>
                                      {t("movement.income")}
                                    </Text>
                                    <Text style={styles.muted}>
                                      {income.occurred_on}
                                    </Text>
                                    {income.description ? (
                                      <Text style={styles.muted}>
                                        {income.description}
                                      </Text>
                                    ) : null}
                                  </View>
                                  <Text style={styles.entryAmount}>
                                    {formatAmount.format(income.amount)}
                                  </Text>
                                </View>
                                {corrections.map((correction) => (
                                  <View
                                    key={correction.id}
                                    style={styles.incomeCorrectionEntry}
                                  >
                                    <Text style={styles.muted}>
                                      {t("movement.incomeCorrectionLabel")}:{" "}
                                      {formatAmount.format(
                                        correction.amount_delta,
                                      )}
                                    </Text>
                                    <Text style={styles.muted}>
                                      {correction.reason}
                                    </Text>
                                  </View>
                                ))}
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() => {
                                    setCorrectionEntryId(income.id);
                                    setCorrectionAmount("");
                                    setCorrectionReason("");
                                    setCorrectionSign(1);
                                    setCorrectionDate(today());
                                    setFieldErrors({});
                                  }}
                                >
                                  <Text style={styles.link}>
                                    {t("movement.correctIncome")}
                                  </Text>
                                </Pressable>
                                {correctionEntryId === income.id ? (
                                  <View style={styles.correctionForm}>
                                    <CancelActionButton
                                      label={t("common.cancel")}
                                      onPress={() => setCorrectionEntryId(null)}
                                    />
                                    <View style={styles.rowWrap}>
                                      <Choice
                                        label={t("movement.addToIncome")}
                                        selected={correctionSign === 1}
                                        onPress={() => setCorrectionSign(1)}
                                      />
                                      <Choice
                                        label={t("movement.removeFromIncome")}
                                        selected={correctionSign === -1}
                                        onPress={() => setCorrectionSign(-1)}
                                      />
                                    </View>
                                    <Text style={styles.label}>
                                      {t("movement.correctionAmount")}
                                    </Text>
                                    <TextInput
                                      accessibilityLabel={t(
                                        "movement.correctionAmount",
                                      )}
                                      keyboardType="decimal-pad"
                                      onChangeText={(value) => {
                                        setCorrectionAmount(value);
                                        clearFieldError(
                                          "incomeCorrectionAmount",
                                        );
                                      }}
                                      placeholder="0,00"
                                      style={[
                                        styles.input,
                                        fieldErrors.incomeCorrectionAmount &&
                                          styles.inputInvalid,
                                      ]}
                                      value={correctionAmount}
                                    />
                                    <FieldError
                                      message={
                                        fieldErrors.incomeCorrectionAmount
                                      }
                                    />
                                    <Text style={styles.label}>
                                      {t("movement.correctionDate")}
                                    </Text>
                                    <Text style={styles.muted}>
                                      {t("movement.correctionDateDescription")}
                                    </Text>
                                    <TextInput
                                      accessibilityLabel={t(
                                        "movement.correctionDate",
                                      )}
                                      onChangeText={(value) => {
                                        setCorrectionDate(value);
                                        clearFieldError("incomeCorrectionDate");
                                      }}
                                      placeholder="AAAA-MM-DD"
                                      style={[
                                        styles.input,
                                        fieldErrors.incomeCorrectionDate &&
                                          styles.inputInvalid,
                                      ]}
                                      value={correctionDate}
                                    />
                                    <FieldError
                                      message={fieldErrors.incomeCorrectionDate}
                                    />
                                    <Text style={styles.label}>
                                      {t("movement.correctionDescription")}
                                    </Text>
                                    <Text style={styles.muted}>
                                      {t("movement.correctionDescriptionHelp")}
                                    </Text>
                                    <TextInput
                                      accessibilityLabel={t(
                                        "movement.correctionDescription",
                                      )}
                                      maxLength={500}
                                      onChangeText={(value) => {
                                        setCorrectionReason(value);
                                        clearFieldError(
                                          "incomeCorrectionReason",
                                        );
                                      }}
                                      placeholder={t(
                                        "movement.correctionDescriptionPlaceholder",
                                      )}
                                      style={[
                                        styles.input,
                                        fieldErrors.incomeCorrectionReason &&
                                          styles.inputInvalid,
                                      ]}
                                      value={correctionReason}
                                    />
                                    <FieldError
                                      message={
                                        fieldErrors.incomeCorrectionReason
                                      }
                                    />
                                    <ActionButton
                                      disabled={isSaving}
                                      label={
                                        isSaving
                                          ? t("common.saving")
                                          : t("movement.saveIncomeCorrection")
                                      }
                                      onPress={() =>
                                        void submitIncomeCorrection(income)
                                      }
                                    />
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={styles.muted}>
                          {t("movement.incomeEmpty")}
                        </Text>
                      )
                    ) : tab === "expense" ? (
                      expenses.length ? (
                        <View style={styles.list}>
                          {expenses.map((item) => (
                            <View key={item.id} style={styles.entry}>
                              <View style={styles.entryText}>
                                <Text style={styles.entryTitle}>
                                  {categories.find(
                                    (category) =>
                                      category.id === item.category_id,
                                  )?.name ?? t("movement.expense")}{" "}
                                  ·{" "}
                                  {item.label?.name ??
                                    t("movement.unclassifiedLabel")}
                                </Text>
                                <Text style={styles.muted}>
                                  {item.spent_on}
                                  {item.description
                                    ? ` · ${item.description}`
                                    : ""}
                                </Text>
                                <Text style={styles.muted}>
                                  {item.invoice_status === "REQUESTED" ? (
                                    <>
                                      {t("movement.invoiceRequestedValue")} ·{" "}
                                      {t("movement.supplierNipc")}:{" "}
                                      {item.supplier_nipc}
                                    </>
                                  ) : (
                                    t("movement.invoiceNotRequestedValue")
                                  )}
                                </Text>
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() =>
                                    setReclassifyingExpenseId((current) =>
                                      current === item.id ? null : item.id,
                                    )
                                  }
                                >
                                  <Text style={styles.link}>
                                    {t("movement.changeLabel")}
                                  </Text>
                                </Pressable>
                                {reclassifyingExpenseId === item.id ? (
                                  <View style={styles.rowWrap}>
                                    {(
                                      expenseLabelsByCategory[
                                        item.category_id
                                      ] ?? []
                                    ).map((label) => (
                                      <Choice
                                        key={label.id}
                                        label={label.name}
                                        selected={item.label_id === label.id}
                                        onPress={() =>
                                          void reclassifyExpense(item, label.id)
                                        }
                                      />
                                    ))}
                                  </View>
                                ) : null}
                              </View>
                              <Text style={styles.entryAmount}>
                                {formatAmount.format(-item.amount)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.muted}>
                          {t("movement.expenseEmpty")}
                        </Text>
                      )
                    ) : (
                      <EntryList
                        empty={t(`movement.${tab}Empty`)}
                        items={adjustments.map((item) => ({
                          label: `${categories.find((category) => category.id === item.category_id)?.name ?? t("movement.adjustment")} · ${item.reason}`,
                          date: item.occurred_on,
                          amount: item.amount_delta,
                        }))}
                        format={formatAmount}
                      />
                    )}
                  </>
                ) : null}
                {workspaceView === "invoices" ? (
                  <View style={styles.card}>
                    <Text style={styles.label}>
                      {t("movement.invoiceYear")}
                    </Text>
                    <TextInput
                      accessibilityLabel={t("movement.invoiceYear")}
                      keyboardType="number-pad"
                      maxLength={4}
                      onChangeText={(value) => {
                        setInvoiceYear(value);
                        setFieldErrors((current) => {
                          const next = { ...current };
                          delete next.invoiceYear;
                          return next;
                        });
                      }}
                      style={[
                        styles.input,
                        fieldErrors.invoiceYear && styles.inputInvalid,
                      ]}
                      value={invoiceYear}
                    />
                    <FieldError message={fieldErrors.invoiceYear} />
                    <Text style={styles.label}>
                      {t("movement.invoiceMonth")}
                    </Text>
                    <TextInput
                      accessibilityLabel={t("movement.invoiceMonth")}
                      keyboardType="number-pad"
                      maxLength={2}
                      onChangeText={(value) => {
                        setInvoiceMonth(value.replace(/[^0-9]/g, ""));
                        setFieldErrors((current) => {
                          const next = { ...current };
                          delete next.invoiceMonth;
                          return next;
                        });
                      }}
                      style={[
                        styles.input,
                        fieldErrors.invoiceMonth && styles.inputInvalid,
                      ]}
                      value={invoiceMonth}
                      placeholder={t("movement.invoiceMonthPlaceholder")}
                    />
                    <FieldError message={fieldErrors.invoiceMonth} />
                    <Text style={styles.muted}>
                      {t("movement.invoiceMonthHelp")}
                    </Text>
                    <ActionButton
                      disabled={isLoadingInvoices}
                      label={
                        isLoadingInvoices
                          ? t("common.loading")
                          : t("movement.loadInvoices")
                      }
                      onPress={() => void loadRequestedInvoices()}
                    />
                    {invoiceListFailed ? (
                      <Text style={styles.error}>
                        {t("movement.invoiceListLoadError")}
                      </Text>
                    ) : isLoadingInvoices ? (
                      <Text style={styles.muted}>{t("common.loading")}</Text>
                    ) : requestedInvoices.length ? (
                      <View style={styles.list}>
                        {requestedInvoices.map((item) => (
                          <View key={item.id} style={styles.entry}>
                            <View style={styles.entryText}>
                              <Text style={styles.entryTitle}>
                                {categories.find(
                                  (category) =>
                                    category.id === item.category_id,
                                )?.name ?? t("movement.expense")}{" "}
                                ·{" "}
                                {item.label?.name ??
                                  t("movement.unclassifiedLabel")}
                              </Text>
                              <Text style={styles.muted}>
                                {[item.spent_on, item.description]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </Text>
                              <Text style={styles.muted}>
                                {t("movement.supplierNipc")}:{" "}
                                {item.supplier_nipc}
                              </Text>
                            </View>
                            <Text style={styles.entryAmount}>
                              {formatAmount.format(-item.amount)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.muted}>
                        {t("movement.invoiceListEmpty")}
                      </Text>
                    )}
                    <SecondaryActionButton
                      label={t("dashboard.backToDashboard")}
                      onPress={() => setWorkspaceView("dashboard")}
                    />
                  </View>
                ) : null}
                {workspaceView === "statistics" ? (
                  <>
                    <View style={styles.card}>
                      <Text style={styles.sectionTitle}>
                        {t("dashboard.periodStatistics")}
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
                      <View style={styles.statisticsMetrics}>
                        <StatisticsMetric
                          label={t("movement.income")}
                          value={formatAmount.format(periodIncomeTotal)}
                        />
                        <StatisticsMetric
                          label={t("movement.expense")}
                          value={formatAmount.format(periodExpenseTotal)}
                        />
                        <StatisticsMetric
                          label={t("dashboard.remainingTitle")}
                          value={formatAmount.format(periodRemaining)}
                        />
                        <StatisticsMetric
                          label={t("movement.adjustment")}
                          value={formatAmount.format(periodAdjustmentTotal)}
                        />
                      </View>
                      <Text style={styles.sectionTitle}>
                        {t("dashboard.expenseByCategory")}
                      </Text>
                      {expenseCategoryShares.length ? (
                        <ExpenseCategoryDonut
                          items={expenseCategoryShares}
                          total={periodExpenseTotal}
                          format={formatAmount}
                        />
                      ) : (
                        <Text style={styles.muted}>
                          {t("dashboard.noCategoryExpenses")}
                        </Text>
                      )}
                      <Text style={styles.sectionTitle}>
                        {t("dashboard.expenseByLabel")}
                      </Text>
                      {expenseLabelShares.length ? (
                        <ExpenseLabelBreakdown
                          items={expenseLabelShares}
                          format={formatAmount}
                        />
                      ) : (
                        <Text style={styles.muted}>
                          {t("dashboard.noLabelExpenses")}
                        </Text>
                      )}
                      <Text style={styles.sectionTitle}>
                        {t("dashboard.categoryProgress")}
                      </Text>
                      <CategoryProgressList
                        balances={categoryBalances}
                        format={formatAmount}
                      />
                    </View>
                    <View style={styles.card}>
                      <Text style={styles.muted}>
                        {t("dashboard.annualDescription")}
                      </Text>
                      <View style={styles.annualRow}>
                        <View style={styles.annualInput}>
                          <Text style={styles.label}>
                            {t("dashboard.year")}
                          </Text>
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
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : isCreatingBudget || editingBudgetId ? (
          <View style={styles.card}>
            <CancelActionButton
              label={t("common.cancel")}
              onPress={() => {
                setIsCreatingBudget(false);
                setEditingBudgetId(null);
                setFieldErrors({});
                setCategoryNameErrors([]);
                setCategoryPercentageErrors([]);
                setAllocationTotalError(false);
              }}
            />
            <Text style={styles.sectionTitle}>
              {editingBudgetId ? t("budget.editTitle") : t("budget.setupTitle")}
            </Text>
            <Text style={styles.muted}>
              {editingBudgetId
                ? t("budget.editDescription")
                : t("budget.setupDescription")}
            </Text>
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
            {!editingBudgetId ? (
              <>
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
                  style={[
                    styles.input,
                    fieldErrors.currency && styles.inputInvalid,
                  ]}
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
                  style={[
                    styles.input,
                    fieldErrors.startsOn && styles.inputInvalid,
                  ]}
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
                  style={[
                    styles.input,
                    fieldErrors.endsOn && styles.inputInvalid,
                  ]}
                  value={endsOn}
                />
                <FieldError message={fieldErrors.endsOn} />
              </>
            ) : null}
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
              label={
                isSaving
                  ? t("common.saving")
                  : editingBudgetId
                    ? t("budget.saveChanges")
                    : t("budget.setup")
              }
              onPress={() =>
                editingBudgetId
                  ? void saveBudgetChanges()
                  : void createBudgetAndSetup()
              }
            />
          </View>
        ) : (
          <View
            style={[styles.emptyCard, isCompact && styles.emptyCardCompact]}
          >
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
      {isNative && !isCreatingBudget && !editingBudgetId ? (
        <MobileNavigation
          current={workspaceView === "invoices" ? "movement" : workspaceView}
          onSelect={(destination) => {
            if (destination === "profile") {
              setShowAccountSettings(true);
              return;
            }
            setWorkspaceView(destination);
          }}
          t={t}
        />
      ) : null}
    </View>
  );
}

function Choice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        selected && styles.choiceSelected,
        disabled && styles.choiceDisabled,
      ]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function MobileTab({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.mobileTab, selected && styles.mobileTabSelected]}
    >
      <Text
        style={[styles.mobileTabIcon, selected && styles.mobileTabIconSelected]}
      >
        {icon}
      </Text>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.mobileTabText, selected && styles.mobileTabTextSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MobileNavigation({
  current,
  onSelect,
  t,
}: {
  current: MobileDestination;
  onSelect: (destination: MobileDestination) => void;
  t: TFunction;
}) {
  const destinations: {
    key: MobileDestination;
    label: string;
    icon: string;
  }[] = [
    { key: "budgets", label: t("mobileNav.budgets"), icon: "▤" },
    { key: "movement", label: t("mobileNav.movements"), icon: "↔" },
    { key: "dashboard", label: t("mobileNav.home"), icon: "⌂" },
    { key: "statistics", label: t("mobileNav.statistics"), icon: "▥" },
    { key: "profile", label: t("mobileNav.profile"), icon: "◉" },
  ];

  return (
    <View style={styles.mobileTabBar} accessibilityRole="tablist">
      {destinations.map((destination) => (
        <MobileTab
          key={destination.key}
          icon={destination.icon}
          label={destination.label}
          selected={current === destination.key}
          onPress={() => onSelect(destination.key)}
        />
      ))}
    </View>
  );
}

function MovementTypeSelector({
  selected,
  onSelect,
  t,
}: {
  selected: MovementTab;
  onSelect: (tab: MovementTab) => void;
  t: TFunction;
}) {
  return (
    <View style={styles.tabs}>
      {(["income", "expense", "adjustment"] as const).map((item) => (
        <Choice
          key={item}
          label={t(`movement.${item}`)}
          selected={selected === item}
          onPress={() => onSelect(item)}
        />
      ))}
    </View>
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

function SecondaryActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.secondaryAction}
    >
      <Text style={styles.secondaryActionText}>{label}</Text>
    </Pressable>
  );
}

function BackToDashboardButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.backToDashboardAction}
    >
      <Text style={styles.backToDashboardArrow}>←</Text>
      <Text style={styles.backToDashboardText}>{label}</Text>
    </Pressable>
  );
}

function CancelActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.cancelAction}
    >
      <Text style={styles.cancelActionText}>{label}</Text>
    </Pressable>
  );
}

function ArchiveActionButton({
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
      style={[styles.archiveAction, disabled && styles.disabled]}
    >
      <Text style={styles.archiveActionText}>{label}</Text>
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
  compact = false,
  onPress,
}: {
  label: string;
  value: string;
  recent: { label: string; date: string; amount: number }[];
  empty: string;
  format: Intl.NumberFormat;
  compact?: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.summaryItem, compact && styles.summaryItemCompact]}
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

function StatisticsMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statisticsMetric}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ExpenseCategoryDonut({
  items,
  total,
  format,
}: {
  items: ExpenseCategoryShare[];
  total: number;
  format: Intl.NumberFormat;
}) {
  const { t, i18n } = useTranslation();
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const colors = [
    "#285c3c",
    "#d27b4b",
    "#3d7891",
    "#9873a5",
    "#c55353",
    "#9d8a37",
  ];
  return (
    <View style={styles.donutLayout}>
      <View style={styles.donutGraphic}>
        <Svg
          accessible
          accessibilityLabel={t("dashboard.categoryChartAccessible")}
          height={168}
          viewBox="0 0 168 168"
          width={168}
        >
          <Circle
            cx={84}
            cy={84}
            fill="none"
            r={radius}
            stroke="#e7eee8"
            strokeWidth={22}
          />
          {items.map((item, index) => {
            const length = (item.percentage / 100) * circumference;
            const currentOffset = items
              .slice(0, index)
              .reduce(
                (total, previous) =>
                  total + (previous.percentage / 100) * circumference,
                0,
              );
            return (
              <Circle
                key={item.category.id}
                cx={84}
                cy={84}
                fill="none"
                r={radius}
                rotation={-90}
                origin={[84, 84]}
                stroke={colors[index % colors.length]}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-currentOffset}
                strokeWidth={22}
              />
            );
          })}
        </Svg>
        <View style={styles.donutCenter}>
          <Text style={styles.donutCenterLabel}>{t("movement.expense")}</Text>
          <Text numberOfLines={1} style={styles.donutCenterValue}>
            {format.format(total)}
          </Text>
        </View>
      </View>
      <View style={styles.donutLegend}>
        {items.map((item, index) => (
          <View key={item.category.id} style={styles.donutLegendRow}>
            <View
              style={[
                styles.donutSwatch,
                { backgroundColor: colors[index % colors.length] },
              ]}
            />
            <View style={styles.donutLegendText}>
              <Text numberOfLines={1} style={styles.entryTitle}>
                {item.category.name}
              </Text>
              <Text style={styles.muted}>
                {format.format(item.amount)} ·{" "}
                {t("dashboard.categoryShare", {
                  percentage: new Intl.NumberFormat(i18n.language, {
                    maximumFractionDigits: 0,
                  }).format(item.percentage),
                })}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function CategoryProgressList({
  balances,
  format,
}: {
  balances: CategoryBalance[];
  format: Intl.NumberFormat;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.categoryProgressList}>
      {balances.map((item) => {
        const overAllocated = item.spent > item.allocated;
        const progress =
          item.allocated > 0
            ? Math.min(100, (item.spent / item.allocated) * 100)
            : item.spent > 0
              ? 100
              : 0;
        const accessibilityLabel = t("dashboard.categoryProgressAccessible", {
          category: item.category.name,
          spent: format.format(item.spent),
          allocated: format.format(item.allocated),
          remaining: format.format(item.balance),
        });
        return (
          <View
            key={item.category.id}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={accessibilityLabel}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }}
            style={styles.categoryProgressItem}
          >
            <View style={styles.categoryProgressHeading}>
              <Text style={styles.entryTitle}>{item.category.name}</Text>
              <Text style={styles.entryAmount}>
                {t("dashboard.balance")}: {format.format(item.balance)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  overAllocated && styles.progressFillOver,
                  { width: `${progress}%` },
                ]}
              />
            </View>
            <Text style={styles.muted}>
              {t("dashboard.spent")}: {format.format(item.spent)} ·{" "}
              {t("dashboard.allocated")}: {format.format(item.allocated)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ExpenseLabelBreakdown({
  items,
  format,
}: {
  items: ExpenseLabelShare[];
  format: Intl.NumberFormat;
}) {
  const { i18n } = useTranslation();
  const percentageFormat = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 1,
  });
  const categories = [
    ...new Map(items.map((item) => [item.category.id, item.category])).values(),
  ];
  return (
    <View style={styles.categoryProgressList}>
      {categories.map((category) => {
        const categoryItems = items.filter(
          (item) => item.category.id === category.id,
        );
        return (
          <View key={category.id} style={styles.categoryProgressItem}>
            <Text style={styles.entryTitle}>{category.name}</Text>
            {categoryItems.map((item) => (
              <View
                key={`${category.id}:${item.label}`}
                style={styles.labelBreakdownRow}
              >
                <View style={styles.categoryProgressHeading}>
                  <Text style={styles.muted}>
                    {item.label} · {percentageFormat.format(item.percentage)}%
                  </Text>
                  <Text style={styles.entryAmount}>
                    {format.format(item.amount)}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(100, item.percentage)}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
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
  mobileWorkspaceShell: {
    flex: 1,
    backgroundColor: "#f5f7f2",
  },
  mobileTabBar: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 4,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#dce5dd",
  },
  mobileTab: {
    minHeight: 52,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    gap: 2,
    borderRadius: 10,
  },
  mobileTabSelected: { backgroundColor: "#e6f0e7" },
  mobileTabIcon: { color: "#627168", fontSize: 18, lineHeight: 20 },
  mobileTabIconSelected: { color: "#285c3c" },
  mobileTabText: {
    width: "100%",
    color: "#627168",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  mobileTabTextSelected: { color: "#285c3c", fontWeight: "800" },
  budgetHub: { gap: 12 },
  budgetHubEntry: { gap: 8 },
  budgetHubItem: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderColor: "#dce5dd",
    borderWidth: 1,
    borderRadius: 14,
  },
  budgetHubItemSelected: { borderColor: "#285c3c", backgroundColor: "#f7faf7" },
  budgetHubArrow: { color: "#285c3c", fontSize: 28, lineHeight: 30 },
  budgetManageActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  archiveConfirmation: {
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fff8ed",
    borderWidth: 1,
    borderColor: "#ead2af",
  },
  archivedBudgetSection: { gap: 10, marginTop: 8 },
  archivedBudgetItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#dce5dd",
    borderRadius: 12,
    backgroundColor: "#f8f9f8",
  },
  budgetAllocationTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 7,
  },
  budgetAllocationTag: {
    overflow: "hidden",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c8dccb",
    backgroundColor: "#edf5ee",
    color: "#285c3c",
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "600",
  },
  budgetAllocationHint: { color: "#68766c", fontSize: 12, marginTop: 6 },
  secondaryAction: {
    minHeight: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#9fb8a4",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  secondaryActionText: { color: "#285c3c", fontSize: 15, fontWeight: "700" },
  backToDashboardAction: {
    minHeight: 44,
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#9fb8a4",
    borderRadius: 10,
    backgroundColor: "#e6f0e7",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  backToDashboardArrow: { color: "#285c3c", fontSize: 19, lineHeight: 22 },
  backToDashboardText: { color: "#285c3c", fontSize: 15, fontWeight: "700" },
  cancelAction: {
    minHeight: 42,
    alignSelf: "flex-start",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#c4cbc6",
    borderRadius: 9,
    backgroundColor: "#f5f6f5",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelActionText: { color: "#4d5851", fontSize: 14, fontWeight: "600" },
  archiveAction: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#b66b56",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  archiveActionText: { color: "#843b2a", fontSize: 15, fontWeight: "700" },
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
  pageNative: { paddingBottom: 112 },
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
  headerCompact: { alignItems: "center", flexDirection: "row", gap: 8 },
  headerActionsCompact: {
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 4,
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
  brandCompact: { fontSize: 21, marginTop: 2 },
  newBudgetChoice: { width: 44, paddingHorizontal: 0, alignItems: "center" },
  disclaimer: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#e6f0e7",
    borderColor: "#c5d9c7",
    borderWidth: 1,
    gap: 4,
  },
  disclaimerCompact: { padding: 12, gap: 2 },
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
  choiceDisabled: { opacity: 0.78 },
  choiceText: { color: "#34473b", fontSize: 14 },
  choiceTextSelected: { color: "#234b34", fontWeight: "700" },
  incomeRecord: {
    gap: 9,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e3e9e4",
  },
  incomeCorrectionEntry: {
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: "#43805a",
    gap: 3,
  },
  correctionForm: {
    gap: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f4f7f4",
  },
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
  summaryCardsCompact: { flexDirection: "row" },
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
  summaryItemCompact: { flexBasis: "46%", minWidth: 0, padding: 12 },
  summaryItemWideCompact: { flexBasis: "100%", minWidth: 0, padding: 14 },
  invoiceDashboardCard: { borderLeftWidth: 4, borderLeftColor: "#43805a" },
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
  statisticsMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statisticsMetric: {
    flex: 1,
    minWidth: 145,
    gap: 5,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f4f7f4",
  },
  inlineAction: { alignSelf: "flex-start", paddingTop: 12 },
  donutLayout: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  donutGraphic: {
    width: 168,
    height: 168,
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  donutCenterLabel: { color: "#627168", fontSize: 12 },
  donutCenterValue: {
    maxWidth: 112,
    color: "#18291f",
    fontSize: 15,
    fontWeight: "700",
  },
  donutLegend: { flex: 1, minWidth: 190, gap: 10 },
  donutLegendRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  donutLegendText: { flex: 1, gap: 2 },
  donutSwatch: { width: 12, height: 12, borderRadius: 3 },
  categoryProgressList: { gap: 12 },
  categoryProgressItem: {
    gap: 5,
    paddingVertical: 9,
    borderBottomColor: "#edf1ed",
    borderBottomWidth: 1,
  },
  labelBreakdownRow: { gap: 4, paddingTop: 5 },
  categoryProgressHeading: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 6,
  },
  progressTrack: {
    height: 8,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: "#e7eee8",
  },
  progressFill: { height: "100%", backgroundColor: "#43805a" },
  progressFillOver: { backgroundColor: "#a33024" },
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
  annualRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10,
  },
  annualInput: { gap: 4, width: 140 },
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
