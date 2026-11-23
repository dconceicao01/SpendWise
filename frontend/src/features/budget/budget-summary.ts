import type {
  BudgetAdjustment,
  BudgetCategory,
  BudgetPeriod,
  ExpenseEntry,
  IncomeEntry,
} from "@/lib/spendwise-api";

export type CategoryBalance = {
  category: BudgetCategory;
  allocated: number;
  spent: number;
  adjusted: number;
  balance: number;
};

export type AnnualSummary = {
  income: number;
  expense: number;
  adjustment: number;
};

export function calculatePeriodCategoryBalances(
  categories: BudgetCategory[],
  incomes: IncomeEntry[],
  expenses: ExpenseEntry[],
  adjustments: BudgetAdjustment[],
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

    return {
      category,
      allocated,
      spent,
      adjusted,
      balance: allocated - spent + adjusted,
    };
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
): AnnualSummary {
  const yearPrefix = `${year}-`;
  return {
    income: incomes
      .filter((item) => item.occurred_on.startsWith(yearPrefix))
      .reduce((total, item) => total + item.amount, 0),
    expense: expenses
      .filter((item) => item.spent_on.startsWith(yearPrefix))
      .reduce((total, item) => total + item.amount, 0),
    adjustment: adjustments
      .filter((item) => item.occurred_on.startsWith(yearPrefix))
      .reduce((total, item) => total + item.amount_delta, 0),
  };
}
