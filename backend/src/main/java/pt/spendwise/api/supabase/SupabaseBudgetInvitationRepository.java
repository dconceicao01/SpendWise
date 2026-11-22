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
import pt.spendwise.api.budget.BudgetInvitationAcceptanceResponse;
import pt.spendwise.api.budget.BudgetInvitationRepository;
import pt.spendwise.api.budget.BudgetInvitationResponse;
import pt.spendwise.api.budget.BudgetInvitationRole;

@Repository
public class SupabaseBudgetInvitationRepository implements BudgetInvitationRepository {

    private static final String SELECT_INVITATION = "id,budget_id,email,role,expires_at,accepted_at,revoked_at,created_at";
    private static final ParameterizedTypeReference<List<BudgetInvitationResponse>> INVITATION_ROWS =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<List<InvitationAcceptanceRow>> ACCEPTANCE_ROWS =
            new ParameterizedTypeReference<>() {
            };

    private final SupabaseDataApiClient dataApiClient;

    public SupabaseBudgetInvitationRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public List<BudgetInvitationResponse> findForBudget(UUID budgetId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_INVITATION);
        query.put("budget_id", "eq." + budgetId);
        query.put("order", "created_at.desc");
        List<BudgetInvitationResponse> rows = dataApiClient.request(
                HttpMethod.GET, "budget_invitations", query, null, INVITATION_ROWS);
        return rows == null ? List.of() : List.copyOf(rows);
    }

    @Override
    public BudgetInvitationResponse create(
            UUID budgetId, UUID creatorMemberId, String email, BudgetInvitationRole role, String tokenHash, Instant expiresAt) {
        Map<String, String> query = Map.of("select", SELECT_INVITATION);
        Map<String, Object> body = Map.of(
                "budget_id", budgetId,
                "created_by_member_id", creatorMemberId,
                "email", email,
                "role", role.name(),
                "token_hash", tokenHash,
                "expires_at", expiresAt.toString());
        List<BudgetInvitationResponse> rows = dataApiClient.requestReturningRepresentation(
                HttpMethod.POST, "budget_invitations", query, body, INVITATION_ROWS);
        return first(rows).orElseThrow(() -> new IllegalStateException("Supabase did not return the created invitation"));
    }

    @Override
    public Optional<BudgetInvitationResponse> revoke(UUID budgetId, UUID invitationId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_INVITATION);
        query.put("budget_id", "eq." + budgetId);
        query.put("id", "eq." + invitationId);
        query.put("accepted_at", "is.null");
        query.put("revoked_at", "is.null");
        List<BudgetInvitationResponse> rows = dataApiClient.requestReturningRepresentation(
                HttpMethod.PATCH,
                "budget_invitations",
                query,
                Map.of("revoked_at", Instant.now().toString()),
                INVITATION_ROWS);
        return first(rows);
    }

    @Override
    public BudgetInvitationAcceptanceResponse accept(String tokenHash) {
        List<InvitationAcceptanceRow> rows = dataApiClient.callFunction(
                "accept_budget_invitation", Map.of("p_token_hash", tokenHash), ACCEPTANCE_ROWS);
        InvitationAcceptanceRow row = first(rows)
                .orElseThrow(() -> new IllegalStateException("Supabase did not return invitation acceptance status"));
        return new BudgetInvitationAcceptanceResponse(row.accepted(), row.budgetId(), row.role(), row.rateLimited());
    }

    private <T> Optional<T> first(List<T> rows) {
        return rows == null ? Optional.empty() : rows.stream().findFirst();
    }

    private record InvitationAcceptanceRow(
            boolean accepted,
            @JsonProperty("budget_id") UUID budgetId,
            BudgetInvitationRole role,
            @JsonProperty("rate_limited") boolean rateLimited) {
    }
}
