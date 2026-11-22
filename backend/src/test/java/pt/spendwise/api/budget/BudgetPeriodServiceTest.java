package pt.spendwise.api.budget;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BudgetPeriodServiceTest {

    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID PERIOD_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");
    private static final LocalDate START = LocalDate.parse("2026-11-01");
    private static final LocalDate END = LocalDate.parse("2026-11-30");

    private BudgetPeriodRepository periodRepository;
    private BudgetAuthorizationService authorizationService;
    private BudgetPeriodService periodService;

    @BeforeEach
    void setUp() {
        periodRepository = mock(BudgetPeriodRepository.class);
        authorizationService = mock(BudgetAuthorizationService.class);
        periodService = new BudgetPeriodService(periodRepository, authorizationService);
    }

    @Test
    void readsPeriodsForAnActiveMember() {
        List<BudgetPeriodResponse> periods = List.of(period());
        when(periodRepository.findForBudget(BUDGET_ID)).thenReturn(periods);

        assertThat(periodService.list(BUDGET_ID)).isEqualTo(periods);

        verify(authorizationService).requireAllowed(BUDGET_ID, BudgetAction.READ);
    }

    @Test
    void createsAndUpdatesPeriodsOnlyAfterOwnerAuthorization() {
        when(periodRepository.create(BUDGET_ID, START, END)).thenReturn(Optional.of(period()));
        when(periodRepository.update(BUDGET_ID, PERIOD_ID, START, END)).thenReturn(Optional.of(period()));

        assertThat(periodService.create(BUDGET_ID, new CreateBudgetPeriodRequest(START, END))).isEqualTo(period());
        assertThat(periodService.update(BUDGET_ID, PERIOD_ID, new UpdateBudgetPeriodRequest(START, END)))
                .isEqualTo(period());

        verify(authorizationService, org.mockito.Mockito.times(2))
                .requireAllowed(BUDGET_ID, BudgetAction.MANAGE);
    }

    @Test
    void rejectsInvalidDateRangesBeforeCallingTheRepository() {
        assertThatThrownBy(() -> periodService.create(
                BUDGET_ID,
                new CreateBudgetPeriodRequest(END, START)))
                .isInstanceOf(ResponseStatusException.class)
                .extracting("statusCode")
                .isEqualTo(HttpStatus.BAD_REQUEST);

        verify(periodRepository, never()).create(BUDGET_ID, END, START);
    }

    @Test
    void reportsOverlapsAndMovementDateConflictsAsGenericConflict() {
        HttpClientErrorException conflict = HttpClientErrorException.create(
                HttpStatus.BAD_REQUEST,
                "Bad Request",
                HttpHeaders.EMPTY,
                "{\"code\":\"23514\",\"message\":\"private database detail\"}".getBytes(StandardCharsets.UTF_8),
                StandardCharsets.UTF_8);
        when(periodRepository.create(BUDGET_ID, START, END)).thenThrow(conflict);

        assertThatThrownBy(() -> periodService.create(BUDGET_ID, new CreateBudgetPeriodRequest(START, END)))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> {
                    ResponseStatusException responseStatusException = (ResponseStatusException) exception;
                    assertThat(responseStatusException.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(responseStatusException.getReason())
                            .doesNotContain("private database detail")
                            .contains("Period overlaps");
                });
    }

    @Test
    void turnsDataApiPermissionFailuresIntoGenericDenials() {
        HttpClientErrorException forbidden = HttpClientErrorException.create(
                HttpStatus.FORBIDDEN, "Forbidden", HttpHeaders.EMPTY, new byte[0], StandardCharsets.UTF_8);
        when(periodRepository.update(BUDGET_ID, PERIOD_ID, START, END)).thenThrow(forbidden);

        assertThatThrownBy(() -> periodService.update(
                BUDGET_ID, PERIOD_ID, new UpdateBudgetPeriodRequest(START, END)))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessage("Budget access denied");
    }

    private BudgetPeriodResponse period() {
        return new BudgetPeriodResponse(PERIOD_ID, BUDGET_ID, START, END,
                java.time.Instant.parse("2026-11-01T00:00:00Z"));
    }
}
