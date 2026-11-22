package pt.spendwise.api.supabase;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pt.spendwise.api.budget.BudgetMemberRole;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabaseBudgetMemberManagementRepositoryTest {

    private static final String ACCESS_TOKEN = "synthetic-current-user-jwt";
    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID MEMBER_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");

    private MockRestServiceServer mockServer;
    private SupabaseBudgetMemberManagementRepository repository;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://spendwise-test.supabase.co/rest/v1");
        mockServer = MockRestServiceServer.bindTo(builder).build();
        repository = new SupabaseBudgetMemberManagementRepository(
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
    void listsOnlyTheNarrowMemberNameProjectionThroughTheRpc() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/rpc/list_budget_members"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(content().json("{\"p_budget_id\":\"" + BUDGET_ID + "\"}"))
                .andRespond(withSuccess("[{\"member_id\":\"" + MEMBER_ID
                        + "\",\"role\":\"CONTRIBUTOR\",\"joined_at\":\"2026-11-22T16:00:00Z\","
                        + "\"removed_at\":null,\"display_name\":\"Ada\"}]", MediaType.APPLICATION_JSON));

        var members = repository.findForBudget(BUDGET_ID);

        assertThat(members).hasSize(1);
        assertThat(members.getFirst().id()).isEqualTo(MEMBER_ID);
        assertThat(members.getFirst().displayName()).isEqualTo("Ada");
        mockServer.verify();
    }

    @Test
    void changesRoleOnlyForActiveNonOwnerMembershipAndPreservesDisplayName() {
        String rpcUrl = "https://spendwise-test.supabase.co/rest/v1/rpc/list_budget_members";
        mockServer.expect(requestTo(rpcUrl))
                .andExpect(content().json("{\"p_budget_id\":\"" + BUDGET_ID + "\"}"))
                .andRespond(withSuccess("[{\"member_id\":\"" + MEMBER_ID
                        + "\",\"role\":\"CONTRIBUTOR\",\"joined_at\":\"2026-11-22T16:00:00Z\","
                        + "\"removed_at\":null,\"display_name\":\"Ada\"}]", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/budget_members?select=id,role,joined_at,removed_at&budget_id=eq."
                        + BUDGET_ID + "&id=eq." + MEMBER_ID + "&removed_at=is.null&role=neq.OWNER"))
                .andExpect(method(org.springframework.http.HttpMethod.PATCH))
                .andExpect(header("Prefer", "return=representation"))
                .andExpect(content().json("{\"role\":\"VIEWER\"}"))
                .andRespond(withSuccess("[{\"id\":\"" + MEMBER_ID
                        + "\",\"role\":\"VIEWER\",\"joined_at\":\"2026-11-22T16:00:00Z\","
                        + "\"removed_at\":null}]", MediaType.APPLICATION_JSON));

        var updated = repository.changeRole(BUDGET_ID, MEMBER_ID, BudgetMemberRole.VIEWER);

        assertThat(updated).isPresent();
        assertThat(updated.orElseThrow().displayName()).isEqualTo("Ada");
        assertThat(updated.orElseThrow().role().name()).isEqualTo("VIEWER");
        mockServer.verify();
    }
}
