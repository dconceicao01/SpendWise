package pt.spendwise.api.budget;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BudgetMovementServiceTest {

    private static final UUID BUDGET_ID = UUID.fromString("24b99b5b-9d3b-46d8-a202-063996605f7a");
    private static final UUID PERIOD_ID = UUID.fromString("248d26a2-d96a-4abf-b95c-d6a95b03b5ec");
    private static final UUID CATEGORY_ID = UUID.fromString("a7e37ca8-369f-4cf4-85a8-7cd83f5402a2");

    private BudgetMovementRepository repository;
    private BudgetAuthorizationService authorization;
    private BudgetMovementService service;

    @BeforeEach
    void setUp() {
        repository = mock(BudgetMovementRepository.class);
        authorization = mock(BudgetAuthorizationService.class);
        service = new BudgetMovementService(repository, authorization);
    }

    @Test
    void listsMovementsForReadersWithBoundedPageSize() {
        List<IncomeEntryResponse> incomes = List.of(income());
        when(repository.findIncomes(BUDGET_ID, PERIOD_ID, 100, 0)).thenReturn(incomes);

        assertThat(service.listIncomes(BUDGET_ID, PERIOD_ID, 500, 0)).isEqualTo(incomes);
        verify(authorization).requireAllowed(BUDGET_ID, BudgetAction.READ);
        verify(repository).findIncomes(BUDGET_ID, PERIOD_ID, 100, 0);
    }

    @Test
    void recordsIncomeAndExpenseOnlyAfterMovementAuthorization() {
        CreateIncomeRequest incomeRequest = new CreateIncomeRequest(PERIOD_ID, new BigDecimal("900.00"), LocalDate.of(2026, 11, 1));
        CreateExpenseRequest expenseRequest = new CreateExpenseRequest(
                PERIOD_ID, CATEGORY_ID, new BigDecimal("12.50"), LocalDate.of(2026, 11, 2), "Lunch");
        when(repository.recordIncome(BUDGET_ID, incomeRequest)).thenReturn(Optional.of(income()));
        when(repository.recordExpense(BUDGET_ID, expenseRequest)).thenReturn(Optional.of(expense()));

        assertThat(service.recordIncome(BUDGET_ID, incomeRequest)).isEqualTo(income());
        assertThat(service.recordExpense(BUDGET_ID, expenseRequest)).isEqualTo(expense());

        verify(authorization, org.mockito.Mockito.times(2))
                .requireAllowed(BUDGET_ID, BudgetAction.RECORD_MOVEMENT);
    }

    @Test
    void rejectsZeroAdjustmentAndInvalidPagination() {
        CreateBudgetAdjustmentRequest request = new CreateBudgetAdjustmentRequest(
                PERIOD_ID, CATEGORY_ID, BigDecimal.ZERO, "Correction", LocalDate.of(2026, 11, 2), null);

        assertThatThrownBy(() -> service.recordAdjustment(BUDGET_ID, request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("must not be zero");
        assertThatThrownBy(() -> service.listExpenses(BUDGET_ID, null, 0, 0))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("positive");
        assertThatThrownBy(() -> service.listAdjustments(BUDGET_ID, null, 10, -1))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("negative");
    }

    @Test
    void recordsIncomeCorrectionsAfterMovementAuthorization() {
        UUID incomeId = UUID.fromString("223d59c3-82e5-48c9-8f4f-981cc3be6a85");
        CreateIncomeCorrectionRequest request = new CreateIncomeCorrectionRequest(
                PERIOD_ID, new BigDecimal("-25.00"), LocalDate.of(2026, 11, 1),
                "Rendimento registado em excesso");
        IncomeCorrectionResponse correction = new IncomeCorrectionResponse(
                UUID.fromString("03be3477-d72e-4cb6-8bd1-4575278b02ee"),
                BUDGET_ID,
                incomeId,
                PERIOD_ID,
                UUID.fromString("da5e407d-e5bb-432a-b035-80f7234ca6a2"),
                UUID.fromString("5988f040-a1f5-492f-a2ab-4e7b6d93c8c3"),
                request.amountDelta(),
                request.reason(),
                LocalDate.of(2026, 11, 1),
                Instant.parse("2026-11-22T10:02:00Z"),
                List.of());
        when(repository.recordIncomeCorrection(BUDGET_ID, incomeId, request))
                .thenReturn(Optional.of(correction));

        assertThat(service.recordIncomeCorrection(BUDGET_ID, incomeId, request)).isEqualTo(correction);
        verify(authorization).requireAllowed(BUDGET_ID, BudgetAction.RECORD_MOVEMENT);
        verify(repository).recordIncomeCorrection(BUDGET_ID, incomeId, request);
    }

    private IncomeEntryResponse income() {
        return new IncomeEntryResponse(
                UUID.fromString("223d59c3-82e5-48c9-8f4f-981cc3be6a85"),
                BUDGET_ID,
                PERIOD_ID,
                UUID.fromString("5988f040-a1f5-492f-a2ab-4e7b6d93c8c3"),
                UUID.fromString("5988f040-a1f5-492f-a2ab-4e7b6d93c8c3"),
                UUID.fromString("da5e407d-e5bb-432a-b035-80f7234ca6a2"),
                null,
                null,
                new BigDecimal("900.00"),
                LocalDate.of(2026, 11, 1),
                Instant.parse("2026-11-22T10:00:00Z"),
                List.of());
    }

    private ExpenseEntryResponse expense() {
        return new ExpenseEntryResponse(
                UUID.fromString("d46f9224-0113-4059-a5a1-bfab56a08340"),
                BUDGET_ID,
                PERIOD_ID,
                CATEGORY_ID,
                UUID.fromString("5988f040-a1f5-492f-a2ab-4e7b6d93c8c3"),
                new BigDecimal("12.50"),
                LocalDate.of(2026, 11, 2),
                "Lunch",
                Instant.parse("2026-11-22T10:01:00Z"));
    }
}
