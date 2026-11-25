package pt.spendwise.api.budget;

import java.util.List;
import java.util.UUID;

public interface ExpenseLabelRepository {
    List<ExpenseLabelResponse> findForCategory(UUID budgetId, UUID categoryId);

    ExpenseLabelResponse create(UUID budgetId, UUID categoryId, String name);
}
