package pt.spendwise.api.budget;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BudgetPeriodRepository {

    List<BudgetPeriodResponse> findForBudget(UUID budgetId);

    Optional<BudgetPeriodResponse> create(UUID budgetId, LocalDate startsOn, LocalDate endsOn);

    Optional<BudgetPeriodResponse> update(
            UUID budgetId,
            UUID periodId,
            LocalDate startsOn,
            LocalDate endsOn);
}
