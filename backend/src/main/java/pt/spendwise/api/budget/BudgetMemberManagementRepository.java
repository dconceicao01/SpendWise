package pt.spendwise.api.budget;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BudgetMemberManagementRepository {

    List<BudgetMemberResponse> findForBudget(UUID budgetId);

    Optional<BudgetMemberResponse> changeRole(UUID budgetId, UUID memberId, BudgetMemberRole role);

    Optional<BudgetMemberResponse> remove(UUID budgetId, UUID memberId);
}
