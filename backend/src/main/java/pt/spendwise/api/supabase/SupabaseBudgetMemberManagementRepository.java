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
import pt.spendwise.api.authorization.BudgetRole;
import pt.spendwise.api.budget.BudgetMemberManagementRepository;
import pt.spendwise.api.budget.BudgetMemberResponse;
import pt.spendwise.api.budget.BudgetMemberRole;

@Repository
public class SupabaseBudgetMemberManagementRepository implements BudgetMemberManagementRepository {

    private static final String SELECT_MEMBER = "id,role,joined_at,removed_at";
    private static final ParameterizedTypeReference<List<BudgetMemberResponse>> MEMBER_ROWS =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<List<MemberMutationRow>> MEMBER_MUTATION_ROWS =
            new ParameterizedTypeReference<>() {
            };

    private final SupabaseDataApiClient dataApiClient;

    public SupabaseBudgetMemberManagementRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public List<BudgetMemberResponse> findForBudget(UUID budgetId) {
        List<BudgetMemberResponse> rows = dataApiClient.callFunction(
                "list_budget_members", Map.of("p_budget_id", budgetId), MEMBER_ROWS);
        return rows == null ? List.of() : List.copyOf(rows);
    }

    @Override
    public Optional<BudgetMemberResponse> changeRole(UUID budgetId, UUID memberId, BudgetMemberRole role) {
        String displayName = currentDisplayName(budgetId, memberId).orElse(null);
        Map<String, String> query = activeNonOwnerMemberQuery(budgetId, memberId);
        List<MemberMutationRow> rows = dataApiClient.requestReturningRepresentation(
                HttpMethod.PATCH, "budget_members", query, Map.of("role", role.name()), MEMBER_MUTATION_ROWS);
        return firstMutation(rows).map(row -> row.toResponse(displayName));
    }

    @Override
    public Optional<BudgetMemberResponse> remove(UUID budgetId, UUID memberId) {
        String displayName = currentDisplayName(budgetId, memberId).orElse(null);
        Map<String, String> query = activeNonOwnerMemberQuery(budgetId, memberId);
        List<MemberMutationRow> rows = dataApiClient.requestReturningRepresentation(
                HttpMethod.PATCH,
                "budget_members",
                query,
                Map.of("removed_at", Instant.now().toString()),
                MEMBER_MUTATION_ROWS);
        return firstMutation(rows).map(row -> row.toResponse(displayName));
    }

    private Optional<String> currentDisplayName(UUID budgetId, UUID memberId) {
        return findForBudget(budgetId).stream()
                .filter(member -> member.id().equals(memberId))
                .map(BudgetMemberResponse::displayName)
                .findFirst();
    }

    private Map<String, String> activeNonOwnerMemberQuery(UUID budgetId, UUID memberId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_MEMBER);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + memberId);
        query.put("removed_at", "is.null");
        query.put("role", "neq.OWNER");
        return query;
    }

    private Optional<MemberMutationRow> firstMutation(List<MemberMutationRow> rows) {
        return rows == null ? Optional.empty() : rows.stream().findFirst();
    }

    private record MemberMutationRow(
            UUID id,
            BudgetRole role,
            @JsonProperty("joined_at") Instant joinedAt,
            @JsonProperty("removed_at") Instant removedAt) {

        private BudgetMemberResponse toResponse(String displayName) {
            return new BudgetMemberResponse(id, role, joinedAt, removedAt, displayName);
        }
    }
}
