package pt.spendwise.api.authorization;

import java.util.Optional;
import java.util.UUID;

public interface BudgetMembershipRepository {

    Optional<BudgetRole> findCurrentUserActiveRole(UUID budgetId);
}
