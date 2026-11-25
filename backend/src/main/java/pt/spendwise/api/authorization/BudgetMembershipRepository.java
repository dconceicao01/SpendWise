package pt.spendwise.api.authorization;

import java.util.Optional;
import java.util.Map;
import java.util.UUID;

public interface BudgetMembershipRepository {

    Optional<BudgetRole> findCurrentUserActiveRole(UUID budgetId);

    Map<UUID, BudgetRole> findCurrentUserActiveRoles();
}
