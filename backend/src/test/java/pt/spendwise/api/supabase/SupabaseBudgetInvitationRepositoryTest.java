package pt.spendwise.api.supabase;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pt.spendwise.api.budget.BudgetInvitationRole;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabaseBudgetInvitationRepositoryTest {

    private static final String ACCESS_TOKEN = "synthetic-current-user-jwt";
    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID INVITATION_ID = UUID.fromString("f6e16e50-c92e-4c53-a50b-3f17f1566eb8");
    private MockRestServiceServer mockServer;
    private SupabaseBudgetInvitationRepository repository;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://spendwise-test.supabase.co/rest/v1");
        mockServer = MockRestServiceServer.bindTo(builder).build();
        repository = new SupabaseBudgetInvitationRepository(
                new SupabaseDataApiClient(builder.build(), "sb_publishable_synthetic"));
        Jwt jwt = Jwt.withTokenValue(ACCESS_TOKEN).header("alg", "RS256")
                .subject("462e86cb-e4f1-474f-9b4b-5290e7b84c8b").build();
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt);
        authentication.setAuthenticated(true);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    @AfterEach
    void clearSecurityContext() {
        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    void insertsOnlyTheTokenHashAndReturnsInvitationMetadata() {
        Instant expiresAt = Instant.parse("2026-11-29T12:00:00Z");
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/budget_invitations?select="
                        + "id,budget_id,email,role,expires_at,accepted_at,revoked_at,created_at"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(content().json("{\"budget_id\":\"" + BUDGET_ID
                        + "\",\"created_by_member_id\":\"b68b3f39-09d0-4458-9c78-06afcf65ed2f\","
                        + "\"email\":\"person@example.com\",\"role\":\"VIEWER\","
                        + "\"token_hash\":\"" + "a".repeat(64) + "\",\"expires_at\":\"" + expiresAt + "\"}"))
                .andRespond(withSuccess("[{\"id\":\"" + INVITATION_ID + "\",\"budget_id\":\"" + BUDGET_ID
                        + "\",\"email\":\"person@example.com\",\"role\":\"VIEWER\","
                        + "\"expires_at\":\"" + expiresAt + "\",\"accepted_at\":null,\"revoked_at\":null,"
                        + "\"created_at\":\"2026-11-22T12:00:00Z\"}]", MediaType.APPLICATION_JSON));

        var invitation = repository.create(BUDGET_ID, UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f"),
                "person@example.com", BudgetInvitationRole.VIEWER, "a".repeat(64), expiresAt);

        assertThat(invitation.id()).isEqualTo(INVITATION_ID);
        assertThat(invitation.invitationLink()).isNull();
        mockServer.verify();
    }

    @Test
    void acceptsThroughTheDedicatedAtomicRpc() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/rpc/accept_budget_invitation"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(content().json("{\"p_token_hash\":\"" + "b".repeat(64) + "\"}"))
                .andRespond(withSuccess("[{\"accepted\":true,\"budget_id\":\"" + BUDGET_ID
                        + "\",\"role\":\"CONTRIBUTOR\",\"rate_limited\":false}]", MediaType.APPLICATION_JSON));

        var result = repository.accept("b".repeat(64));

        assertThat(result.accepted()).isTrue();
        assertThat(result.role()).isEqualTo(BudgetInvitationRole.CONTRIBUTOR);
        mockServer.verify();
    }
}
