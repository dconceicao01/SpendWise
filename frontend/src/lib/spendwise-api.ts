import { getRuntimeConfig } from "@/lib/runtime-config";

export type BudgetType = "PERSONAL" | "SHARED";

export type Budget = {
  id: string;
  name: string;
  budget_type: BudgetType;
  currency_code: string;
  archived_at: string | null;
};

export type BudgetPeriod = {
  id: string;
  budget_id: string;
  starts_on: string;
  ends_on: string;
};

export type BudgetCategory = {
  id: string;
  budget_id: string;
  name: string;
  archived_at: string | null;
};

export type AllocationSet = {
  id: string;
  budgetId: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  items: { categoryId: string; percentage: number }[];
};

export type IncomeEntry = {
  id: string;
  period_id: string;
  amount: number;
  occurred_on: string;
  description: string | null;
  allocation_snapshot: {
    category_id: string;
    percentage_basis_points: number;
    allocated_amount: number;
  }[];
};

export type IncomeCorrection = {
  id: string;
  income_entry_id: string;
  period_id: string;
  amount_delta: number;
  reason: string;
  occurred_on: string;
  allocation_snapshot: {
    category_id: string;
    percentage_basis_points: number;
    allocated_amount: number;
  }[];
};

export type ExpenseEntry = {
  id: string;
  period_id: string;
  category_id: string;
  amount: number;
  spent_on: string;
  description: string | null;
};

export type BudgetAdjustment = {
  id: string;
  period_id: string;
  category_id: string;
  corrected_expense_entry_id: string | null;
  amount_delta: number;
  reason: string;
  occurred_on: string;
};

export type UserProfile = {
  user_id: string;
  email: string | null;
  full_name: string;
  phone_e164: string | null;
  default_currency: string;
  created_at: string | null;
  updated_at: string | null;
};

export type AccountDeletionOption = {
  budgetId: string;
  budgetName: string;
  transferTargets: { memberId: string; displayName: string | null }[];
};

export type BudgetInvitationRole = "CONTRIBUTOR" | "VIEWER";
export type BudgetInvitation = {
  id: string;
  budget_id: string;
  email: string | null;
  role: BudgetInvitationRole;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  invitation_link?: string | null;
};

export type IncomeScheduleFrequency = "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";
export type IncomeScheduleStatus =
  "ACTIVE" | "PAUSED" | "CANCELLED" | "COMPLETED";
export type MonthlyShortMonthBehavior = "LAST_DAY" | "SKIP";
export type IncomeSchedule = {
  id: string;
  budget_id: string;
  amount: number;
  description: string | null;
  frequency: IncomeScheduleFrequency;
  monthly_short_month_behavior: MonthlyShortMonthBehavior;
  start_date: string;
  end_date: string | null;
  next_occurrence_on: string;
  status: IncomeScheduleStatus;
};

export class SpendWiseApiError extends Error {
  constructor(readonly status: number) {
    super("SpendWise API request failed");
  }
}

function requireApiUrl() {
  const apiUrl = getRuntimeConfig().apiUrl;
  if (!apiUrl) throw new SpendWiseApiError(0);
  return apiUrl;
}

async function request<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    let response: Response;
    try {
      response = await fetch(`${requireApiUrl()}/api/v1${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });
    } catch {
      throw new SpendWiseApiError(0);
    }
    if (!response.ok) throw new SpendWiseApiError(response.status);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function jsonBody(value: unknown): Pick<RequestInit, "method" | "body"> {
  return { method: "POST", body: JSON.stringify(value) };
}

function jsonPutBody(value: unknown): Pick<RequestInit, "method" | "body"> {
  return { method: "PUT", body: JSON.stringify(value) };
}

function movementQuery(periodId: string, offset = 0) {
  const params = new URLSearchParams({
    periodId,
    limit: "100",
    offset: String(offset),
  });
  return `?${params.toString()}`;
}

export const spendwiseApi = {
  getProfile: (token: string) => request<UserProfile>(token, "/me/profile"),
  updateProfile: (
    token: string,
    input: {
      fullName: string;
      phoneE164: string | null;
      defaultCurrency: string;
    },
  ) => request<UserProfile>(token, "/me/profile", jsonPutBody(input)),
  getAccountDeletionOptions: (token: string) =>
    request<AccountDeletionOption[]>(token, "/me/deletion-options"),
  deleteAccount: (
    token: string,
    ownerTransfers: { budgetId: string; targetMemberId: string }[],
  ) => request<void>(token, "/me/deletion", jsonBody({ ownerTransfers })),
  listBudgetInvitations: (token: string, budgetId: string) =>
    request<BudgetInvitation[]>(token, `/budgets/${budgetId}/invitations`),
  createBudgetInvitation: (
    token: string,
    budgetId: string,
    input: { email: string; role: BudgetInvitationRole },
  ) =>
    request<BudgetInvitation>(
      token,
      `/budgets/${budgetId}/invitations`,
      jsonBody(input),
    ),
  revokeBudgetInvitation: (
    token: string,
    budgetId: string,
    invitationId: string,
  ) =>
    request<BudgetInvitation>(
      token,
      `/budgets/${budgetId}/invitations/${invitationId}/revoke`,
      { method: "POST" },
    ),
  listBudgets: (token: string) => request<Budget[]>(token, "/budgets"),
  createBudget: (
    token: string,
    input: { name: string; budgetType: BudgetType; currencyCode: string },
  ) => request<Budget>(token, "/budgets", jsonBody(input)),
  listPeriods: (token: string, budgetId: string) =>
    request<BudgetPeriod[]>(token, `/budgets/${budgetId}/periods`),
  createPeriod: (
    token: string,
    budgetId: string,
    input: { startsOn: string; endsOn: string },
  ) =>
    request<BudgetPeriod>(
      token,
      `/budgets/${budgetId}/periods`,
      jsonBody(input),
    ),
  listCategories: (token: string, budgetId: string) =>
    request<BudgetCategory[]>(token, `/budgets/${budgetId}/categories`),
  createCategory: (token: string, budgetId: string, name: string) =>
    request<BudgetCategory>(
      token,
      `/budgets/${budgetId}/categories`,
      jsonBody({ name }),
    ),
  listAllocationSets: (token: string, budgetId: string) =>
    request<AllocationSet[]>(token, `/budgets/${budgetId}/allocation-sets`),
  createAllocationSet: (
    token: string,
    budgetId: string,
    items: { categoryId: string; percentage: number }[],
  ) =>
    request<AllocationSet>(
      token,
      `/budgets/${budgetId}/allocation-sets`,
      jsonBody({ items }),
    ),
  activateAllocationSet: (token: string, budgetId: string, setId: string) =>
    request<AllocationSet>(
      token,
      `/budgets/${budgetId}/allocation-sets/${setId}/activate`,
      { method: "POST" },
    ),
  listIncomes: (
    token: string,
    budgetId: string,
    periodId: string,
    offset = 0,
  ) =>
    request<IncomeEntry[]>(
      token,
      `/budgets/${budgetId}/incomes${movementQuery(periodId, offset)}`,
    ),
  createIncome: (
    token: string,
    budgetId: string,
    input: {
      period_id: string;
      amount: number;
      occurred_on: string;
      description: string | null;
    },
  ) =>
    request<IncomeEntry>(
      token,
      `/budgets/${budgetId}/incomes`,
      jsonBody(input),
    ),
  listIncomeCorrections: (
    token: string,
    budgetId: string,
    periodId: string,
    offset = 0,
  ) =>
    request<IncomeCorrection[]>(
      token,
      `/budgets/${budgetId}/income-corrections${movementQuery(periodId, offset)}`,
    ),
  createIncomeCorrection: (
    token: string,
    budgetId: string,
    incomeEntryId: string,
    input: {
      period_id: string;
      amount_delta: number;
      occurred_on: string;
      reason: string;
    },
  ) =>
    request<IncomeCorrection>(
      token,
      `/budgets/${budgetId}/incomes/${incomeEntryId}/corrections`,
      jsonBody(input),
    ),
  listIncomeSchedules: (token: string, budgetId: string, offset = 0) =>
    request<IncomeSchedule[]>(
      token,
      `/budgets/${budgetId}/income-schedules?limit=100&offset=${offset}`,
    ),
  createIncomeSchedule: (
    token: string,
    budgetId: string,
    input: {
      amount: number;
      frequency: IncomeScheduleFrequency;
      monthlyShortMonthBehavior: MonthlyShortMonthBehavior;
      startDate: string;
      endDate: string | null;
      description: string | null;
    },
  ) =>
    request<IncomeSchedule>(
      token,
      `/budgets/${budgetId}/income-schedules`,
      jsonBody(input),
    ),
  updateIncomeSchedule: (
    token: string,
    budgetId: string,
    scheduleId: string,
    status: Exclude<IncomeScheduleStatus, "COMPLETED">,
  ) =>
    request<IncomeSchedule>(
      token,
      `/budgets/${budgetId}/income-schedules/${scheduleId}`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    ),
  listExpenses: (
    token: string,
    budgetId: string,
    periodId: string,
    offset = 0,
  ) =>
    request<ExpenseEntry[]>(
      token,
      `/budgets/${budgetId}/expenses${movementQuery(periodId, offset)}`,
    ),
  createExpense: (
    token: string,
    budgetId: string,
    input: {
      period_id: string;
      category_id: string;
      amount: number;
      spent_on: string;
      description: string | null;
    },
  ) =>
    request<ExpenseEntry>(
      token,
      `/budgets/${budgetId}/expenses`,
      jsonBody(input),
    ),
  listAdjustments: (
    token: string,
    budgetId: string,
    periodId: string,
    offset = 0,
  ) =>
    request<BudgetAdjustment[]>(
      token,
      `/budgets/${budgetId}/adjustments${movementQuery(periodId, offset)}`,
    ),
  createAdjustment: (
    token: string,
    budgetId: string,
    input: {
      period_id: string;
      category_id: string;
      amount_delta: number;
      reason: string;
      occurred_on: string;
      corrected_expense_entry_id: string | null;
    },
  ) =>
    request<BudgetAdjustment>(
      token,
      `/budgets/${budgetId}/adjustments`,
      jsonBody(input),
    ),
};
