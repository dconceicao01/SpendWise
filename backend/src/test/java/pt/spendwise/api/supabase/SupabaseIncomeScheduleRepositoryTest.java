package pt.spendwise.api.supabase;

import java.math.BigDecimal;
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
import pt.spendwise.api.budget.CreateIncomeScheduleRequest;
import pt.spendwise.api.budget.IncomeScheduleFrequency;
import pt.spendwise.api.budget.MonthlyShortMonthBehavior;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabaseIncomeScheduleRepositoryTest {

    private static final String ACCESS_TOKEN = "synthetic-current-user-jwt";
    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID SCHEDULE_ID = UUID.fromString("5462d2c8-b4a0-4836-a9a8-6489f4be1139");
    private MockRestServiceServer mockServer;
    private SupabaseIncomeScheduleRepository repository;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://spendwise-test.supabase.co/rest/v1");
        mockServer = MockRestServiceServer.bindTo(builder).build();
        repository = new SupabaseIncomeScheduleRepository(
                new SupabaseDataApiClient(builder.build(), "sb_publishable_synthetic"));

        Jwt jwt = Jwt.withTokenValue(ACCESS_TOKEN).header("alg", "RS256")
                .subject("462e86cb-e4f1-474f-9b4b-5290e7b84c8b").build();
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
    void createsScheduleThroughAuthenticatedRpcAndReadsItBack() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/rpc/create_income_schedule_with_description"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(content().json("{\"p_budget_id\":\"" + BUDGET_ID
                        + "\",\"p_amount\":900.00,\"p_frequency\":\"MONTHLY\","
                        + "\"p_start_date\":\"2026-11-23\",\"p_end_date\":null,"
                        + "\"p_monthly_short_month_behavior\":\"SKIP\",\"p_description\":\"Rendimento mensal\"}"))
                .andRespond(withSuccess("\"" + SCHEDULE_ID + "\"", MediaType.APPLICATION_JSON));

        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/income_schedules?select=id,budget_id,income_member_id,created_by_member_id,amount,description,frequency,monthly_short_month_behavior,start_date,end_date,next_occurrence_on,status,created_at,updated_at&budget_id=eq."
                        + BUDGET_ID + "&id=eq." + SCHEDULE_ID + "&limit=1"))
                .andRespond(withSuccess("[{\"id\":\"" + SCHEDULE_ID + "\",\"budget_id\":\"" + BUDGET_ID
                        + "\",\"income_member_id\":\"5988f040-a1f5-492f-a2ab-4e7b6d93c8c3\","
                        + "\"created_by_member_id\":\"5988f040-a1f5-492f-a2ab-4e7b6d93c8c3\","
                        + "\"amount\":900.00,\"description\":\"Rendimento mensal\",\"frequency\":\"MONTHLY\",\"monthly_short_month_behavior\":\"SKIP\",\"start_date\":\"2026-11-23\","
                        + "\"end_date\":null,\"next_occurrence_on\":\"2026-11-23\",\"status\":\"ACTIVE\","
                        + "\"created_at\":\"2026-11-23T08:00:00Z\",\"updated_at\":\"2026-11-23T08:00:00Z\"}]",
                        MediaType.APPLICATION_JSON));

        var result = repository.create(
                BUDGET_ID,
                new CreateIncomeScheduleRequest(
                        new BigDecimal("900.00"), IncomeScheduleFrequency.MONTHLY,
                        LocalDate.of(2026, 11, 23), null, MonthlyShortMonthBehavior.SKIP, "Rendimento mensal"));

        assertThat(result).isPresent();
        assertThat(result.orElseThrow().id()).isEqualTo(SCHEDULE_ID);
        assertThat(result.orElseThrow().amount()).isEqualByComparingTo("900.00");
        assertThat(result.orElseThrow().description()).isEqualTo("Rendimento mensal");
        assertThat(result.orElseThrow().frequency()).isEqualTo(IncomeScheduleFrequency.MONTHLY);
        assertThat(result.orElseThrow().monthlyShortMonthBehavior()).isEqualTo(MonthlyShortMonthBehavior.SKIP);
        mockServer.verify();
    }
}
