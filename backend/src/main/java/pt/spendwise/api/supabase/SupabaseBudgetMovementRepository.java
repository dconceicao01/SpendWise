package pt.spendwise.api.supabase;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Repository;
import pt.spendwise.api.budget.BudgetAdjustmentResponse;
import pt.spendwise.api.budget.BudgetMovementRepository;
import pt.spendwise.api.budget.CreateBudgetAdjustmentRequest;
import pt.spendwise.api.budget.CreateExpenseRequest;
import pt.spendwise.api.budget.CreateIncomeRequest;
import pt.spendwise.api.budget.CreateIncomeCorrectionRequest;
import pt.spendwise.api.budget.ExpenseEntryResponse;
import pt.spendwise.api.budget.IncomeAllocationSnapshotResponse;
import pt.spendwise.api.budget.IncomeCorrectionAllocationResponse;
import pt.spendwise.api.budget.IncomeCorrectionResponse;
import pt.spendwise.api.budget.IncomeEntryResponse;

@Repository
public class SupabaseBudgetMovementRepository implements BudgetMovementRepository {

    private static final String SELECT_INCOME =
            "id,budget_id,period_id,income_member_id,recorded_by_member_id,allocation_set_id,schedule_id,scheduled_for,amount,occurred_on,description,created_at";
    private static final String SELECT_SNAPSHOT =
            "income_entry_id,category_id,percentage_basis_points,allocated_amount";
    private static final String SELECT_EXPENSE =
            "id,budget_id,period_id,category_id,recorded_by_member_id,amount,spent_on,description,created_at";
    private static final String SELECT_ADJUSTMENT =
            "id,budget_id,period_id,category_id,corrected_expense_entry_id,recorded_by_member_id,amount_delta,reason,occurred_on,created_at";
    private static final String SELECT_INCOME_CORRECTION =
            "id,budget_id,income_entry_id,period_id,allocation_set_id,recorded_by_member_id,amount_delta,reason,occurred_on,created_at";
    private static final String SELECT_INCOME_CORRECTION_SNAPSHOT =
            "income_correction_id,category_id,percentage_basis_points,allocated_amount";

    private static final ParameterizedTypeReference<List<IncomeRow>> INCOME_ROWS =
            new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<SnapshotRow>> SNAPSHOT_ROWS =
            new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<ExpenseEntryResponse>> EXPENSE_ROWS =
            new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<BudgetAdjustmentResponse>> ADJUSTMENT_ROWS =
            new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<IncomeCorrectionRow>> INCOME_CORRECTION_ROWS =
            new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<List<IncomeCorrectionSnapshotRow>> INCOME_CORRECTION_SNAPSHOT_ROWS =
            new ParameterizedTypeReference<>() {};
    private static final ParameterizedTypeReference<UUID> UUID_RESULT =
            new ParameterizedTypeReference<>() {};

    private final SupabaseDataApiClient dataApiClient;

    public SupabaseBudgetMovementRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public List<IncomeEntryResponse> findIncomes(UUID budgetId, UUID periodId, int limit, int offset) {
        Map<String, String> query =
                movementQuery(budgetId, periodId, SELECT_INCOME, "occurred_on.desc,created_at.desc", limit, offset);
        List<IncomeRow> rows = dataApiClient.request(HttpMethod.GET, "income_entries", query, null, INCOME_ROWS);
        return withSnapshots(budgetId, rows);
    }

    @Override
    public Optional<IncomeEntryResponse> recordIncome(UUID budgetId, CreateIncomeRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("p_budget_id", budgetId);
        body.put("p_period_id", request.periodId());
        body.put("p_amount", request.amount());
        body.put("p_occurred_on", request.occurredOn().toString());
        body.put("p_description", request.description());
        body.put("p_schedule_id", null);
        body.put("p_scheduled_for", null);
        body.put("p_recorder_member_id", null);
        UUID incomeId = dataApiClient.callFunction(
                "record_income_with_description", body, UUID_RESULT);
        if (incomeId == null) {
            return Optional.empty();
        }
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_INCOME);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + incomeId);
        query.put("limit", "1");
        List<IncomeRow> rows = dataApiClient.request(HttpMethod.GET, "income_entries", query, null, INCOME_ROWS);
        return withSnapshots(budgetId, rows).stream().findFirst();
    }

    @Override
    public List<IncomeCorrectionResponse> findIncomeCorrections(
            UUID budgetId, UUID periodId, int limit, int offset) {
        Map<String, String> query = movementQuery(
                budgetId, periodId, SELECT_INCOME_CORRECTION,
                "occurred_on.desc,created_at.desc", limit, offset);
        List<IncomeCorrectionRow> rows = dataApiClient.request(
                HttpMethod.GET, "income_corrections", query, null, INCOME_CORRECTION_ROWS);
        return withCorrectionSnapshots(budgetId, rows);
    }

    @Override
    public Optional<IncomeCorrectionResponse> recordIncomeCorrection(
            UUID budgetId, UUID incomeEntryId, CreateIncomeCorrectionRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("p_budget_id", budgetId);
        body.put("p_income_entry_id", incomeEntryId);
        body.put("p_period_id", request.periodId());
        body.put("p_amount_delta", request.amountDelta());
        body.put("p_occurred_on", request.occurredOn().toString());
        body.put("p_reason", request.reason().strip());
        UUID correctionId = dataApiClient.callFunction(
                "record_income_correction", body, UUID_RESULT);
        return correctionId == null ? Optional.empty() : findIncomeCorrection(budgetId, correctionId);
    }

    @Override
    public List<ExpenseEntryResponse> findExpenses(UUID budgetId, UUID periodId, int limit, int offset) {
        Map<String, String> query =
                movementQuery(budgetId, periodId, SELECT_EXPENSE, "spent_on.desc,created_at.desc", limit, offset);
        List<ExpenseEntryResponse> rows =
                dataApiClient.request(HttpMethod.GET, "expense_entries", query, null, EXPENSE_ROWS);
        return rows == null ? List.of() : List.copyOf(rows);
    }

    @Override
    public Optional<ExpenseEntryResponse> recordExpense(UUID budgetId, CreateExpenseRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("p_budget_id", budgetId);
        body.put("p_period_id", request.periodId());
        body.put("p_category_id", request.categoryId());
        body.put("p_amount", request.amount());
        body.put("p_spent_on", request.spentOn().toString());
        body.put("p_description", request.description());
        UUID expenseId = dataApiClient.callFunction("record_expense", body, UUID_RESULT);
        return expenseId == null ? Optional.empty() : findExpense(budgetId, expenseId);
    }

    @Override
    public List<BudgetAdjustmentResponse> findAdjustments(UUID budgetId, UUID periodId, int limit, int offset) {
        Map<String, String> query = movementQuery(
                budgetId, periodId, SELECT_ADJUSTMENT, "occurred_on.desc,created_at.desc", limit, offset);
        List<BudgetAdjustmentResponse> rows =
                dataApiClient.request(HttpMethod.GET, "budget_adjustments", query, null, ADJUSTMENT_ROWS);
        return rows == null ? List.of() : List.copyOf(rows);
    }

    @Override
    public Optional<BudgetAdjustmentResponse> recordAdjustment(
            UUID budgetId, CreateBudgetAdjustmentRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("p_budget_id", budgetId);
        body.put("p_period_id", request.periodId());
        body.put("p_category_id", request.categoryId());
        body.put("p_amount_delta", request.amountDelta());
        body.put("p_reason", request.reason().strip());
        body.put("p_occurred_on", request.occurredOn().toString());
        body.put("p_corrected_expense_entry_id", request.correctedExpenseEntryId());
        UUID adjustmentId = dataApiClient.callFunction("record_budget_adjustment", body, UUID_RESULT);
        return adjustmentId == null ? Optional.empty() : findAdjustment(budgetId, adjustmentId);
    }

    private List<IncomeEntryResponse> withSnapshots(UUID budgetId, List<IncomeRow> rows) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        String incomeIds = rows.stream().map(row -> row.id().toString()).collect(Collectors.joining(","));
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_SNAPSHOT);
        query.put("budget_id", "eq." + budgetId);
        query.put("income_entry_id", "in.(" + incomeIds + ")");
        query.put("order", "category_id.asc");
        List<SnapshotRow> snapshots =
                dataApiClient.request(HttpMethod.GET, "income_allocation_snapshots", query, null, SNAPSHOT_ROWS);
        Map<UUID, List<IncomeAllocationSnapshotResponse>> byIncome = new LinkedHashMap<>();
        if (snapshots != null) {
            for (SnapshotRow snapshot : snapshots) {
                byIncome.computeIfAbsent(snapshot.incomeEntryId(), ignored -> new ArrayList<>()).add(
                        new IncomeAllocationSnapshotResponse(
                                snapshot.categoryId(), snapshot.percentageBasisPoints(), snapshot.allocatedAmount()));
            }
        }
        return rows.stream()
                .map(row -> row.toResponse(byIncome.getOrDefault(row.id(), List.of())))
                .toList();
    }

    private List<IncomeCorrectionResponse> withCorrectionSnapshots(
            UUID budgetId, List<IncomeCorrectionRow> rows) {
        if (rows == null || rows.isEmpty()) {
            return List.of();
        }
        String correctionIds = rows.stream()
                .map(row -> row.id().toString())
                .collect(Collectors.joining(","));
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_INCOME_CORRECTION_SNAPSHOT);
        query.put("budget_id", "eq." + budgetId);
        query.put("income_correction_id", "in.(" + correctionIds + ")");
        query.put("order", "category_id.asc");
        List<IncomeCorrectionSnapshotRow> snapshots = dataApiClient.request(
                HttpMethod.GET, "income_correction_allocation_snapshots", query, null,
                INCOME_CORRECTION_SNAPSHOT_ROWS);
        Map<UUID, List<IncomeCorrectionAllocationResponse>> byCorrection = new LinkedHashMap<>();
        if (snapshots != null) {
            for (IncomeCorrectionSnapshotRow snapshot : snapshots) {
                byCorrection.computeIfAbsent(snapshot.incomeCorrectionId(), ignored -> new ArrayList<>())
                        .add(new IncomeCorrectionAllocationResponse(
                                snapshot.categoryId(), snapshot.percentageBasisPoints(), snapshot.allocatedAmount()));
            }
        }
        return rows.stream()
                .map(row -> row.toResponse(byCorrection.getOrDefault(row.id(), List.of())))
                .toList();
    }

    private Optional<IncomeCorrectionResponse> findIncomeCorrection(UUID budgetId, UUID correctionId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_INCOME_CORRECTION);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + correctionId);
        query.put("limit", "1");
        List<IncomeCorrectionRow> rows = dataApiClient.request(
                HttpMethod.GET, "income_corrections", query, null, INCOME_CORRECTION_ROWS);
        return withCorrectionSnapshots(budgetId, rows).stream().findFirst();
    }

    private Optional<ExpenseEntryResponse> findExpense(UUID budgetId, UUID expenseId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_EXPENSE);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + expenseId);
        query.put("limit", "1");
        List<ExpenseEntryResponse> rows =
                dataApiClient.request(HttpMethod.GET, "expense_entries", query, null, EXPENSE_ROWS);
        return rows == null ? Optional.empty() : rows.stream().findFirst();
    }

    private Optional<BudgetAdjustmentResponse> findAdjustment(UUID budgetId, UUID adjustmentId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_ADJUSTMENT);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + adjustmentId);
        query.put("limit", "1");
        List<BudgetAdjustmentResponse> rows =
                dataApiClient.request(HttpMethod.GET, "budget_adjustments", query, null, ADJUSTMENT_ROWS);
        return rows == null ? Optional.empty() : rows.stream().findFirst();
    }

    private Map<String, String> movementQuery(
            UUID budgetId, UUID periodId, String select, String order, int limit, int offset) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", select);
        query.put("budget_id", "eq." + budgetId);
        if (periodId != null) {
            query.put("period_id", "eq." + periodId);
        }
        query.put("order", order);
        query.put("limit", Integer.toString(limit));
        query.put("offset", Integer.toString(offset));
        return query;
    }

    private record IncomeRow(
            UUID id,
            @JsonProperty("budget_id") UUID budgetId,
            @JsonProperty("period_id") UUID periodId,
            @JsonProperty("income_member_id") UUID incomeMemberId,
            @JsonProperty("recorded_by_member_id") UUID recordedByMemberId,
            @JsonProperty("allocation_set_id") UUID allocationSetId,
            @JsonProperty("schedule_id") UUID scheduleId,
            @JsonProperty("scheduled_for") LocalDate scheduledFor,
            BigDecimal amount,
            @JsonProperty("occurred_on") LocalDate occurredOn,
            String description,
            @JsonProperty("created_at") Instant createdAt) {

        private IncomeEntryResponse toResponse(List<IncomeAllocationSnapshotResponse> snapshot) {
            return new IncomeEntryResponse(
                    id, budgetId, periodId, incomeMemberId, recordedByMemberId, allocationSetId,
                    scheduleId, scheduledFor, amount, occurredOn, description, createdAt, List.copyOf(snapshot));
        }
    }

    private record SnapshotRow(
            @JsonProperty("income_entry_id") UUID incomeEntryId,
            @JsonProperty("category_id") UUID categoryId,
            @JsonProperty("percentage_basis_points") int percentageBasisPoints,
            @JsonProperty("allocated_amount") BigDecimal allocatedAmount) {
    }

    private record IncomeCorrectionRow(
            UUID id,
            @JsonProperty("budget_id") UUID budgetId,
            @JsonProperty("income_entry_id") UUID incomeEntryId,
            @JsonProperty("period_id") UUID periodId,
            @JsonProperty("allocation_set_id") UUID allocationSetId,
            @JsonProperty("recorded_by_member_id") UUID recordedByMemberId,
            @JsonProperty("amount_delta") BigDecimal amountDelta,
            String reason,
            @JsonProperty("occurred_on") LocalDate occurredOn,
            @JsonProperty("created_at") Instant createdAt) {

        private IncomeCorrectionResponse toResponse(List<IncomeCorrectionAllocationResponse> snapshot) {
            return new IncomeCorrectionResponse(
                    id, budgetId, incomeEntryId, periodId, allocationSetId, recordedByMemberId,
                    amountDelta, reason, occurredOn, createdAt, snapshot);
        }
    }

    private record IncomeCorrectionSnapshotRow(
            @JsonProperty("income_correction_id") UUID incomeCorrectionId,
            @JsonProperty("category_id") UUID categoryId,
            @JsonProperty("percentage_basis_points") int percentageBasisPoints,
            @JsonProperty("allocated_amount") BigDecimal allocatedAmount) {
    }
}
