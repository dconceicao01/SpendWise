import {
  calculateAnnualSummary,
  calculatePeriodCategoryBalances,
  periodsOverlappingYear,
} from "@/features/budget/budget-summary";
import type {
  BudgetAdjustment,
  BudgetCategory,
  BudgetPeriod,
  ExpenseEntry,
  IncomeEntry,
} from "@/lib/spendwise-api";

const category: BudgetCategory = {
  id: "general",
  budget_id: "budget-1",
  name: "Geral",
  archived_at: null,
};

describe("budget dashboard summaries", () => {
  it("calculates a period balance from allocations, expenses and signed adjustments", () => {
    const incomes: IncomeEntry[] = [
      {
        id: "income-1",
        period_id: "period-1",
        amount: 900,
        occurred_on: "2026-01-01",
        allocation_snapshot: [
          {
            category_id: "general",
            percentage_basis_points: 5000,
            allocated_amount: 450,
          },
        ],
      },
    ];
    const expenses: ExpenseEntry[] = [
      {
        id: "expense-1",
        period_id: "period-1",
        category_id: "general",
        amount: 500,
        spent_on: "2026-01-02",
        description: null,
      },
    ];
    const adjustments: BudgetAdjustment[] = [
      {
        id: "adjustment-1",
        period_id: "period-1",
        category_id: "general",
        corrected_expense_entry_id: "expense-1",
        amount_delta: -25,
        reason: "Correção de despesa",
        occurred_on: "2026-01-02",
      },
    ];

    expect(
      calculatePeriodCategoryBalances(
        [category],
        incomes,
        expenses,
        adjustments,
      ),
    ).toEqual([
      {
        category,
        allocated: 450,
        spent: 500,
        adjusted: -25,
        balance: -75,
      },
    ]);
  });

  it("does not add a previous period balance to the current period calculation", () => {
    expect(calculatePeriodCategoryBalances([category], [], [], [])).toEqual([
      {
        category,
        allocated: 0,
        spent: 0,
        adjusted: 0,
        balance: 0,
      },
    ]);
  });

  it("selects periods that overlap a year even when they start in the prior year", () => {
    const periods: BudgetPeriod[] = [
      {
        id: "cross-year",
        budget_id: "budget-1",
        starts_on: "2025-12-15",
        ends_on: "2026-01-15",
      },
      {
        id: "inside-year",
        budget_id: "budget-1",
        starts_on: "2026-10-01",
        ends_on: "2026-12-31",
      },
      {
        id: "next-year",
        budget_id: "budget-1",
        starts_on: "2027-01-01",
        ends_on: "2027-01-31",
      },
    ];

    expect(
      periodsOverlappingYear(periods, 2026).map((period) => period.id),
    ).toEqual(["cross-year", "inside-year"]);
  });

  it("aggregates annual totals by each movement's effective date", () => {
    const incomes: IncomeEntry[] = [
      {
        id: "income-2025",
        period_id: "cross-year",
        amount: 100,
        occurred_on: "2025-12-31",
        allocation_snapshot: [],
      },
      {
        id: "income-2026",
        period_id: "cross-year",
        amount: 200,
        occurred_on: "2026-01-01",
        allocation_snapshot: [],
      },
    ];
    const expenses: ExpenseEntry[] = [
      {
        id: "expense-2026",
        period_id: "cross-year",
        category_id: "general",
        amount: 60,
        spent_on: "2026-12-31",
        description: null,
      },
      {
        id: "expense-2027",
        period_id: "cross-year",
        category_id: "general",
        amount: 30,
        spent_on: "2027-01-01",
        description: null,
      },
    ];
    const adjustments: BudgetAdjustment[] = [
      {
        id: "adjustment-2026",
        period_id: "cross-year",
        category_id: "general",
        corrected_expense_entry_id: "expense-2026",
        amount_delta: -10,
        reason: "Correção",
        occurred_on: "2026-12-31",
      },
    ];

    expect(
      calculateAnnualSummary(2026, incomes, expenses, adjustments),
    ).toEqual({
      income: 200,
      expense: 60,
      adjustment: -10,
    });
  });
});
