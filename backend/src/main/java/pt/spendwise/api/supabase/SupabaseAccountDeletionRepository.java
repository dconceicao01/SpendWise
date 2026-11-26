package pt.spendwise.api.supabase;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpMethod;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Repository;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import pt.spendwise.api.profile.AccountDeletionRepository;
import pt.spendwise.api.profile.DeleteAccountRequest;

@Repository
public class SupabaseAccountDeletionRepository implements AccountDeletionRepository {

    private static final ParameterizedTypeReference<List<Object>> EMPTY_RESULT =
            new ParameterizedTypeReference<>() {};

    private final SupabaseDataApiClient dataApiClient;
    private final RestClient authAdminRestClient;
    private final String secretKey;

    public SupabaseAccountDeletionRepository(
            SupabaseDataApiClient dataApiClient,
            @Qualifier("supabaseAuthAdminRestClient") RestClient supabaseAuthAdminRestClient,
            @Value("${SUPABASE_SECRET_KEY:}") String secretKey) {
        this.dataApiClient = dataApiClient;
        this.authAdminRestClient = supabaseAuthAdminRestClient;
        this.secretKey = secretKey;
    }

    @Override
    public void removeAccountData(DeleteAccountRequest request) {
        List<Map<String, UUID>> transfers = request.ownerTransfers().stream()
                .map(transfer -> Map.of("budget_id", transfer.budgetId(), "target_member_id", transfer.targetMemberId()))
                .toList();
        dataApiClient.callFunction(
                "request_account_deletion",
                Map.of("p_owner_transfers", transfers),
                EMPTY_RESULT);
    }

    @Override
    public void deleteAuthIdentity() {
        if (secretKey.isBlank()) {
            throw new IllegalStateException("Supabase Auth Admin is not configured");
        }
        UUID userId = UUID.fromString(currentJwt().getToken().getSubject());
        try {
            authAdminRestClient.method(HttpMethod.DELETE)
                    .uri(uriBuilder -> uriBuilder.pathSegment("admin", "users", userId.toString()).build())
                    // Supabase sb_secret keys are opaque API keys, not JWTs.
                    .header("apikey", secretKey)
                    .retrieve()
                    .toBodilessEntity();
        } catch (HttpClientErrorException.NotFound alreadyDeleted) {
            // A retry succeeds when the previous Auth deletion completed but its
            // response did not reach the caller.
        }
    }

    private JwtAuthenticationToken currentJwt() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuthenticationToken)
                || !authentication.isAuthenticated()) {
            throw new IllegalStateException("An authenticated user JWT is required for account deletion");
        }
        return jwtAuthenticationToken;
    }
}

