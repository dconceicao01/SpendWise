import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const budgetId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const periodId = "pppppppp-pppp-4ppp-8ppp-pppppppppppp";
const categoryId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const groceryLabelId = "llll1111-1111-4111-8111-111111111111";
const allocationSetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountId = "11111111-1111-4111-8111-111111111111";

type MovementState = {
  incomes: {
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
  }[];
  incomeCorrections: {
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
  }[];
  expenses: {
    id: string;
    period_id: string;
    category_id: string;
    label_id: string;
    label: { name: string; is_system: boolean };
    amount: number;
    spent_on: string;
    description: string | null;
    invoice_status: "NOT_REQUESTED" | "REQUESTED";
    supplier_nipc: string | null;
  }[];
  adjustments: {
    id: string;
    period_id: string;
    category_id: string;
    amount_delta: number;
    reason: string;
    occurred_on: string;
    corrected_expense_entry_id: string | null;
  }[];
};

type InvitationState = {
  id: string;
  budget_id: string;
  email: string | null;
  role: "CONTRIBUTOR" | "VIEWER";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  invitation_link?: string | null;
};

type IncomeScheduleState = {
  id: string;
  budget_id: string;
  amount: number;
  description: string | null;
  frequency: "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";
  monthly_short_month_behavior: "LAST_DAY" | "SKIP";
  start_date: string;
  end_date: string | null;
  next_occurrence_on: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED" | "COMPLETED";
};

async function enableEnglish(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("spendwise.language", "en");
  });
}

async function mockSignIn(page: Page) {
  await page.route("https://e2e.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/v1/token") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "e2e-access-token",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "e2e-refresh-token",
          user: {
            id: accountId,
            aud: "authenticated",
            role: "authenticated",
            email: "pilot@example.test",
            app_metadata: { provider: "email", providers: ["email"] },
            user_metadata: { full_name: "Pilot User" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
        }),
      });
      return;
    }

    if (url.pathname === "/auth/v1/signup") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: accountId,
            aud: "authenticated",
            role: "authenticated",
            email: "pilot@example.test",
            app_metadata: { provider: "email", providers: ["email"] },
            user_metadata: { full_name: "Pilot User" },
            created_at: "2026-01-01T00:00:00.000Z",
          },
          session: null,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: accountId,
        aud: "authenticated",
        role: "authenticated",
        email: "pilot@example.test",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { full_name: "Pilot User" },
        created_at: "2026-01-01T00:00:00.000Z",
      }),
    });
  });
}

async function mockBudgetApi(page: Page) {
  const state: {
    budgets: {
      id: string;
      name: string;
      budget_type: "PERSONAL" | "SHARED";
      currency_code: string;
      archived_at: null;
      period_frequency:
        | "CUSTOM"
        | "WEEKLY"
        | "FORTNIGHTLY"
        | "MONTHLY"
        | "EVERY_TWO_MONTHS"
        | "QUARTERLY"
        | "EVERY_SIX_MONTHS"
        | "ANNUAL";
      period_anchor_start: string | null;
      period_end_on: string | null;
    }[];
    periods: {
      id: string;
      budget_id: string;
      starts_on: string;
      ends_on: string;
    }[];
    categories: {
      id: string;
      budget_id: string;
      name: string;
      archived_at: null;
    }[];
    movements: MovementState;
    invitations: InvitationState[];
    incomeSchedules: IncomeScheduleState[];
    profile: {
      user_id: string;
      email: string;
      full_name: string;
      phone_e164: string | null;
      default_currency: string;
      created_at: string;
      updated_at: string;
    };
  } = {
    budgets: [],
    periods: [],
    categories: [],
    movements: {
      incomes: [],
      incomeCorrections: [],
      expenses: [],
      adjustments: [],
    },
    invitations: [],
    incomeSchedules: [],
    profile: {
      user_id: accountId,
      email: "pilot@example.test",
      full_name: "Pilot User",
      phone_e164: null,
      default_currency: "EUR",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  };

  await page.route("http://127.0.0.1:4010/api/v1/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = request.method();
    const respond = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
        },
        body: status === 204 ? "" : JSON.stringify(body),
      });

    if (method === "OPTIONS") return respond(null, 204);
    if (path === "/me/profile" && method === "GET")
      return respond(state.profile);
    if (path === "/me/profile" && method === "PUT") {
      const input = request.postDataJSON() as {
        fullName: string;
        phoneE164: string | null;
        defaultCurrency: string;
      };
      state.profile = {
        ...state.profile,
        full_name: input.fullName,
        phone_e164: input.phoneE164,
        default_currency: input.defaultCurrency,
      };
      return respond(state.profile);
    }
    if (path === "/me/deletion-options" && method === "GET")
      return respond([
        {
          budgetId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          budgetName: "Shared pilot",
          transferTargets: [
            {
              memberId: "22222222-2222-4222-8222-222222222222",
              displayName: "Alex",
            },
          ],
        },
      ]);
    if (path === "/me/deletion" && method === "POST") return respond(null, 204);
    if (path === "/invitations/accept" && method === "POST") {
      const input = request.postDataJSON() as { token: string };
      return respond({
        accepted: input.token === "synthetic-invitation-token",
      });
    }
    if (path === "/budgets" && method === "GET") return respond(state.budgets);
    if (path === "/budgets" && method === "POST") {
      const input = request.postDataJSON() as {
        name: string;
        budgetType: "PERSONAL" | "SHARED";
        currencyCode: string;
      };
      const budget = {
        id: budgetId,
        name: input.name,
        budget_type: input.budgetType,
        currency_code: input.currencyCode,
        archived_at: null,
        period_frequency: "CUSTOM" as const,
        period_anchor_start: null,
        period_end_on: null,
      };
      state.budgets = [budget];
      return respond(budget, 201);
    }
    if (/^\/budgets\/[^/]+$/.test(path) && method === "PATCH") {
      const input = request.postDataJSON() as {
        name: string;
        period_frequency: (typeof state.budgets)[number]["period_frequency"];
        period_anchor_start: string | null;
        period_end_on: string | null;
      };
      const budget = state.budgets.find((item) => item.id === budgetId);
      if (!budget) return respond({ error: "Budget not found" }, 404);
      Object.assign(budget, input);
      return respond(budget);
    }

    const labelPath = path.match(
      /^\/budgets\/[^/]+\/categories\/([^/]+)\/expense-labels$/,
    );
    if (labelPath) {
      const [, labelCategoryId] = labelPath;
      const labels =
        labelCategoryId === categoryId
          ? [
              {
                id: groceryLabelId,
                budget_id: budgetId,
                category_id: categoryId,
                name: "Groceries",
                is_system: false,
                created_at: "2026-01-01T00:00:00Z",
              },
            ]
          : [];
      if (method === "GET") return respond(labels);
      if (method === "POST") {
        const input = request.postDataJSON() as { name: string };
        return respond(
          {
            id: "llll2222-2222-4222-8222-222222222222",
            budget_id: budgetId,
            category_id: labelCategoryId,
            name: input.name,
            is_system: false,
            created_at: "2026-01-01T00:00:00Z",
          },
          201,
        );
      }
    }

    const resource = path.match(
      /^\/budgets\/[^/]+\/(periods|categories|allocation-sets|income-schedules|incomes|income-corrections|expenses|adjustments|invitations)(?:\/(.*))?$/,
    );
    if (!resource) return respond({ error: "Unexpected test request" }, 404);
    const [, name, resourceId] = resource;

    if (name === "invitations" && method === "GET") {
      return respond(
        state.invitations.map(
          ({
            id,
            budget_id,
            email,
            role,
            expires_at,
            accepted_at,
            revoked_at,
            created_at,
          }) => ({
            id,
            budget_id,
            email,
            role,
            expires_at,
            accepted_at,
            revoked_at,
            created_at,
          }),
        ),
      );
    }
    if (name === "invitations" && method === "POST" && !resourceId) {
      const input = request.postDataJSON() as {
        email: string;
        role: "CONTRIBUTOR" | "VIEWER";
      };
      const invitation = {
        id: "iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii",
        budget_id: budgetId,
        email: input.email,
        role: input.role,
        expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        accepted_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
        invitation_link:
          "https://spendwise.example.test/invitations/accept#token=synthetic-one-time-token",
      };
      state.invitations = [...state.invitations, invitation];
      return respond(invitation, 201);
    }
    if (
      name === "invitations" &&
      method === "POST" &&
      resourceId?.endsWith("/revoke")
    ) {
      const invitationId = resourceId.split("/")[0];
      state.invitations = state.invitations.map((item) =>
        item.id === invitationId
          ? { ...item, revoked_at: new Date().toISOString() }
          : item,
      );
      return respond(state.invitations[0]);
    }

    if (name === "periods" && method === "GET") return respond(state.periods);
    if (name === "periods" && method === "POST") {
      const input = request.postDataJSON() as {
        startsOn: string;
        endsOn: string;
      };
      const period = {
        id: periodId,
        budget_id: budgetId,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
      };
      state.periods = [period];
      return respond(period, 201);
    }
    if (name === "categories" && method === "GET")
      return respond(state.categories);
    if (name === "categories" && method === "POST") {
      const input = request.postDataJSON() as { name: string };
      const category = {
        id: categoryId,
        budget_id: budgetId,
        name: input.name,
        archived_at: null,
      };
      state.categories = [...state.categories, category];
      return respond(category, 201);
    }
    if (name === "allocation-sets" && method === "GET") {
      return respond(
        state.categories.length
          ? [
              {
                id: allocationSetId,
                budgetId,
                version: 1,
                status: "ACTIVE",
                items: [{ categoryId, percentage: 100 }],
              },
            ]
          : [],
      );
    }
    if (
      name === "allocation-sets" &&
      method === "POST" &&
      resourceId === `${allocationSetId}/activate`
    ) {
      return respond({
        id: allocationSetId,
        budgetId,
        version: 1,
        status: "ACTIVE",
        items: [{ categoryId, percentage: 100 }],
      });
    }
    if (name === "allocation-sets" && method === "POST") {
      return respond(
        {
          id: allocationSetId,
          budgetId,
          version: 1,
          status: "DRAFT",
          items: [{ categoryId, percentage: 100 }],
        },
        201,
      );
    }
    if (name === "income-schedules" && method === "GET")
      return respond(state.incomeSchedules);
    if (name === "income-schedules" && method === "POST") {
      const input = request.postDataJSON() as {
        amount: number;
        description: string | null;
        frequency: IncomeScheduleState["frequency"];
        monthlyShortMonthBehavior: IncomeScheduleState["monthly_short_month_behavior"];
        startDate: string;
        endDate: string | null;
      };
      const schedule: IncomeScheduleState = {
        id: "ssssssss-ssss-4sss-8sss-ssssssssssss",
        budget_id: budgetId,
        amount: input.amount,
        description: input.description,
        frequency: input.frequency,
        monthly_short_month_behavior: input.monthlyShortMonthBehavior,
        start_date: input.startDate,
        end_date: input.endDate,
        next_occurrence_on: input.startDate,
        status: "ACTIVE",
      };
      state.incomeSchedules = [...state.incomeSchedules, schedule];
      return respond(schedule, 201);
    }
    if (name === "income-corrections" && method === "GET")
      return respond(state.movements.incomeCorrections);
    if (name === "incomes" && method === "GET")
      return respond(state.movements.incomes);
    if (
      name === "incomes" &&
      method === "POST" &&
      resourceId?.endsWith("/corrections")
    ) {
      const input = request.postDataJSON() as Omit<
        MovementState["incomeCorrections"][number],
        "id" | "income_entry_id" | "allocation_snapshot"
      >;
      const incomeCorrection = {
        id: "iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii",
        income_entry_id: resourceId.slice(0, -"/corrections".length),
        ...input,
        allocation_snapshot: [
          {
            category_id: categoryId,
            percentage_basis_points: 10000,
            allocated_amount: input.amount_delta,
          },
        ],
      };
      state.movements.incomeCorrections = [
        ...state.movements.incomeCorrections,
        incomeCorrection,
      ];
      return respond(incomeCorrection, 201);
    }
    if (name === "incomes" && method === "POST") {
      const input = request.postDataJSON() as {
        period_id: string;
        amount: number;
        occurred_on: string;
        description: string | null;
      };
      const income = {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        ...input,
        allocation_snapshot: [
          {
            category_id: categoryId,
            percentage_basis_points: 10000,
            allocated_amount: input.amount,
          },
        ],
      };
      state.movements.incomes = [...state.movements.incomes, income];
      return respond(income, 201);
    }
    if (name === "expenses" && method === "GET") {
      if (resourceId === "invoices") {
        const requestUrl = new URL(request.url());
        const year = requestUrl.searchParams.get("year");
        const month = requestUrl.searchParams.get("month")?.padStart(2, "0");
        const monthKey = year && month ? year + "-" + month : "";
        return respond(
          state.movements.expenses.filter(
            (expense) =>
              expense.invoice_status === "REQUESTED" &&
              expense.spent_on.startsWith(monthKey),
          ),
        );
      }
      return respond(state.movements.expenses);
    }
    if (name === "expenses" && method === "POST") {
      const input = request.postDataJSON() as {
        period_id: string;
        category_id: string;
        label_id: string;
        amount: number;
        spent_on: string;
        description: string | null;
        invoice_status: "NOT_REQUESTED" | "REQUESTED";
        supplier_nipc: string | null;
      };
      const expense = {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        ...input,
        label: { name: "Groceries", is_system: false },
      };
      state.movements.expenses = [...state.movements.expenses, expense];
      return respond(expense, 201);
    }
    if (name === "adjustments" && method === "GET")
      return respond(state.movements.adjustments);
    if (name === "adjustments" && method === "POST") {
      const input = request.postDataJSON() as Omit<
        MovementState["adjustments"][number],
        "id"
      >;
      state.movements.adjustments = [
        ...state.movements.adjustments,
        { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", ...input },
      ];
      return respond(state.movements.adjustments.at(-1), 201);
    }
    return respond({ error: "Unexpected test request" }, 404);
  });

  return state;
}

async function signIn(page: Page) {
  await page.getByLabel("Email").fill("pilot@example.test");
  await page.getByLabel("Password").fill("Spendwise-test-Password-1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Start by creating your first budget"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create my first budget" }).click();
}

test("authentication controls are labeled and keyboard accessible", async ({
  page,
}) => {
  await enableEnglish(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  const brand = page.getByText("SpendWise", { exact: true });
  await expect(brand).toBeVisible();
  const brandBounds = await brand.boundingBox();
  if (!brandBounds) throw new Error("SpendWise brand is not visible");
  expect(brandBounds.x + brandBounds.width).toBeLessThanOrEqual(360);

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "PT. Change language to Portuguese" }),
  ).toBeFocused();

  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});

test("registers with the required profile name and reports confirmation", async ({
  page,
}) => {
  await enableEnglish(page);
  await mockSignIn(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByLabel("Name").fill("Pilot User");
  await page.getByLabel("Email").fill("pilot@example.test");
  await page.getByLabel("Password").fill("Spendwise-test-Password-1!");
  await page.getByRole("button", { name: "Create account" }).last().click();

  await expect(
    page.getByText(
      "If we can create the account, you'll receive a message with next steps.",
    ),
  ).toBeVisible();
});

test("creates a budget, records virtual movements and reviews annual totals", async ({
  page,
}) => {
  const year = new Date().getFullYear();
  await enableEnglish(page);
  await mockSignIn(page);
  const state = await mockBudgetApi(page);
  await page.goto("/");
  await signIn(page);

  await page.getByLabel("Budget name").fill("Household pilot");
  await page.getByLabel("Currency (ISO code, e.g. EUR)").fill("EUR");
  await page.getByLabel("Start date").fill(`${year}-01-01`);
  await page.getByRole("button", { name: "Yearly" }).click();
  await page.getByRole("button", { name: "Set an end date" }).click();
  await page.getByLabel("End date (optional)").fill(`${year}-12-31`);
  await page.getByLabel("Category name").fill("General");
  await page.getByRole("button", { name: "Save budget" }).click();

  await expect(page.getByText("Budget configured.")).toBeVisible();
  await page.getByText("Income this month").click();
  await expect(page.getByLabel("Amount")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Household pilot" }),
  ).toBeVisible();
  const initialAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(initialAudit.violations).toEqual([]);

  await page.getByLabel("Amount").fill("900");
  await page.getByLabel("Date (YYYY-MM-DD)").fill(`${year}-06-01`);
  await page.getByLabel("Income description (optional)").fill("June salary");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Income recorded.")).toBeVisible();
  await expect(page.getByText("June salary")).toBeVisible();
  await page.getByText("Correct income").click();
  await expect(
    page.getByText("This reason is saved in the income history."),
  ).toBeVisible();
  await page.getByLabel("Correction amount").fill("100");
  await page.getByLabel("Correction date (YYYY-MM-DD)").fill(`${year}-06-05`);
  await page
    .getByLabel("Correction description")
    .fill("June income adjustment");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Income correction recorded.")).toBeVisible();
  await expect(page.getByText("June income adjustment")).toBeVisible();

  await page.getByRole("button", { name: "Recurring" }).click();
  await page.getByLabel("Amount").fill("900");
  await page.getByLabel("First entry date (YYYY-MM-DD)").fill(`${year}-07-01`);
  await page
    .getByLabel("Income description (optional)")
    .fill("Recurring salary");
  await page.getByRole("button", { name: "Create recurring income" }).click();
  await expect(page.getByText("Recurring income created.")).toBeVisible();
  await expect(page.getByText("Recurring salary")).toBeVisible();

  await page.getByRole("button", { name: "Expenses" }).click();
  await page.getByRole("button", { name: "General" }).click();
  await page.getByRole("button", { name: "+ Add type" }).click();
  await page.getByLabel("New expense type").fill("Travel");
  await page.getByRole("button", { name: "Save type" }).click();
  await expect(page.getByRole("button", { name: "Travel" })).toBeVisible();
  await page.getByRole("button", { name: "Groceries" }).click();
  await page.getByLabel("Amount").fill("200");
  await page.getByLabel("Date (YYYY-MM-DD)").fill(`${year}-06-10`);
  await page.getByLabel("Description (optional)").fill("Groceries");
  await page.getByRole("button", { name: "Requested", exact: true }).click();
  await page.getByLabel("Issuing company NIPC").fill("509123456");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Expense recorded.")).toBeVisible();
  await expect(page.getByText(/General · Groceries/)).toBeVisible();
  await expect(
    page.getByText(/Invoice requested · Issuing company NIPC: 509123456/),
  ).toBeVisible();
  await page.getByRole("button", { name: "View requested invoices" }).click();
  await expect(
    page.getByText("Requested invoices", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Year").fill(String(year));
  await page.getByLabel("Month").fill("6");
  await page.getByRole("button", { name: "View invoices" }).click();
  await expect(page.getByText("509123456")).toBeVisible();
  await page.getByRole("button", { name: "Back to movements" }).click();

  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await page.getByRole("button", { name: "View all statistics" }).click();
  await expect(page.getByText("Statistics")).toBeVisible();
  await page.getByRole("button", { name: "View summary" }).click();
  await expect(page.getByText(/1,000\.00/).last()).toBeVisible();
  await expect(page.getByText(/200\.00/).last()).toBeVisible();
  await expect(page.getByText("Expenses by category")).toBeVisible();
  await expect(
    page.getByText("Expenses by type within each category"),
  ).toBeVisible();
  await expect(
    page.getByText("Allocation and balance by category"),
  ).toBeVisible();
  await expect(
    page.getByLabel("Expense distribution by category"),
  ).toBeVisible();
  await expect(page.getByText("Monthly breakdown")).toHaveCount(0);
  expect(state.budgets).toHaveLength(1);
  expect(state.periods).toHaveLength(1);
  expect(state.movements.incomes).toHaveLength(1);
  expect(state.movements.incomes[0]?.description).toBe("June salary");
  expect(state.incomeSchedules[0]?.description).toBe("Recurring salary");
  expect(state.movements.incomeCorrections).toHaveLength(1);
  expect(state.movements.expenses).toHaveLength(1);
  expect(state.movements.expenses[0]?.invoice_status).toBe("REQUESTED");
  expect(state.movements.expenses[0]?.supplier_nipc).toBe("509123456");

  await page.getByRole("button", { name: "Profile and privacy" }).click();
  await expect(page.getByText("My profile")).toBeVisible();
  await page.getByLabel("Name").fill("Updated Pilot");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();
  expect(state.profile.full_name).toBe("Updated Pilot");

  await expect(
    page.getByRole("button", { name: "Request account deletion" }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: "Alex" }).click();
  await page
    .getByRole("switch", {
      name: "I understand this action is permanent and my personal data will be erased; shared history will be pseudonymized.",
    })
    .click();
  await page.getByRole("button", { name: "Request account deletion" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("accepts a one-time shared-budget invitation", async ({ page }) => {
  await enableEnglish(page);
  await mockSignIn(page);
  await mockBudgetApi(page);
  await page.goto("/");
  await signIn(page);
  await page.goto("/invitations/accept?token=synthetic-invitation-token");

  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    page.getByText(
      "Invitation accepted. Your membership in the shared budget is now active.",
    ),
  ).toBeVisible();
});

test("creates and revokes a one-time invitation for a shared budget", async ({
  page,
}) => {
  const year = new Date().getFullYear();
  await enableEnglish(page);
  await mockSignIn(page);
  await mockBudgetApi(page);
  await page.goto("/");
  await signIn(page);

  await page.getByLabel("Budget name").fill("Shared pilot");
  await page.getByRole("button", { name: "Shared" }).click();
  await page.getByLabel("Currency (ISO code, e.g. EUR)").fill("EUR");
  await page.getByLabel("Start date").fill(`${year}-01-01`);
  await page.getByRole("button", { name: "Set an end date" }).click();
  await page.getByLabel("End date (optional)").fill(`${year}-12-31`);
  await page.getByLabel("Category name").fill("General");
  await page.getByRole("button", { name: "Save budget" }).click();

  await expect(page.getByText("Manage invitations")).toBeVisible();
  await page.getByLabel("Invited email").fill("friend@example.test");
  await page.getByRole("radio", { name: "View only" }).click();
  await page.getByRole("button", { name: "Create invitation" }).click();

  await expect(
    page.getByText(/Invitation created\. Copy or share the link now/),
  ).toBeVisible();
  await expect(page.getByText(/#token=synthetic-one-time-token/)).toBeVisible();
  await expect(page.getByText("friend@example.test")).toBeVisible();
  await page.getByRole("button", { name: "Hide link" }).click();
  await expect(page.getByText(/#token=synthetic-one-time-token/)).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Invitation revoked.")).toBeVisible();
  await expect(page.getByText(/· Revoked/)).toBeVisible();
});
