package pt.spendwise.api.supabase;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pt.spendwise.api.authorization.BudgetRole;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabaseBudgetMembershipRepositoryTest {

    private static final String ACCESS_TOKEN = "synthetic-current-user-jwt";
    private static final UUID CURRENT_USER_ID = UUID.fromString("462e86cb-e4f1-474f-9b4b-5290e7b84c8b");
    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");

    private MockRestServiceServer mockServer;
    private SupabaseBudgetMembershipRepository repository;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://spendwise-test.supabase.co/rest/v1");
        mockServer = MockRestServiceServer.bindTo(builder).build();
        repository = new SupabaseBudgetMembershipRepository(new SupabaseDataApiClient(
                builder.build(), "sb_publishable_synthetic"));

        Jwt jwt = Jwt.withTokenValue(ACCESS_TOKEN)
                .header("alg", "RS256")
                .subject(CURRENT_USER_ID.toString())
                .build();
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt);
        authentication.setAuthenticated(true);
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                .setAuthentication(authentication);
    }

    @AfterEach
    void clearSecurityContext() {
        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    void looksUpOnlyTheAuthenticatedUsersActiveMembershipForTheRequestedBudget() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/budget_members?select=role&budget_id=eq." + BUDGET_ID
                        + "&user_id=eq." + CURRENT_USER_ID + "&removed_at=is.null"))
                .andExpect(method(org.springframework.http.HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(queryParam("budget_id", "eq." + BUDGET_ID))
                .andExpect(queryParam("user_id", "eq." + CURRENT_USER_ID))
                .andExpect(queryParam("removed_at", "is.null"))
                .andRespond(withSuccess("[{\"role\":\"CONTRIBUTOR\"}]", MediaType.APPLICATION_JSON));

        Optional<BudgetRole> role = repository.findCurrentUserActiveRole(BUDGET_ID);

        assertThat(role).contains(BudgetRole.CONTRIBUTOR);
        mockServer.verify();
    }

    @Test
    void returnsNoMembershipForRemovedOrUnknownUsers() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/budget_members?select=role&budget_id=eq." + BUDGET_ID
                        + "&user_id=eq." + CURRENT_USER_ID + "&removed_at=is.null"))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

        assertThat(repository.findCurrentUserActiveRole(BUDGET_ID)).isEmpty();
        mockServer.verify();
    }

    @Test
    void deniesMalformedAuthenticatedSubjectsBeforeCallingDataApi() {
        Jwt jwt = Jwt.withTokenValue(ACCESS_TOKEN).header("alg", "RS256").subject("not-a-uuid").build();
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt);
        authentication.setAuthenticated(true);
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                .setAuthentication(authentication);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> repository.findCurrentUserActiveRole(BUDGET_ID))
                .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
                .hasMessage("Budget access denied");
        mockServer.verify();
    }
}
