package pt.spendwise.api.budget;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;
import pt.spendwise.api.authorization.BudgetRole;

@Service
public class BudgetService {

    private final BudgetRepository budgetRepository;
    private final BudgetAuthorizationService authorizationService;

    public BudgetService(BudgetRepository budgetRepository, BudgetAuthorizationService authorizationService) {
        this.budgetRepository = budgetRepository;
        this.authorizationService = authorizationService;
    }

    public BudgetResponse create(CreateBudgetRequest request) {
        return budgetRepository.create(request.name(), request.budgetType(), request.currencyCode())
                .withCurrentUserRole(BudgetRole.OWNER);
    }

    public List<BudgetResponse> listForCurrentUser() {
        Map<UUID, BudgetRole> roles = authorizationService.currentRoles();
        return budgetRepository.findAllVisibleToCurrentUser().stream()
                .map(budget -> budget.withCurrentUserRole(roles.get(budget.id())))
                .toList();
    }

    public BudgetResponse get(UUID budgetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        BudgetRole role = authorizationService.currentRole(budgetId).orElse(null);
        return budgetRepository.findVisibleById(budgetId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Budget not found"))
                .withCurrentUserRole(role);
    }

    public BudgetResponse rename(UUID budgetId, UpdateBudgetRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        if (request.periodFrequency() == null) {
            return budgetRepository.updateName(budgetId, request.name())
                    .orElseThrow(() -> new AccessDeniedException("Budget access denied"))
                    .withCurrentUserRole(BudgetRole.OWNER);
        }
        BudgetResponse existing = budgetRepository.findVisibleById(budgetId)
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"));
        BudgetPeriodFrequency requestedFrequency = request.periodFrequency();
        LocalDate requestedAnchor = request.periodAnchorStart() == null
                ? existing.periodAnchorStart()
                : request.periodAnchorStart();
        LocalDate requestedEnd = request.periodEndOn();
        if (existing.periodFrequency() != BudgetPeriodFrequency.CUSTOM
                && requestedFrequency != existing.periodFrequency()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Budget period frequency cannot be changed");
        }
        if (existing.periodAnchorStart() != null && requestedAnchor != null
                && !existing.periodAnchorStart().equals(requestedAnchor)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Budget period start date cannot be changed");
        }
        if (requestedFrequency != BudgetPeriodFrequency.CUSTOM && requestedAnchor == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Budget period start date is required");
        }
        if (requestedEnd != null && requestedAnchor != null && requestedEnd.isBefore(requestedAnchor)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Budget end date must not precede its start date");
        }
        return budgetRepository.update(budgetId, new UpdateBudgetRequest(
                        request.name(), requestedFrequency, requestedAnchor, requestedEnd))
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"))
                .withCurrentUserRole(BudgetRole.OWNER);
    }

    public BudgetResponse archive(UUID budgetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        BudgetResponse current = budgetRepository.findVisibleById(budgetId)
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"));
        if (current.archivedAt() != null) {
            return current.withCurrentUserRole(BudgetRole.OWNER);
        }
        return budgetRepository.archive(budgetId)
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"))
                .withCurrentUserRole(BudgetRole.OWNER);
    }

    public BudgetResponse restore(UUID budgetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        BudgetResponse current = budgetRepository.findVisibleById(budgetId)
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"));
        if (current.archivedAt() == null) {
            return current.withCurrentUserRole(BudgetRole.OWNER);
        }
        return budgetRepository.restore(budgetId)
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"))
                .withCurrentUserRole(BudgetRole.OWNER);
    }
}
