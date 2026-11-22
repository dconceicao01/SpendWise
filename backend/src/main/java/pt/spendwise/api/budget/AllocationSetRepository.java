package pt.spendwise.api.budget;

import java.util.List;
import java.util.UUID;

public interface AllocationSetRepository {

    List<AllocationSetResponse> findForBudget(UUID budgetId);

    AllocationSetResponse createDraft(UUID budgetId, List<AllocationItemRequest> items);

    AllocationSetResponse replaceDraftItems(UUID budgetId, UUID allocationSetId, List<AllocationItemRequest> items);

    AllocationSetResponse activate(UUID budgetId, UUID allocationSetId);
}
