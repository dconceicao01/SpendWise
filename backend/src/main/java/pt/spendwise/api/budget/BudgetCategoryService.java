package pt.spendwise.api.budget;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

@Service
public class BudgetCategoryService {

    private static final String CATEGORY_CONFLICT = "Category name is already in use or the category is in an active allocation";
    private final BudgetCategoryRepository categoryRepository;
    private final BudgetAuthorizationService authorizationService;

    public BudgetCategoryService(
            BudgetCategoryRepository categoryRepository,
            BudgetAuthorizationService authorizationService) {
        this.categoryRepository = categoryRepository;
        this.authorizationService = authorizationService;
    }

    public List<BudgetCategoryResponse> list(UUID budgetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        return categoryRepository.findForBudget(budgetId);
    }

    public BudgetCategoryResponse create(UUID budgetId, CreateBudgetCategoryRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        try {
            return categoryRepository.create(budgetId, request.name().strip());
        } catch (RestClientResponseException exception) {
            throw BudgetDomainErrors.translate(exception, CATEGORY_CONFLICT);
        }
    }

    public BudgetCategoryResponse rename(UUID budgetId, UUID categoryId, UpdateBudgetCategoryRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        try {
            return categoryRepository.updateName(budgetId, categoryId, request.name().strip())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
        } catch (RestClientResponseException exception) {
            throw BudgetDomainErrors.translate(exception, CATEGORY_CONFLICT);
        }
    }

    public BudgetCategoryResponse archive(UUID budgetId, UUID categoryId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        try {
            return categoryRepository.archive(budgetId, categoryId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
        } catch (RestClientResponseException exception) {
            throw BudgetDomainErrors.translate(exception, CATEGORY_CONFLICT);
        }
    }
}
