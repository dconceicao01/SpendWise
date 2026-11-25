package pt.spendwise.api.privacy;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;
import java.util.List;
import pt.spendwise.api.budget.AllocationSetResponse;
import pt.spendwise.api.budget.BudgetCategoryResponse;
import pt.spendwise.api.budget.BudgetPeriodResponse;
import pt.spendwise.api.budget.BudgetResponse;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record BudgetDataExport(
        BudgetResponse budget,
        List<BudgetPeriodResponse> periods,
        List<BudgetCategoryResponse> categories,
        List<AllocationSetResponse> allocations,
        List<ExportIncome> incomes,
        List<ExportExpense> expenses,
        List<ExportAdjustment> adjustments,
        List<ExportIncomeCorrection> incomeCorrections,
        List<ExportIncomeSchedule> incomeSchedules) {

    public BudgetDataExport {
        periods = List.copyOf(periods);
        categories = List.copyOf(categories);
        allocations = List.copyOf(allocations);
        incomes = List.copyOf(incomes);
        expenses = List.copyOf(expenses);
        adjustments = List.copyOf(adjustments);
        incomeCorrections = List.copyOf(incomeCorrections);
        incomeSchedules = List.copyOf(incomeSchedules);
    }
}
