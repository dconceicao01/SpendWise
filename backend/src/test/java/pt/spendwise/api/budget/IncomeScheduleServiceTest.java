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

class IncomeScheduleServiceTest {

    private static final UUID BUDGET_ID = UUID.fromString("24b99b5b-9d3b-46d8-a202-063996605f7a");
    private static final UUID SCHEDULE_ID = UUID.fromString("5462d2c8-b4a0-4836-a9a8-6489f4be1139");
    private IncomeScheduleRepository repository;
    private BudgetAuthorizationService authorization;
    private IncomeScheduleService service;

    @BeforeEach
    void setUp() {
        repository = mock(IncomeScheduleRepository.class);
        authorization = mock(BudgetAuthorizationService.class);
        service = new IncomeScheduleService(repository, authorization);
    }

    @Test
    void listsSchedulesForReadersWithBoundedPagination() {
        List<IncomeScheduleResponse> schedules = List.of(schedule());
        when(repository.findForBudget(BUDGET_ID, 100, 0)).thenReturn(schedules);

        assertThat(service.list(BUDGET_ID, 500, 0)).isEqualTo(schedules);
        verify(authorization).requireAllowed(BUDGET_ID, BudgetAction.READ);
        verify(repository).findForBudget(BUDGET_ID, 100, 0);
    }

    @Test
    void createsScheduleAfterContributorAuthorization() {
        CreateIncomeScheduleRequest request = request();
        when(repository.create(BUDGET_ID, request)).thenReturn(Optional.of(schedule()));

        assertThat(service.create(BUDGET_ID, request)).isEqualTo(schedule());
        verify(authorization).requireAllowed(BUDGET_ID, BudgetAction.RECORD_MOVEMENT);
    }

    @Test
    void rejectsScheduleEndBeforeStart() {
        CreateIncomeScheduleRequest request = new CreateIncomeScheduleRequest(
                new BigDecimal("900.00"),
                IncomeScheduleFrequency.MONTHLY,
                LocalDate.of(2026, 11, 10),
                LocalDate.of(2026, 11, 9),
                MonthlyShortMonthBehavior.LAST_DAY);

        assertThatThrownBy(() -> service.create(BUDGET_ID, request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("must not precede");
    }

    @Test
    void rejectsClientSettingCompletedStatus() {
        UpdateIncomeScheduleStatusRequest request =
                new UpdateIncomeScheduleStatusRequest(IncomeScheduleStatus.COMPLETED);

        assertThatThrownBy(() -> service.updateStatus(BUDGET_ID, SCHEDULE_ID, request))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("cannot be set by a user");
    }

    private CreateIncomeScheduleRequest request() {
        return new CreateIncomeScheduleRequest(
                new BigDecimal("900.00"),
                IncomeScheduleFrequency.MONTHLY,
                LocalDate.of(2026, 11, 23),
                null,
                MonthlyShortMonthBehavior.LAST_DAY);
    }

    private IncomeScheduleResponse schedule() {
        return new IncomeScheduleResponse(
                SCHEDULE_ID,
                BUDGET_ID,
                UUID.fromString("5988f040-a1f5-492f-a2ab-4e7b6d93c8c3"),
                UUID.fromString("5988f040-a1f5-492f-a2ab-4e7b6d93c8c3"),
                new BigDecimal("900.00"),
                IncomeScheduleFrequency.MONTHLY,
                MonthlyShortMonthBehavior.LAST_DAY,
                LocalDate.of(2026, 11, 23),
                null,
                LocalDate.of(2026, 11, 23),
                IncomeScheduleStatus.ACTIVE,
                Instant.parse("2026-11-23T08:00:00Z"),
                Instant.parse("2026-11-23T08:00:00Z"));
    }
}
