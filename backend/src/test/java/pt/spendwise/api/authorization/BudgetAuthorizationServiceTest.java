package pt.spendwise.api.authorization;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BudgetAuthorizationServiceTest {

    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");

    private BudgetMembershipRepository membershipRepository;
    private BudgetAuthorizationService authorizationService;

    @BeforeEach
    void setUp() {
        membershipRepository = mock(BudgetMembershipRepository.class);
        authorizationService = new BudgetAuthorizationService(membershipRepository);
    }

    @Test
    void ownerCanReadRecordMovementsAndManage() {
        when(membershipRepository.findCurrentUserActiveRole(BUDGET_ID)).thenReturn(Optional.of(BudgetRole.OWNER));

        assertThatCode(() -> authorizationService.requireAllowed(BUDGET_ID, BudgetAction.READ))
                .doesNotThrowAnyException();
        assertThatCode(() -> authorizationService.requireAllowed(BUDGET_ID, BudgetAction.RECORD_MOVEMENT))
                .doesNotThrowAnyException();
        assertThatCode(() -> authorizationService.requireAllowed(BUDGET_ID, BudgetAction.MANAGE))
                .doesNotThrowAnyException();
    }

    @Test
    void contributorCanReadAndRecordButCannotManage() {
        when(membershipRepository.findCurrentUserActiveRole(BUDGET_ID))
                .thenReturn(Optional.of(BudgetRole.CONTRIBUTOR));

        assertThatCode(() -> authorizationService.requireAllowed(BUDGET_ID, BudgetAction.READ))
                .doesNotThrowAnyException();
        assertThatCode(() -> authorizationService.requireAllowed(BUDGET_ID, BudgetAction.RECORD_MOVEMENT))
                .doesNotThrowAnyException();
        assertDenied(BudgetAction.MANAGE);
    }

    @Test
    void viewerCanReadButCannotWriteOrManage() {
        when(membershipRepository.findCurrentUserActiveRole(BUDGET_ID)).thenReturn(Optional.of(BudgetRole.VIEWER));

        assertThatCode(() -> authorizationService.requireAllowed(BUDGET_ID, BudgetAction.READ))
                .doesNotThrowAnyException();
        assertDenied(BudgetAction.RECORD_MOVEMENT);
        assertDenied(BudgetAction.MANAGE);
    }

    @Test
    void nonMemberOrRemovedMemberIsDeniedWithoutRevealingBudgetExistence() {
        when(membershipRepository.findCurrentUserActiveRole(BUDGET_ID)).thenReturn(Optional.empty());

        assertDenied(BudgetAction.READ);
        assertDenied(BudgetAction.RECORD_MOVEMENT);
        assertDenied(BudgetAction.MANAGE);
    }

    @Test
    void checksTheCurrentRoleOnEveryOperation() {
        doReturn(Optional.of(BudgetRole.OWNER))
                .doReturn(Optional.empty())
                .when(membershipRepository).findCurrentUserActiveRole(BUDGET_ID);

        assertThatCode(() -> authorizationService.requireAllowed(BUDGET_ID, BudgetAction.MANAGE))
                .doesNotThrowAnyException();
        assertDenied(BudgetAction.MANAGE);
        verify(membershipRepository, org.mockito.Mockito.times(2)).findCurrentUserActiveRole(BUDGET_ID);
    }

    @Test
    void rejectsMissingResourceOrActionArguments() {
        assertThatThrownBy(() -> authorizationService.requireAllowed(null, BudgetAction.READ))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> authorizationService.requireAllowed(BUDGET_ID, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private void assertDenied(BudgetAction action) {
        assertThatThrownBy(() -> authorizationService.requireAllowed(BUDGET_ID, action))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessage("Budget access denied");
    }
}
