package pt.spendwise.api.budget;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

@Service
public class ExpenseLabelService {
    private static final String LABEL_CONFLICT = "Expense label already exists or category is unavailable";
    private final ExpenseLabelRepository repository;
    private final BudgetAuthorizationService authorizationService;

    public ExpenseLabelService(ExpenseLabelRepository repository, BudgetAuthorizationService authorizationService) {
        this.repository = repository;
        this.authorizationService = authorizationService;
    }

    public List<ExpenseLabelResponse> list(UUID budgetId, UUID categoryId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        return repository.findForCategory(budgetId, categoryId);
    }

    public ExpenseLabelResponse create(UUID budgetId, UUID categoryId, CreateExpenseLabelRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.RECORD_MOVEMENT);
        try {
            return repository.create(budgetId, categoryId, request.name().strip());
        } catch (RestClientResponseException exception) {
            throw BudgetDomainErrors.translate(
                    exception, LABEL_CONFLICT);
        }
    }
}
