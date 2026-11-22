package pt.spendwise.api.budget;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BudgetRepository {

    List<BudgetResponse> findAllVisibleToCurrentUser();

    Optional<BudgetResponse> findVisibleById(UUID budgetId);

    Optional<BudgetResponse> updateName(UUID budgetId, String name);

    Optional<BudgetResponse> archive(UUID budgetId);

    BudgetResponse create(String name, BudgetType budgetType, String currencyCode);
}
