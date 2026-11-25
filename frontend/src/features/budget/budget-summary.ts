import type {
  BudgetAdjustment,
  BudgetCategory,
  BudgetPeriod,
  ExpenseEntry,
  IncomeCorrection,
  IncomeEntry,
} from "@/lib/spendwise-api";

export type CategoryBalance = {
  category: BudgetCategory;
  allocated: number;
  spent: number;
  adjusted: number;
  balance: number;
};

export type ExpenseCategoryShare = {
  category: BudgetCategory;
  amount: number;
  percentage: number;
};

export type ExpenseLabelShare = {
  category: BudgetCategory;
  label: string;
  amount: number;
  percentage: number;
};

export type AnnualSummary = {
  income: number;
  expense: number;
  adjustment: number;
};

export type MonthlySummary = AnnualSummary & {
  month: string;
  remaining: number;
};

export function calculateMonthlySummaries(
  year: number,
  incomes: IncomeEntry[],
  expenses: ExpenseEntry[],
  adjustments: BudgetAdjustment[],
  incomeCorrections: IncomeCorrection[] = [],
): MonthlySummary[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const income =
      incomes
        .filter((item) => item.occurred_on.startsWith(month))
        .reduce((total, item) => total + item.amount, 0) +
      incomeCorrections
        .filter((item) => item.occurred_on.startsWith(month))
        .reduce((total, item) => total + item.amount_delta, 0);
    const expense = expenses
      .filter((item) => item.spent_on.startsWith(month))
      .reduce((total, item) => total + item.amount, 0);
    const adjustment = adjustments
      .filter((item) => item.occurred_on.startsWith(month))
      .reduce((total, item) => total + item.amount_delta, 0);

    return {
      month,
      income,
      expense,
      adjustment,
      remaining: income - expense + adjustment,
    };
  });
}

export function calculatePeriodCategoryBalances(
  categories: BudgetCategory[],
  incomes: IncomeEntry[],
  expenses: ExpenseEntry[],
  adjustments: BudgetAdjustment[],
  incomeCorrections: IncomeCorrection[] = [],
): CategoryBalance[] {
  return categories.map((category) => {
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
    const correctionAllocated = incomeCorrections.reduce(
      (total, correction) =>
        total +
        correction.allocation_snapshot
          .filter((allocation) => allocation.category_id === category.id)
          .reduce((sum, allocation) => sum + allocation.allocated_amount, 0),
      0,
    );

    return {
      category,
      allocated: allocated + correctionAllocated,
      spent,
      adjusted,
      balance: allocated + correctionAllocated - spent + adjusted,
    };
  });
}

export function calculateExpenseCategoryShares(
  balances: CategoryBalance[],
): ExpenseCategoryShare[] {
  const totalExpenses = balances.reduce((total, item) => total + item.spent, 0);
  if (totalExpenses <= 0) return [];

  return balances
    .filter((item) => item.spent > 0)
    .map((item) => ({
      category: item.category,
      amount: item.spent,
      percentage: (item.spent / totalExpenses) * 100,
    }))
    .sort(
      (left, right) =>
        right.amount - left.amount ||
        left.category.name.localeCompare(right.category.name),
    );
}

export function calculateExpenseLabelShares(
  categories: BudgetCategory[],
  expenses: ExpenseEntry[],
): ExpenseLabelShare[] {
  return categories.flatMap((category) => {
    const totals = new Map<string, number>();
    for (const expense of expenses) {
      if (expense.category_id !== category.id) continue;
      const name = expense.label?.name || "Por classificar";
      totals.set(name, (totals.get(name) ?? 0) + expense.amount);
    }
    const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0);
    if (total <= 0) return [];
    return [...totals.entries()]
      .map(([label, amount]) => ({
        category,
        label,
        amount,
        percentage: (amount / total) * 100,
      }))
      .sort(
        (left, right) =>
          right.amount - left.amount || left.label.localeCompare(right.label),
      );
  });
}

export function periodsOverlappingYear(
  periods: BudgetPeriod[],
  year: number,
): BudgetPeriod[] {
  const firstDay = `${year}-01-01`;
  const lastDay = `${year}-12-31`;
  return periods.filter(
    (period) => period.starts_on <= lastDay && period.ends_on >= firstDay,
  );
}

export function calculateAnnualSummary(
  year: number,
  incomes: IncomeEntry[],
  expenses: ExpenseEntry[],
  adjustments: BudgetAdjustment[],
  incomeCorrections: IncomeCorrection[] = [],
): AnnualSummary {
  const yearPrefix = `${year}-`;
  return {
    income:
      incomes
        .filter((item) => item.occurred_on.startsWith(yearPrefix))
        .reduce((total, item) => total + item.amount, 0) +
      incomeCorrections
        .filter((item) => item.occurred_on.startsWith(yearPrefix))
        .reduce((total, item) => total + item.amount_delta, 0),
    expense: expenses
      .filter((item) => item.spent_on.startsWith(yearPrefix))
      .reduce((total, item) => total + item.amount, 0),
    adjustment: adjustments
      .filter((item) => item.occurred_on.startsWith(yearPrefix))
      .reduce((total, item) => total + item.amount_delta, 0),
  };
}
