package pt.spendwise.api.supabase;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Repository;
import pt.spendwise.api.budget.AllocationItemRequest;
import pt.spendwise.api.budget.AllocationItemResponse;
import pt.spendwise.api.budget.AllocationSetRepository;
import pt.spendwise.api.budget.AllocationSetResponse;

@Repository
public class SupabaseAllocationSetRepository implements AllocationSetRepository {

    private static final String SELECT_SET = "id,budget_id,version,status,effective_from,created_at";
    private static final ParameterizedTypeReference<List<AllocationSetRow>> ALLOCATION_SET_ROWS =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<List<AllocationItemRow>> ALLOCATION_ITEM_ROWS =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<List<AllocationSetCreationResult>> CREATED_ALLOCATION_SETS =
            new ParameterizedTypeReference<>() {
            };

    private final SupabaseDataApiClient dataApiClient;

    public SupabaseAllocationSetRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public List<AllocationSetResponse> findForBudget(UUID budgetId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_SET);
        query.put("budget_id", "eq." + budgetId);
        query.put("order", "version.desc");
        List<AllocationSetRow> sets = dataApiClient.request(
                HttpMethod.GET, "budget_allocation_sets", query, null, ALLOCATION_SET_ROWS);
        if (sets == null || sets.isEmpty()) {
            return List.of();
        }
        return sets.stream().map(this::withItems).toList();
    }

    @Override
    public AllocationSetResponse createDraft(UUID budgetId, List<AllocationItemRequest> items) {
        List<AllocationSetCreationResult> results = dataApiClient.callFunction(
                "create_budget_allocation_draft",
                Map.of("p_budget_id", budgetId, "p_items", toDatabaseItems(items)),
                CREATED_ALLOCATION_SETS);
        if (results == null || results.size() != 1 || results.getFirst().allocationSetId() == null) {
            throw new IllegalStateException("Supabase did not return the created allocation set id");
        }
        return findSet(budgetId, results.getFirst().allocationSetId())
                .orElseThrow(() -> new IllegalStateException("Created allocation set is not visible to its owner"));
    }

    @Override
    public AllocationSetResponse replaceDraftItems(
            UUID budgetId, UUID allocationSetId, List<AllocationItemRequest> items) {
        List<AllocationSetCreationResult> results = dataApiClient.callFunction(
                "replace_budget_allocation_draft",
                Map.of(
                        "p_budget_id", budgetId,
                        "p_allocation_set_id", allocationSetId,
                        "p_items", toDatabaseItems(items)),
                CREATED_ALLOCATION_SETS);
        if (results == null || results.size() != 1 || results.getFirst().allocationSetId() == null) {
            throw new IllegalStateException("Supabase did not return the updated allocation set id");
        }
        return findSet(budgetId, allocationSetId)
                .orElseThrow(() -> new IllegalStateException("Updated allocation set is not visible to its owner"));
    }

    @Override
    public AllocationSetResponse activate(UUID budgetId, UUID allocationSetId) {
        dataApiClient.callFunction(
                "activate_budget_allocation_set",
                Map.of("p_budget_id", budgetId, "p_allocation_set_id", allocationSetId),
                new ParameterizedTypeReference<Object>() {
                });
        return findSet(budgetId, allocationSetId)
                .orElseThrow(() -> new IllegalStateException("Activated allocation set is not visible to its owner"));
    }

    private Optional<AllocationSetResponse> findSet(UUID budgetId, UUID allocationSetId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_SET);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + allocationSetId);
        List<AllocationSetRow> rows = dataApiClient.request(
                HttpMethod.GET, "budget_allocation_sets", query, null, ALLOCATION_SET_ROWS);
        return rows == null ? Optional.empty() : rows.stream().findFirst().map(this::withItems);
    }

    private AllocationSetResponse withItems(AllocationSetRow set) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", "category_id,percentage_basis_points");
        query.put("budget_id", "eq." + set.budgetId());
        query.put("allocation_set_id", "eq." + set.id());
        query.put("order", "category_id.asc");
        List<AllocationItemRow> rows = dataApiClient.request(
                HttpMethod.GET, "budget_allocation_items", query, null, ALLOCATION_ITEM_ROWS);
        List<AllocationItemResponse> items = rows == null ? List.of() : rows.stream()
                .map(item -> AllocationItemResponse.from(item.categoryId(), item.percentageBasisPoints()))
                .toList();
        return new AllocationSetResponse(
                set.id(), set.budgetId(), set.version(), set.status(), set.effectiveFrom(), set.createdAt(), items);
    }

    private List<Map<String, Object>> toDatabaseItems(List<AllocationItemRequest> items) {
        List<Map<String, Object>> databaseItems = new ArrayList<>(items.size());
        for (AllocationItemRequest item : items) {
            databaseItems.add(Map.of(
                    "category_id", item.categoryId(),
                    "percentage_basis_points", item.percentage().movePointRight(2).intValueExact()));
        }
        return databaseItems;
    }

    private record AllocationSetRow(
            UUID id,
            @JsonProperty("budget_id") UUID budgetId,
            int version,
            String status,
            @JsonProperty("effective_from") java.time.LocalDate effectiveFrom,
            @JsonProperty("created_at") java.time.Instant createdAt) {
    }

    private record AllocationItemRow(
            @JsonProperty("category_id") UUID categoryId,
            @JsonProperty("percentage_basis_points") int percentageBasisPoints) {
    }

    private record AllocationSetCreationResult(@JsonProperty("allocation_set_id") UUID allocationSetId) {
    }
}
