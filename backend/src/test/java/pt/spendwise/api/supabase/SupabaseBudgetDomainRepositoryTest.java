package pt.spendwise.api.supabase;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pt.spendwise.api.budget.AllocationItemRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabaseBudgetDomainRepositoryTest {

    private static final String ACCESS_TOKEN = "synthetic-current-user-jwt";
    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID CATEGORY_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");
    private static final UUID SET_ID = UUID.fromString("d7d0d8bf-f18f-4b90-a611-50baa2e4eaab");

    private MockRestServiceServer mockServer;
    private SupabaseBudgetCategoryRepository categoryRepository;
    private SupabaseAllocationSetRepository allocationRepository;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://spendwise-test.supabase.co/rest/v1");
        mockServer = MockRestServiceServer.bindTo(builder).build();
        SupabaseDataApiClient client = new SupabaseDataApiClient(builder.build(), "sb_publishable_synthetic");
        categoryRepository = new SupabaseBudgetCategoryRepository(client);
        allocationRepository = new SupabaseAllocationSetRepository(client);

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
    void createsCategoriesThroughTheIdentityBoundRpc() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/rpc/create_budget_category"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(content().json("{\"p_budget_id\":\"" + BUDGET_ID + "\",\"p_name\":\"Travel\"}"))
                .andRespond(withSuccess("[{\"category_id\":\"" + CATEGORY_ID + "\"}]", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/budget_categories?select=id,budget_id,name,created_at,archived_at&budget_id=eq."
                        + BUDGET_ID + "&id=eq." + CATEGORY_ID))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andRespond(withSuccess("[{\"id\":\"" + CATEGORY_ID + "\",\"budget_id\":\"" + BUDGET_ID
                        + "\",\"name\":\"Travel\",\"created_at\":\"2026-11-22T17:00:00Z\",\"archived_at\":null}]",
                        MediaType.APPLICATION_JSON));

        var category = categoryRepository.create(BUDGET_ID, "Travel");

        assertThat(category.id()).isEqualTo(CATEGORY_ID);
        assertThat(category.budgetId()).isEqualTo(BUDGET_ID);
        assertThat(category.name()).isEqualTo("Travel");
        assertThat(category.createdAt()).isEqualTo(Instant.parse("2026-11-22T17:00:00Z"));
        mockServer.verify();
    }

    @Test
    void createsAllocationDraftAndConvertsPercentagesToBasisPoints() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/rpc/create_budget_allocation_draft"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(content().json("{\"p_budget_id\":\"" + BUDGET_ID + "\",\"p_items\":[{"
                        + "\"category_id\":\"" + CATEGORY_ID + "\",\"percentage_basis_points\":5025}]}"))
                .andRespond(withSuccess("[{\"allocation_set_id\":\"" + SET_ID + "\"}]", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/budget_allocation_sets?select=id,budget_id,version,status,effective_from,created_at&budget_id=eq."
                        + BUDGET_ID + "&id=eq." + SET_ID))
                .andRespond(withSuccess("[{\"id\":\"" + SET_ID + "\",\"budget_id\":\"" + BUDGET_ID
                        + "\",\"version\":1,\"status\":\"DRAFT\",\"effective_from\":\"2026-11-22\","
                        + "\"created_at\":\"2026-11-22T17:00:00Z\"}]", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/budget_allocation_items?select=category_id,percentage_basis_points&budget_id=eq."
                        + BUDGET_ID + "&allocation_set_id=eq." + SET_ID + "&order=category_id.asc"))
                .andRespond(withSuccess("[{\"category_id\":\"" + CATEGORY_ID
                        + "\",\"percentage_basis_points\":5025}]", MediaType.APPLICATION_JSON));

        var allocationSet = allocationRepository.createDraft(
                BUDGET_ID,
                List.of(new AllocationItemRequest(CATEGORY_ID, new BigDecimal("50.25"))));

        assertThat(allocationSet.items()).hasSize(1);
        assertThat(allocationSet.items().getFirst().percentage()).isEqualByComparingTo("50.25");
        assertThat(allocationSet.createdAt()).isEqualTo(Instant.parse("2026-11-22T17:00:00Z"));
        mockServer.verify();
    }
}
