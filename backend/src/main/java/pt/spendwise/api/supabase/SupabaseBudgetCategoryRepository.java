package pt.spendwise.api.supabase;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Repository;
import pt.spendwise.api.budget.BudgetCategoryRepository;
import pt.spendwise.api.budget.BudgetCategoryResponse;

@Repository
public class SupabaseBudgetCategoryRepository implements BudgetCategoryRepository {

    private static final String SELECT_CATEGORY = "id,budget_id,name,created_at,archived_at";
    private static final ParameterizedTypeReference<List<BudgetCategoryResponse>> CATEGORY_ROWS =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<List<CategoryCreationResult>> CREATED_CATEGORIES =
            new ParameterizedTypeReference<>() {
            };

    private final SupabaseDataApiClient dataApiClient;

    public SupabaseBudgetCategoryRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public List<BudgetCategoryResponse> findForBudget(UUID budgetId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_CATEGORY);
        query.put("budget_id", "eq." + budgetId);
        query.put("order", "created_at.asc");
        List<BudgetCategoryResponse> rows = dataApiClient.request(
                HttpMethod.GET, "budget_categories", query, null, CATEGORY_ROWS);
        return rows == null ? List.of() : List.copyOf(rows);
    }

    @Override
    public BudgetCategoryResponse create(UUID budgetId, String name) {
        List<CategoryCreationResult> results = dataApiClient.callFunction(
                "create_budget_category",
                Map.of("p_budget_id", budgetId, "p_name", name),
                CREATED_CATEGORIES);
        if (results == null || results.size() != 1 || results.getFirst().categoryId() == null) {
            throw new IllegalStateException("Supabase did not return the created category id");
        }
        return findById(budgetId, results.getFirst().categoryId())
                .orElseThrow(() -> new IllegalStateException("Created category is not visible to its owner"));
    }

    @Override
    public Optional<BudgetCategoryResponse> updateName(UUID budgetId, UUID categoryId, String name) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_CATEGORY);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + categoryId);
        List<BudgetCategoryResponse> rows = dataApiClient.requestReturningRepresentation(
                HttpMethod.PATCH, "budget_categories", query, Map.of("name", name), CATEGORY_ROWS);
        return first(rows);
    }

    @Override
    public Optional<BudgetCategoryResponse> archive(UUID budgetId, UUID categoryId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_CATEGORY);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + categoryId);
        query.put("archived_at", "is.null");
        List<BudgetCategoryResponse> rows = dataApiClient.requestReturningRepresentation(
                HttpMethod.PATCH,
                "budget_categories",
                query,
                Map.of("archived_at", Instant.now().toString()),
                CATEGORY_ROWS);
        return first(rows);
    }

    private Optional<BudgetCategoryResponse> findById(UUID budgetId, UUID categoryId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_CATEGORY);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + categoryId);
        return first(dataApiClient.request(HttpMethod.GET, "budget_categories", query, null, CATEGORY_ROWS));
    }

    private Optional<BudgetCategoryResponse> first(List<BudgetCategoryResponse> rows) {
        return rows == null ? Optional.empty() : rows.stream().findFirst();
    }

    private record CategoryCreationResult(@JsonProperty("category_id") UUID categoryId) {
    }
}
