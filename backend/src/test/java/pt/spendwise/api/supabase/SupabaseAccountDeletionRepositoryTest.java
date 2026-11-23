package pt.spendwise.api.supabase;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pt.spendwise.api.profile.DeleteAccountRequest;

import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withNoContent;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabaseAccountDeletionRepositoryTest {

    private static final UUID USER_ID = UUID.fromString("c2e5f5d5-6b0f-41cb-9a74-040c646f88a4");
    private static final String ACCESS_TOKEN = "synthetic-user-token";
    private MockRestServiceServer dataServer;
    private MockRestServiceServer authServer;
    private SupabaseAccountDeletionRepository repository;

    @BeforeEach
    void setUp() {
        RestClient.Builder dataBuilder = RestClient.builder().baseUrl("https://spendwise.test/rest/v1");
        dataServer = MockRestServiceServer.bindTo(dataBuilder).build();
        RestClient.Builder authBuilder = RestClient.builder().baseUrl("https://spendwise.test/auth/v1");
        authServer = MockRestServiceServer.bindTo(authBuilder).build();
        repository = new SupabaseAccountDeletionRepository(
                new SupabaseDataApiClient(dataBuilder.build(), "publishable-test-key"),
                authBuilder.build(), "server-only-test-key");
        Instant now = Instant.parse("2026-11-23T09:00:00Z");
        Jwt jwt = new Jwt(ACCESS_TOKEN, now, now.plusSeconds(3600), Map.of("alg", "RS256"),
                Map.of("sub", USER_ID.toString(), "role", "authenticated"));
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt);
        authentication.setAuthenticated(true);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    @AfterEach
    void clearContext() {
        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    void invokesUserScopedCleanupThenDeletesOnlyTheCurrentAuthIdentity() {
        UUID budgetId = UUID.fromString("a0e9c0b2-6bc5-4169-a0fb-f97b00cd4401");
        UUID memberId = UUID.fromString("0f32750a-af27-4330-bf2f-6e8046cf8ef0");
        dataServer.expect(requestTo("https://spendwise.test/rest/v1/rpc/request_account_deletion"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("apikey", "publishable-test-key"))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(jsonPath("$.p_owner_transfers[0].budget_id").value(budgetId.toString()))
                .andExpect(jsonPath("$.p_owner_transfers[0].target_member_id").value(memberId.toString()))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
        authServer.expect(requestTo("https://spendwise.test/auth/v1/admin/users/" + USER_ID))
                .andExpect(method(HttpMethod.DELETE))
                .andExpect(header("apikey", "server-only-test-key"))
                .andExpect(header("Authorization", "Bearer server-only-test-key"))
                .andRespond(withNoContent());

        repository.removeAccountData(new DeleteAccountRequest(List.of(
                new DeleteAccountRequest.OwnerTransfer(budgetId, memberId))));
        repository.deleteAuthIdentity();

        dataServer.verify();
        authServer.verify();
    }
}
