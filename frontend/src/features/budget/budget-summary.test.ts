import {
  calculateAnnualSummary,
  calculateExpenseCategoryShares,
  calculatePeriodCategoryBalances,
  periodsOverlappingYear,
} from "@/features/budget/budget-summary";
import type {
  BudgetAdjustment,
  BudgetCategory,
  BudgetPeriod,
  ExpenseEntry,
  IncomeCorrection,
  IncomeEntry,
} from "@/lib/spendwise-api";

const category: BudgetCategory = {
  id: "general",
  budget_id: "budget-1",
  name: "Geral",
  archived_at: null,
};
const travelCategory: BudgetCategory = {
  id: "travel",
  budget_id: "budget-1",
  name: "Viagens",
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
        description: null,
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

  it("calculates the share of spending by category for the period chart", () => {
    expect(
      calculateExpenseCategoryShares([
        {
          category,
          allocated: 500,
          spent: 300,
          adjusted: 0,
          balance: 200,
        },
        {
          category: travelCategory,
          allocated: 200,
          spent: 100,
          adjusted: 0,
          balance: 100,
        },
      ]),
    ).toEqual([
      { category, amount: 300, percentage: 75 },
      { category: travelCategory, amount: 100, percentage: 25 },
    ]);
  });

  it("returns no expense slices when a period has no expenses", () => {
    expect(calculateExpenseCategoryShares([])).toEqual([]);
  });

  it("applies income corrections to the original category and income total", () => {
    const incomes: IncomeEntry[] = [
      {
        id: "income-1",
        period_id: "period-1",
        amount: 900,
        occurred_on: "2026-01-01",
        description: null,
        allocation_snapshot: [
          {
            category_id: "general",
            percentage_basis_points: 5000,
            allocated_amount: 450,
          },
        ],
      },
    ];
    const corrections: IncomeCorrection[] = [
      {
        id: "income-correction-1",
        income_entry_id: "income-1",
        period_id: "period-1",
        amount_delta: -100,
        reason: "Rendimento registado em excesso",
        occurred_on: "2026-01-01",
        allocation_snapshot: [
          {
            category_id: "general",
            percentage_basis_points: 5000,
            allocated_amount: -50,
          },
        ],
      },
    ];

    expect(
      calculatePeriodCategoryBalances(
        [category],
        incomes,
        [],
        [],
        corrections,
      )[0],
    ).toMatchObject({ allocated: 400, balance: 400 });
    expect(calculateAnnualSummary(2026, incomes, [], [], corrections)).toEqual({
      income: 800,
      expense: 0,
      adjustment: 0,
    });
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
        description: null,
        allocation_snapshot: [],
      },
      {
        id: "income-2026",
        period_id: "cross-year",
        amount: 200,
        occurred_on: "2026-01-01",
        description: null,
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
