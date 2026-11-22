package pt.spendwise.api.budget;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BudgetServiceTest {

    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");

    private BudgetRepository budgetRepository;
    private BudgetAuthorizationService authorizationService;
    private BudgetService budgetService;

    @BeforeEach
    void setUp() {
        budgetRepository = mock(BudgetRepository.class);
        authorizationService = mock(BudgetAuthorizationService.class);
        budgetService = new BudgetService(budgetRepository, authorizationService);
    }

    @Test
    void readsBudgetOnlyAfterCheckingActiveMembership() {
        BudgetResponse expected = budget(null);
        when(budgetRepository.findVisibleById(BUDGET_ID)).thenReturn(Optional.of(expected));

        assertThat(budgetService.get(BUDGET_ID)).isEqualTo(expected);

        verify(authorizationService).requireAllowed(BUDGET_ID, BudgetAction.READ);
    }

    @Test
    void renamesBudgetOnlyWithManagePermission() {
        BudgetResponse expected = budget(null);
        when(budgetRepository.updateName(BUDGET_ID, "Renamed")).thenReturn(Optional.of(expected));

        assertThat(budgetService.rename(BUDGET_ID, new UpdateBudgetRequest("Renamed"))).isEqualTo(expected);

        verify(authorizationService).requireAllowed(BUDGET_ID, BudgetAction.MANAGE);
    }

    @Test
    void archiveIsIdempotentAndDoesNotPreventMovementRecordingPolicy() {
        BudgetResponse archived = budget(Instant.parse("2026-11-22T12:00:00Z"));
        when(budgetRepository.findVisibleById(BUDGET_ID)).thenReturn(Optional.of(archived));

        assertThat(budgetService.archive(BUDGET_ID)).isEqualTo(archived);

        verify(authorizationService).requireAllowed(BUDGET_ID, BudgetAction.MANAGE);
        verify(budgetRepository, never()).archive(BUDGET_ID);
    }

    @Test
    void deniesArchiveIfOwnerPermissionWasRevokedBeforeTheUpdate() {
        when(budgetRepository.findVisibleById(BUDGET_ID)).thenReturn(Optional.of(budget(null)));
        when(budgetRepository.archive(BUDGET_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> budgetService.archive(BUDGET_ID))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessage("Budget access denied");
    }

    private BudgetResponse budget(Instant archivedAt) {
        return new BudgetResponse(BUDGET_ID, "Shared budget", BudgetType.SHARED, "EUR",
                Instant.parse("2026-11-01T00:00:00Z"), archivedAt);
    }
}
