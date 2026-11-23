package pt.spendwise.api.privacy;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
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
        List<ExportIncomeSchedule> incomeSchedules) {

    public BudgetDataExport {
        periods = List.copyOf(periods);
        categories = List.copyOf(categories);
        allocations = List.copyOf(allocations);
        incomes = List.copyOf(incomes);
        expenses = List.copyOf(expenses);
        adjustments = List.copyOf(adjustments);
        incomeSchedules = List.copyOf(incomeSchedules);
    }
}
