package pt.spendwise.api.budget;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BudgetCategoryRepository {

    List<BudgetCategoryResponse> findForBudget(UUID budgetId);

    BudgetCategoryResponse create(UUID budgetId, String name);

    Optional<BudgetCategoryResponse> updateName(UUID budgetId, UUID categoryId, String name);

    Optional<BudgetCategoryResponse> archive(UUID budgetId, UUID categoryId);
}
