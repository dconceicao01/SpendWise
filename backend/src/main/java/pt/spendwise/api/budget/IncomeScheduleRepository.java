package pt.spendwise.api.budget;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IncomeScheduleRepository {

    List<IncomeScheduleResponse> findForBudget(UUID budgetId, int limit, int offset);

    Optional<IncomeScheduleResponse> create(UUID budgetId, CreateIncomeScheduleRequest request);

    Optional<IncomeScheduleResponse> updateStatus(
            UUID budgetId, UUID scheduleId, IncomeScheduleStatus status);
}
