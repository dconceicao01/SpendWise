package pt.spendwise.api.supabase;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.Collections;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Repository;
import pt.spendwise.api.budget.BudgetRepository;
import pt.spendwise.api.budget.BudgetResponse;
import pt.spendwise.api.budget.BudgetType;

@Repository
public class SupabaseBudgetRepository implements BudgetRepository {

    private static final String SELECT_BUDGET = "id,name,budget_type,currency_code,created_at,archived_at";
    private static final ParameterizedTypeReference<List<BudgetResponse>> BUDGET_ROWS =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<List<BudgetCreationResult>> CREATED_BUDGETS =
            new ParameterizedTypeReference<>() {
            };

    private final SupabaseDataApiClient dataApiClient;

    public SupabaseBudgetRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public List<BudgetResponse> findAllVisibleToCurrentUser() {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_BUDGET);
        query.put("order", "created_at.desc");
        List<BudgetResponse> rows = dataApiClient.request(
                HttpMethod.GET, "budgets", query, null, BUDGET_ROWS);
        return rows == null ? List.of() : List.copyOf(rows);
    }

    @Override
    public Optional<BudgetResponse> findVisibleById(UUID budgetId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_BUDGET);
        query.put("id", "eq." + budgetId);
        return findFirst(dataApiClient.request(HttpMethod.GET, "budgets", query, null, BUDGET_ROWS));
    }

    @Override
    public Optional<BudgetResponse> updateName(UUID budgetId, String name) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_BUDGET);
        query.put("id", "eq." + budgetId);
        List<BudgetResponse> rows = dataApiClient.requestReturningRepresentation(
                HttpMethod.PATCH,
                "budgets",
                query,
                Map.of("name", name.strip()),
                BUDGET_ROWS);
        return findFirst(rows);
    }

    @Override
    public Optional<BudgetResponse> archive(UUID budgetId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_BUDGET);
        query.put("id", "eq." + budgetId);
        query.put("archived_at", "is.null");
        List<BudgetResponse> rows = dataApiClient.requestReturningRepresentation(
                HttpMethod.PATCH,
                "budgets",
                query,
                Map.of("archived_at", java.time.Instant.now().toString()),
                BUDGET_ROWS);
        return findFirst(rows);
    }

    @Override
    public Optional<BudgetResponse> restore(UUID budgetId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_BUDGET);
        query.put("id", "eq." + budgetId);
        query.put("archived_at", "not.is.null");
        List<BudgetResponse> rows = dataApiClient.requestReturningRepresentation(
                HttpMethod.PATCH,
                "budgets",
                query,
                Collections.singletonMap("archived_at", null),
                BUDGET_ROWS);
        return findFirst(rows);
    }

    @Override
    public BudgetResponse create(String name, BudgetType budgetType, String currencyCode) {
        List<BudgetCreationResult> results = dataApiClient.callFunction(
                "create_budget",
                Map.of(
                        "p_name", name.strip(),
                        "p_budget_type", budgetType.name(),
                        "p_currency_code", currencyCode),
                CREATED_BUDGETS);
        if (results == null || results.size() != 1 || results.getFirst().budgetId() == null) {
            throw new IllegalStateException("Supabase did not return the created budget id");
        }
        return findVisibleById(results.getFirst().budgetId())
                .orElseThrow(() -> new IllegalStateException("Created budget is not visible to its owner"));
    }

    private Optional<BudgetResponse> findFirst(List<BudgetResponse> rows) {
        return rows == null ? Optional.empty() : rows.stream().findFirst();
    }

    private record BudgetCreationResult(@JsonProperty("budget_id") UUID budgetId) {
    }
}
