package pt.spendwise.api.supabase;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Repository;
import pt.spendwise.api.budget.CreateIncomeScheduleRequest;
import pt.spendwise.api.budget.IncomeScheduleRepository;
import pt.spendwise.api.budget.IncomeScheduleResponse;
import pt.spendwise.api.budget.IncomeScheduleStatus;

@Repository
public class SupabaseIncomeScheduleRepository implements IncomeScheduleRepository {

    private static final String SELECT_SCHEDULE =
            "id,budget_id,income_member_id,created_by_member_id,amount,frequency,monthly_short_month_behavior,start_date,end_date,next_occurrence_on,status,created_at,updated_at";
    private static final ParameterizedTypeReference<List<IncomeScheduleResponse>> SCHEDULE_ROWS =
            new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<UUID> UUID_RESULT =
            new ParameterizedTypeReference<>() {};

    private final SupabaseDataApiClient dataApiClient;

    public SupabaseIncomeScheduleRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public List<IncomeScheduleResponse> findForBudget(UUID budgetId, int limit, int offset) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_SCHEDULE);
        query.put("budget_id", "eq." + budgetId);
        query.put("order", "next_occurrence_on.asc,created_at.desc");
        query.put("limit", Integer.toString(limit));
        query.put("offset", Integer.toString(offset));
        List<IncomeScheduleResponse> rows =
                dataApiClient.request(HttpMethod.GET, "income_schedules", query, null, SCHEDULE_ROWS);
        return rows == null ? List.of() : List.copyOf(rows);
    }

    @Override
    public Optional<IncomeScheduleResponse> create(UUID budgetId, CreateIncomeScheduleRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("p_budget_id", budgetId);
        body.put("p_amount", request.amount());
        body.put("p_frequency", request.frequency().name());
        body.put("p_start_date", request.startDate().toString());
        body.put("p_end_date", request.endDate() == null ? null : request.endDate().toString());
        body.put("p_monthly_short_month_behavior", request.monthlyShortMonthBehavior().name());
        UUID id = dataApiClient.callFunction("create_income_schedule", body, UUID_RESULT);
        return id == null ? Optional.empty() : findById(budgetId, id);
    }

    @Override
    public Optional<IncomeScheduleResponse> updateStatus(
            UUID budgetId, UUID scheduleId, IncomeScheduleStatus status) {
        UUID id = dataApiClient.callFunction(
                "update_income_schedule_status",
                Map.of("p_budget_id", budgetId, "p_schedule_id", scheduleId, "p_status", status.name()),
                UUID_RESULT);
        return id == null ? Optional.empty() : findById(budgetId, id);
    }

    private Optional<IncomeScheduleResponse> findById(UUID budgetId, UUID scheduleId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_SCHEDULE);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + scheduleId);
        query.put("limit", "1");
        List<IncomeScheduleResponse> rows =
                dataApiClient.request(HttpMethod.GET, "income_schedules", query, null, SCHEDULE_ROWS);
        return rows == null ? Optional.empty() : rows.stream().findFirst();
    }
}
