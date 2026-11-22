package pt.spendwise.api.supabase;

import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pt.spendwise.api.budget.BudgetType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabaseBudgetRepositoryTest {

    private static final String ACCESS_TOKEN = "synthetic-current-user-jwt";
    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID PERIOD_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");

    private MockRestServiceServer mockServer;
    private SupabaseBudgetRepository budgetRepository;
    private SupabaseBudgetPeriodRepository periodRepository;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://spendwise-test.supabase.co/rest/v1");
        mockServer = MockRestServiceServer.bindTo(builder).build();
        SupabaseDataApiClient client = new SupabaseDataApiClient(builder.build(), "sb_publishable_synthetic");
        budgetRepository = new SupabaseBudgetRepository(client);
        periodRepository = new SupabaseBudgetPeriodRepository(client);

        Jwt jwt = Jwt.withTokenValue(ACCESS_TOKEN)
                .header("alg", "RS256")
                .subject("462e86cb-e4f1-474f-9b4b-5290e7b84c8b")
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
    void createsBudgetThroughAtomicRpcAndReadsItUnderTheSameJwt() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/rpc/create_budget"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(content().json("{\"p_name\":\"Travel\",\"p_budget_type\":\"PERSONAL\",\"p_currency_code\":\"EUR\"}"))
                .andRespond(withSuccess("[{\"budget_id\":\"" + BUDGET_ID + "\"}]", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/budgets?select=id,name,budget_type,currency_code,created_at,archived_at&id=eq." + BUDGET_ID))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andRespond(withSuccess(
                        "[{\"id\":\"" + BUDGET_ID + "\",\"name\":\"Travel\",\"budget_type\":\"PERSONAL\","
                                + "\"currency_code\":\"EUR\",\"created_at\":\"2026-11-22T17:00:00Z\",\"archived_at\":null}]",
                        MediaType.APPLICATION_JSON));

        var budget = budgetRepository.create("Travel", BudgetType.PERSONAL, "EUR");

        assertThat(budget.id()).isEqualTo(BUDGET_ID);
        assertThat(budget.currencyCode()).isEqualTo("EUR");
        mockServer.verify();
    }

    @Test
    void createsPeriodsWithTheRequestedBudgetAndDates() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/budget_periods?select=id,budget_id,starts_on,ends_on,created_at"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Prefer", "return=representation"))
                .andExpect(content().json("{\"budget_id\":\"" + BUDGET_ID + "\",\"starts_on\":\"2026-11-01\",\"ends_on\":\"2026-11-30\"}"))
                .andRespond(withSuccess(
                        "[{\"id\":\"" + PERIOD_ID + "\",\"budget_id\":\"" + BUDGET_ID + "\","
                                + "\"starts_on\":\"2026-11-01\",\"ends_on\":\"2026-11-30\","
                                + "\"created_at\":\"2026-11-22T17:00:00Z\"}]",
                        MediaType.APPLICATION_JSON));

        var period = periodRepository.create(
                BUDGET_ID, LocalDate.parse("2026-11-01"), LocalDate.parse("2026-11-30"));

        assertThat(period).isPresent();
        assertThat(period.orElseThrow().startsOn()).isEqualTo(LocalDate.parse("2026-11-01"));
        mockServer.verify();
    }

    @Test
    void scopesPeriodUpdatesToBothBudgetAndPeriodIds() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/budget_periods?select=id,budget_id,starts_on,ends_on,created_at&budget_id=eq." + BUDGET_ID + "&id=eq." + PERIOD_ID))
                .andExpect(method(org.springframework.http.HttpMethod.PATCH))
                .andExpect(header("Prefer", "return=representation"))
                .andExpect(content().json("{\"starts_on\":\"2026-11-02\",\"ends_on\":\"2026-11-30\"}"))
                .andRespond(withSuccess(
                        "[{\"id\":\"" + PERIOD_ID + "\",\"budget_id\":\"" + BUDGET_ID + "\","
                                + "\"starts_on\":\"2026-11-02\",\"ends_on\":\"2026-11-30\","
                                + "\"created_at\":\"2026-11-22T17:00:00Z\"}]",
                        MediaType.APPLICATION_JSON));

        var period = periodRepository.update(
                BUDGET_ID, PERIOD_ID, LocalDate.parse("2026-11-02"), LocalDate.parse("2026-11-30"));

        assertThat(period).isPresent();
        assertThat(period.orElseThrow().startsOn()).isEqualTo(LocalDate.parse("2026-11-02"));
        mockServer.verify();
    }
}
