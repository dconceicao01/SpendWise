package pt.spendwise.api.budget;

import java.util.List;
import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

@Service
public class AllocationSetService {

    private static final String ALLOCATION_CONFLICT =
            "Allocation must use active categories and total exactly 100% before activation";
    private final AllocationSetRepository allocationRepository;
    private final BudgetAuthorizationService authorizationService;

    public AllocationSetService(
            AllocationSetRepository allocationRepository,
            BudgetAuthorizationService authorizationService) {
        this.allocationRepository = allocationRepository;
        this.authorizationService = authorizationService;
    }

    public List<AllocationSetResponse> list(UUID budgetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        return allocationRepository.findForBudget(budgetId);
    }

    public AllocationSetResponse createDraft(UUID budgetId, CreateAllocationSetRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        validateItems(request.items());
        try {
            return allocationRepository.createDraft(budgetId, request.items());
        } catch (RestClientResponseException exception) {
            throw BudgetDomainErrors.translate(exception, ALLOCATION_CONFLICT);
        }
    }

    public AllocationSetResponse replaceDraftItems(
            UUID budgetId, UUID allocationSetId, ReplaceAllocationItemsRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        validateItems(request.items());
        try {
            return allocationRepository.replaceDraftItems(budgetId, allocationSetId, request.items());
        } catch (RestClientResponseException exception) {
            throw BudgetDomainErrors.translate(exception, ALLOCATION_CONFLICT);
        }
    }

    public AllocationSetResponse activate(UUID budgetId, UUID allocationSetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        try {
            return allocationRepository.activate(budgetId, allocationSetId);
        } catch (RestClientResponseException exception) {
            throw BudgetDomainErrors.translate(exception, ALLOCATION_CONFLICT);
        }
    }

    private void validateItems(List<AllocationItemRequest> items) {
        long distinctCategories = items.stream().map(AllocationItemRequest::categoryId).distinct().count();
        if (distinctCategories != items.size()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Each category can appear only once");
        }
    }
}
