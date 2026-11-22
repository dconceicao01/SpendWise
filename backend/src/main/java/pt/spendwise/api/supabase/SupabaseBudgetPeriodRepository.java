package pt.spendwise.api.supabase;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Repository;
import pt.spendwise.api.budget.BudgetPeriodRepository;
import pt.spendwise.api.budget.BudgetPeriodResponse;

@Repository
public class SupabaseBudgetPeriodRepository implements BudgetPeriodRepository {

    private static final String SELECT_PERIOD = "id,budget_id,starts_on,ends_on,created_at";
    private static final ParameterizedTypeReference<List<BudgetPeriodResponse>> PERIOD_ROWS =
            new ParameterizedTypeReference<>() {
            };

    private final SupabaseDataApiClient dataApiClient;

    public SupabaseBudgetPeriodRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public List<BudgetPeriodResponse> findForBudget(UUID budgetId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_PERIOD);
        query.put("budget_id", "eq." + budgetId);
        query.put("order", "starts_on.asc");
        List<BudgetPeriodResponse> rows = dataApiClient.request(
                HttpMethod.GET, "budget_periods", query, null, PERIOD_ROWS);
        return rows == null ? List.of() : List.copyOf(rows);
    }

    @Override
    public Optional<BudgetPeriodResponse> create(UUID budgetId, LocalDate startsOn, LocalDate endsOn) {
        Map<String, String> query = Map.of("select", SELECT_PERIOD);
        Map<String, Object> body = Map.of(
                "budget_id", budgetId,
                "starts_on", startsOn.toString(),
                "ends_on", endsOn.toString());
        return findFirst(dataApiClient.requestReturningRepresentation(
                HttpMethod.POST, "budget_periods", query, body, PERIOD_ROWS));
    }

    @Override
    public Optional<BudgetPeriodResponse> update(
            UUID budgetId,
            UUID periodId,
            LocalDate startsOn,
            LocalDate endsOn) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_PERIOD);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + periodId);
        Map<String, Object> body = Map.of("starts_on", startsOn.toString(), "ends_on", endsOn.toString());
        return findFirst(dataApiClient.requestReturningRepresentation(
                HttpMethod.PATCH, "budget_periods", query, body, PERIOD_ROWS));
    }

    private Optional<BudgetPeriodResponse> findFirst(List<BudgetPeriodResponse> rows) {
        return rows == null ? Optional.empty() : rows.stream().findFirst();
    }
}
