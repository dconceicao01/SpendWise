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
import pt.spendwise.api.budget.CreateExpenseRequest;
import pt.spendwise.api.budget.CreateIncomeRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabaseBudgetMovementRepositoryTest {

    private static final String ACCESS_TOKEN = "synthetic-current-user-jwt";
    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID PERIOD_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");
    private static final UUID CATEGORY_ID = UUID.fromString("a7e37ca8-369f-4cf4-85a8-7cd83f5402a2");
    private static final UUID ENTRY_ID = UUID.fromString("d46f9224-0113-4059-a5a1-bfab56a08340");
    private static final UUID ALLOCATION_ID = UUID.fromString("da5e407d-e5bb-432a-b035-80f7234ca6a2");

    private MockRestServiceServer mockServer;
    private SupabaseBudgetMovementRepository movementRepository;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://spendwise-test.supabase.co/rest/v1");
        mockServer = MockRestServiceServer.bindTo(builder).build();
        movementRepository = new SupabaseBudgetMovementRepository(
                new SupabaseDataApiClient(builder.build(), "sb_publishable_synthetic"));

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
    void recordsExpenseThroughTheAuthenticatedRpcAndReadsItBack() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/rpc/record_expense"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(content().json("{\"p_budget_id\":\"" + BUDGET_ID
                        + "\",\"p_period_id\":\"" + PERIOD_ID
                        + "\",\"p_category_id\":\"" + CATEGORY_ID
                        + "\",\"p_amount\":12.50,\"p_spent_on\":\"2026-11-22\",\"p_description\":\"Lunch\"}"))
                .andRespond(withSuccess("\"" + ENTRY_ID + "\"", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/expense_entries?select=id,budget_id,period_id,category_id,recorded_by_member_id,amount,spent_on,description,created_at&budget_id=eq."
                        + BUDGET_ID + "&id=eq." + ENTRY_ID + "&limit=1"))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andRespond(withSuccess("[{\"id\":\"" + ENTRY_ID + "\",\"budget_id\":\"" + BUDGET_ID
                        + "\",\"period_id\":\"" + PERIOD_ID + "\",\"category_id\":\"" + CATEGORY_ID
                        + "\",\"recorded_by_member_id\":\"5988f040-a1f5-492f-a2ab-4e7b6d93c8c3\","
                        + "\"amount\":12.50,\"spent_on\":\"2026-11-22\",\"description\":\"Lunch\","
                        + "\"created_at\":\"2026-11-22T17:00:00Z\"}]", MediaType.APPLICATION_JSON));

        var expense = movementRepository.recordExpense(
                BUDGET_ID,
                new CreateExpenseRequest(PERIOD_ID, CATEGORY_ID, new BigDecimal("12.50"),
                        LocalDate.of(2026, 11, 22), "Lunch"));

        assertThat(expense).isPresent();
        assertThat(expense.orElseThrow().id()).isEqualTo(ENTRY_ID);
        assertThat(expense.orElseThrow().amount()).isEqualByComparingTo("12.50");
        mockServer.verify();
    }

    @Test
    void recordsIncomeAtomicallyAndReturnsItsAllocationSnapshot() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/rpc/record_income"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(content().json("{\"p_budget_id\":\"" + BUDGET_ID
                        + "\",\"p_period_id\":\"" + PERIOD_ID
                        + "\",\"p_amount\":900.00,\"p_occurred_on\":\"2026-11-22\","
                        + "\"p_schedule_id\":null,\"p_scheduled_for\":null,\"p_recorder_member_id\":null}"))
                .andRespond(withSuccess("\"" + ENTRY_ID + "\"", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/income_entries?select=id,budget_id,period_id,income_member_id,recorded_by_member_id,allocation_set_id,schedule_id,scheduled_for,amount,occurred_on,created_at&budget_id=eq."
                        + BUDGET_ID + "&id=eq." + ENTRY_ID + "&limit=1"))
                .andRespond(withSuccess("[{\"id\":\"" + ENTRY_ID + "\",\"budget_id\":\"" + BUDGET_ID
                        + "\",\"period_id\":\"" + PERIOD_ID + "\","
                        + "\"income_member_id\":\"5988f040-a1f5-492f-a2ab-4e7b6d93c8c3\","
                        + "\"recorded_by_member_id\":\"5988f040-a1f5-492f-a2ab-4e7b6d93c8c3\","
                        + "\"allocation_set_id\":\"" + ALLOCATION_ID
                        + "\",\"schedule_id\":null,\"scheduled_for\":null,\"amount\":900.00,"
                        + "\"occurred_on\":\"2026-11-22\",\"created_at\":\"2026-11-22T17:00:00Z\"}]",
                        MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/income_allocation_snapshots?select=income_entry_id,category_id,percentage_basis_points,allocated_amount&budget_id=eq."
                        + BUDGET_ID + "&income_entry_id=in.(" + ENTRY_ID + ")&order=category_id.asc"))
                .andRespond(withSuccess("[{\"income_entry_id\":\"" + ENTRY_ID + "\",\"category_id\":\"" + CATEGORY_ID
                        + "\",\"percentage_basis_points\":10000,\"allocated_amount\":900.00}]",
                        MediaType.APPLICATION_JSON));

        var income = movementRepository.recordIncome(
                BUDGET_ID, new CreateIncomeRequest(PERIOD_ID, new BigDecimal("900.00"), LocalDate.of(2026, 11, 22)));

        assertThat(income).isPresent();
        assertThat(income.orElseThrow().allocationSnapshot()).hasSize(1);
        assertThat(income.orElseThrow().allocationSnapshot().getFirst().allocatedAmount())
                .isEqualByComparingTo("900.00");
        mockServer.verify();
    }
}
