package pt.spendwise.api.budget;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BudgetMovementRepository {

    List<IncomeEntryResponse> findIncomes(UUID budgetId, UUID periodId, int limit, int offset);

    Optional<IncomeEntryResponse> recordIncome(UUID budgetId, CreateIncomeRequest request);

    List<IncomeCorrectionResponse> findIncomeCorrections(UUID budgetId, UUID periodId, int limit, int offset);

    Optional<IncomeCorrectionResponse> recordIncomeCorrection(
            UUID budgetId, UUID incomeEntryId, CreateIncomeCorrectionRequest request);

    List<ExpenseEntryResponse> findExpenses(UUID budgetId, UUID periodId, int limit, int offset);

    Optional<ExpenseEntryResponse> recordExpense(UUID budgetId, CreateExpenseRequest request);

    List<BudgetAdjustmentResponse> findAdjustments(UUID budgetId, UUID periodId, int limit, int offset);

    Optional<BudgetAdjustmentResponse> recordAdjustment(UUID budgetId, CreateBudgetAdjustmentRequest request);
}
