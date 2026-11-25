package pt.spendwise.api.supabase;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Repository;
import pt.spendwise.api.budget.ExpenseLabelRepository;
import pt.spendwise.api.budget.ExpenseLabelResponse;

@Repository
public class SupabaseExpenseLabelRepository implements ExpenseLabelRepository {
    private static final String SELECT_LABEL = "id,budget_id,category_id,name,is_system,created_at";
    private static final ParameterizedTypeReference<List<ExpenseLabelResponse>> LABEL_ROWS =
            new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<UUID> LABEL_ID = new ParameterizedTypeReference<>() {};
    private final SupabaseDataApiClient dataApiClient;

    public SupabaseExpenseLabelRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public List<ExpenseLabelResponse> findForCategory(UUID budgetId, UUID categoryId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_LABEL);
        query.put("budget_id", "eq." + budgetId);
        query.put("category_id", "eq." + categoryId);
        query.put("is_system", "eq.false");
        query.put("order", "name.asc");
        List<ExpenseLabelResponse> rows = dataApiClient.request(
                HttpMethod.GET, "expense_labels", query, null, LABEL_ROWS);
        return rows == null ? List.of() : List.copyOf(rows);
    }

    @Override
    public ExpenseLabelResponse create(UUID budgetId, UUID categoryId, String name) {
        UUID labelId = dataApiClient.callFunction(
                "create_expense_label",
                Map.of("p_budget_id", budgetId, "p_category_id", categoryId, "p_name", name),
                LABEL_ID);
        if (labelId == null) {
            throw new IllegalStateException("Supabase did not return the created expense label id");
        }
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_LABEL);
        query.put("budget_id", "eq." + budgetId);
        query.put("category_id", "eq." + categoryId);
        query.put("id", "eq." + labelId);
        List<ExpenseLabelResponse> rows = dataApiClient.request(
                HttpMethod.GET, "expense_labels", query, null, LABEL_ROWS);
        if (rows == null || rows.isEmpty()) {
            throw new IllegalStateException("Created expense label is not visible to its member");
        }
        return rows.getFirst();
    }

}
