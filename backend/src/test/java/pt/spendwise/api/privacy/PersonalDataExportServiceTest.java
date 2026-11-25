package pt.spendwise.api.privacy;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import pt.spendwise.api.budget.AllocationSetService;
import pt.spendwise.api.budget.BudgetCategoryService;
import pt.spendwise.api.budget.BudgetMovementService;
import pt.spendwise.api.budget.BudgetPeriodService;
import pt.spendwise.api.budget.BudgetResponse;
import pt.spendwise.api.budget.BudgetService;
import pt.spendwise.api.budget.BudgetType;
import pt.spendwise.api.budget.IncomeScheduleService;
import pt.spendwise.api.budget.IncomeCorrectionAllocationResponse;
import pt.spendwise.api.budget.IncomeCorrectionResponse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PersonalDataExportServiceTest {

    private static final UUID BUDGET_ID = UUID.fromString("c78becb5-8000-49ab-a29c-9a8e4cab65f9");

    private PrivacyExportRepository exportRepository;
    private BudgetService budgetService;
    private BudgetPeriodService periodService;
    private BudgetCategoryService categoryService;
    private AllocationSetService allocationService;
    private BudgetMovementService movementService;
    private IncomeScheduleService scheduleService;
    private PersonalDataExportService service;

    @BeforeEach
    void setUp() {
        exportRepository = mock(PrivacyExportRepository.class);
        budgetService = mock(BudgetService.class);
        periodService = mock(BudgetPeriodService.class);
        categoryService = mock(BudgetCategoryService.class);
        allocationService = mock(AllocationSetService.class);
        movementService = mock(BudgetMovementService.class);
        scheduleService = mock(IncomeScheduleService.class);
        service = new PersonalDataExportService(exportRepository, budgetService, periodService, categoryService,
                allocationService, movementService, scheduleService);
    }

    @Test
    void exportsOwnProfileAndAllReadableBudgetSections() {
        BudgetResponse budget = new BudgetResponse(BUDGET_ID, "Home", BudgetType.PERSONAL, "EUR", null, null, null);
        ExportProfile profile = new ExportProfile(UUID.randomUUID(), "duarte@example.test", "Duarte", null, "EUR", null, null);
        when(exportRepository.findCurrentUserProfile()).thenReturn(Optional.of(profile));
        when(budgetService.listForCurrentUser()).thenReturn(List.of(budget));
        when(periodService.list(BUDGET_ID)).thenReturn(List.of());
        when(categoryService.list(BUDGET_ID)).thenReturn(List.of());
        when(allocationService.list(BUDGET_ID)).thenReturn(List.of());
        when(movementService.listIncomes(BUDGET_ID, null, 100, 0)).thenReturn(List.of());
        when(movementService.listExpenses(BUDGET_ID, null, 100, 0)).thenReturn(List.of());
        when(movementService.listAdjustments(BUDGET_ID, null, 100, 0)).thenReturn(List.of());
        IncomeCorrectionResponse correction = new IncomeCorrectionResponse(
                UUID.fromString("0bf26f41-5403-4b36-a9f4-0e7faf321234"),
                BUDGET_ID,
                UUID.fromString("0bf26f41-5403-4b36-a9f4-0e7faf321235"),
                UUID.fromString("0bf26f41-5403-4b36-a9f4-0e7faf321236"),
                UUID.fromString("0bf26f41-5403-4b36-a9f4-0e7faf321237"),
                UUID.fromString("0bf26f41-5403-4b36-a9f4-0e7faf321239"),
                new BigDecimal("-25.00"),
                "Rendimento corrigido",
                LocalDate.of(2026, 11, 1),
                Instant.parse("2026-11-22T10:02:00Z"),
                List.of(new IncomeCorrectionAllocationResponse(
                        UUID.fromString("0bf26f41-5403-4b36-a9f4-0e7faf321238"),
                        10000,
                        new BigDecimal("-25.0000"))));
        when(movementService.listIncomeCorrections(BUDGET_ID, null, 100, 0)).thenReturn(List.of(correction));
        when(scheduleService.list(BUDGET_ID, 100, 0)).thenReturn(List.of());

        PersonalDataExport export = service.exportForCurrentUser();

        assertThat(export.profile()).isEqualTo(profile);
        assertThat(export.generatedAt()).isNotNull();
        assertThat(export.budgets()).hasSize(1);
        assertThat(export.budgets().getFirst().budget()).isEqualTo(budget);
        assertThat(export.budgets().getFirst().incomes()).isEmpty();
        assertThat(export.budgets().getFirst().incomeCorrections())
                .containsExactly(new ExportIncomeCorrection(
                        correction.id(), correction.incomeEntryId(), correction.periodId(),
                        correction.allocationSetId(), correction.amountDelta(), correction.reason(), correction.occurredOn(),
                        correction.createdAt(), correction.allocationSnapshot()));
        verify(periodService).list(BUDGET_ID);
        verify(categoryService).list(BUDGET_ID);
        verify(allocationService).list(BUDGET_ID);
    }
}
