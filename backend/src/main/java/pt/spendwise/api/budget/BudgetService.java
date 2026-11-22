package pt.spendwise.api.budget;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

@Service
public class BudgetService {

    private final BudgetRepository budgetRepository;
    private final BudgetAuthorizationService authorizationService;

    public BudgetService(BudgetRepository budgetRepository, BudgetAuthorizationService authorizationService) {
        this.budgetRepository = budgetRepository;
        this.authorizationService = authorizationService;
    }

    public BudgetResponse create(CreateBudgetRequest request) {
        return budgetRepository.create(request.name(), request.budgetType(), request.currencyCode());
    }

    public List<BudgetResponse> listForCurrentUser() {
        return budgetRepository.findAllVisibleToCurrentUser();
    }

    public BudgetResponse get(UUID budgetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        return budgetRepository.findVisibleById(budgetId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Budget not found"));
    }

    public BudgetResponse rename(UUID budgetId, UpdateBudgetRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        return budgetRepository.updateName(budgetId, request.name())
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"));
    }

    public BudgetResponse archive(UUID budgetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        BudgetResponse current = budgetRepository.findVisibleById(budgetId)
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"));
        if (current.archivedAt() != null) {
            return current;
        }
        return budgetRepository.archive(budgetId)
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"));
    }
}
