package pt.spendwise.api.budget;

import java.time.Instant;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "SUPABASE_ISSUER_URI=http://127.0.0.1:54321/auth/v1",
        "SUPABASE_URL=http://127.0.0.1:54321",
        "SUPABASE_PUBLISHABLE_KEY=test-publishable-key"
})
@AutoConfigureMockMvc
class BudgetControllerTest {

    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID PERIOD_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private BudgetService budgetService;

    @MockitoBean
    private BudgetPeriodService periodService;

    @MockitoBean
    private BudgetCategoryService categoryService;

    @MockitoBean
    private AllocationSetService allocationSetService;

    @Test
    void requiresAuthenticationForBudgetReads() throws Exception {
        mockMvc.perform(get("/api/v1/budgets"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void createsBudgetWithAValidatedRequest() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        when(budgetService.create(any(CreateBudgetRequest.class))).thenReturn(budget());

        mockMvc.perform(post("/api/v1/budgets")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Travel\",\"budgetType\":\"PERSONAL\",\"currencyCode\":\"EUR\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/v1/budgets/" + BUDGET_ID));

        verify(budgetService).create(new CreateBudgetRequest("Travel", BudgetType.PERSONAL, "EUR"));
    }

    @Test
    void rejectsInvalidCurrencyBeforeCallingTheService() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());

        mockMvc.perform(post("/api/v1/budgets")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Travel\",\"budgetType\":\"PERSONAL\",\"currencyCode\":\"euro\"}"))
                .andExpect(status().isBadRequest());

        verify(budgetService, never()).create(any(CreateBudgetRequest.class));
    }

    @Test
    void returnsForbiddenWhenTheServiceDeniesTheBudget() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        when(budgetService.get(BUDGET_ID)).thenThrow(new AccessDeniedException("Budget access denied"));

        mockMvc.perform(get("/api/v1/budgets/" + BUDGET_ID)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token"))
                .andExpect(status().isForbidden());
    }

    @Test
    void createsPeriodThroughTheBudgetScopedRoute() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        when(periodService.create(any(), any(CreateBudgetPeriodRequest.class))).thenReturn(new BudgetPeriodResponse(
                PERIOD_ID, BUDGET_ID, LocalDate.parse("2026-11-01"), LocalDate.parse("2026-11-30"),
                Instant.parse("2026-11-22T17:00:00Z")));

        mockMvc.perform(post("/api/v1/budgets/" + BUDGET_ID + "/periods")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"startsOn\":\"2026-11-01\",\"endsOn\":\"2026-11-30\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location",
                        "/api/v1/budgets/" + BUDGET_ID + "/periods/" + PERIOD_ID));

        verify(periodService).create(BUDGET_ID, new CreateBudgetPeriodRequest(
                LocalDate.parse("2026-11-01"), LocalDate.parse("2026-11-30")));
    }

    @Test
    void createsBudgetCategoryThroughTheBudgetScopedRoute() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        UUID categoryId = UUID.fromString("d7d0d8bf-f18f-4b90-a611-50baa2e4eaab");
        when(categoryService.create(BUDGET_ID, new CreateBudgetCategoryRequest("Travel")))
                .thenReturn(new BudgetCategoryResponse(categoryId, BUDGET_ID, "Travel",
                        Instant.parse("2026-11-22T17:00:00Z"), null));

        mockMvc.perform(post("/api/v1/budgets/" + BUDGET_ID + "/categories")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Travel\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location",
                        "/api/v1/budgets/" + BUDGET_ID + "/categories/" + categoryId));

        verify(categoryService).create(BUDGET_ID, new CreateBudgetCategoryRequest("Travel"));
    }

    @Test
    void createsAllocationDraftUsingHumanReadablePercentages() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        UUID categoryId = UUID.fromString("d7d0d8bf-f18f-4b90-a611-50baa2e4eaab");
        UUID allocationSetId = UUID.fromString("a0e4e090-b083-405f-9d25-fb481673ec77");
        CreateAllocationSetRequest request = new CreateAllocationSetRequest(
                List.of(new AllocationItemRequest(categoryId, new BigDecimal("50.25"))));
        when(allocationSetService.createDraft(BUDGET_ID, request)).thenReturn(new AllocationSetResponse(
                allocationSetId, BUDGET_ID, 1, "DRAFT", LocalDate.parse("2026-11-22"),
                Instant.parse("2026-11-22T17:00:00Z"),
                List.of(AllocationItemResponse.from(categoryId, 5025))));

        mockMvc.perform(post("/api/v1/budgets/" + BUDGET_ID + "/allocation-sets")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"categoryId\":\"" + categoryId
                                + "\",\"percentage\":50.25}]}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/v1/budgets/" + BUDGET_ID
                        + "/allocation-sets/" + allocationSetId));

        verify(allocationSetService).createDraft(BUDGET_ID, request);
    }

    @Test
    void rejectsAllocationPercentageOverOneHundred() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        mockMvc.perform(post("/api/v1/budgets/" + BUDGET_ID + "/allocation-sets")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"categoryId\":\"" + PERIOD_ID
                                + "\",\"percentage\":100.01}]}"))
                .andExpect(status().isBadRequest());
        verify(allocationSetService, never()).createDraft(any(), any());
    }

    private Jwt validJwt() {
        Instant now = Instant.now();
        return new Jwt("valid-token", now.minusSeconds(5), now.plusSeconds(60),
                Map.of("alg", "RS256"),
                Map.of("sub", "462e86cb-e4f1-474f-9b4b-5290e7b84c8b",
                        "iss", "http://127.0.0.1:54321/auth/v1",
                        "aud", List.of("authenticated")));
    }

    private BudgetResponse budget() {
        return new BudgetResponse(BUDGET_ID, "Travel", BudgetType.PERSONAL, "EUR",
                Instant.parse("2026-11-22T17:00:00Z"), null);
    }
}
