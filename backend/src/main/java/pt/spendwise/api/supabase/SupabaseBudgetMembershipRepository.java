package pt.spendwise.api.supabase;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Repository;
import pt.spendwise.api.authorization.BudgetMembershipRepository;
import pt.spendwise.api.authorization.BudgetRole;

@Repository
public class SupabaseBudgetMembershipRepository implements BudgetMembershipRepository {

    private static final ParameterizedTypeReference<List<MembershipRow>> MEMBERSHIP_ROWS =
            new ParameterizedTypeReference<>() {
            };

    private final SupabaseDataApiClient dataApiClient;

    public SupabaseBudgetMembershipRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public Optional<BudgetRole> findCurrentUserActiveRole(UUID budgetId) {
        UUID currentUserId = currentUserId();
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", "role");
        query.put("budget_id", "eq." + budgetId);
        query.put("user_id", "eq." + currentUserId);
        query.put("removed_at", "is.null");

        List<MembershipRow> rows = dataApiClient.request(
                HttpMethod.GET,
                "budget_members",
                query,
                null,
                MEMBERSHIP_ROWS);
        if (rows == null || rows.isEmpty()) {
            return Optional.empty();
        }
        if (rows.size() != 1 || rows.getFirst().role() == null) {
            // A duplicate or incomplete membership is an inconsistent state; fail closed.
            return Optional.empty();
        }
        return Optional.of(rows.getFirst().role());
    }

    @Override
    public Map<UUID, BudgetRole> findCurrentUserActiveRoles() {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", "budget_id,role");
        query.put("user_id", "eq." + currentUserId());
        query.put("removed_at", "is.null");
        List<MembershipRow> rows = dataApiClient.request(
                HttpMethod.GET, "budget_members", query, null, MEMBERSHIP_ROWS);
        if (rows == null || rows.isEmpty()) {
            return Map.of();
        }
        Map<UUID, BudgetRole> roles = new LinkedHashMap<>();
        for (MembershipRow row : rows) {
            if (row.budgetId() == null || row.role() == null || roles.putIfAbsent(row.budgetId(), row.role()) != null) {
                throw new AccessDeniedException("Budget access denied");
            }
        }
        return Map.copyOf(roles);
    }

    private UUID currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuthenticationToken)
                || !authentication.isAuthenticated()) {
            throw new AccessDeniedException("Budget access denied");
        }
        try {
            return UUID.fromString(jwtAuthenticationToken.getToken().getSubject());
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new AccessDeniedException("Budget access denied");
        }
    }

    private record MembershipRow(@com.fasterxml.jackson.annotation.JsonProperty("budget_id") UUID budgetId, BudgetRole role) {
    }
}
