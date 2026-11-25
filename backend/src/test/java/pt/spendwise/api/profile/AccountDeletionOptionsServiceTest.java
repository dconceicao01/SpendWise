package pt.spendwise.api.profile;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import pt.spendwise.api.authorization.BudgetAuthorizationService;
import pt.spendwise.api.authorization.BudgetMembershipRepository;
import pt.spendwise.api.authorization.BudgetRole;
import pt.spendwise.api.budget.BudgetMemberManagementRepository;
import pt.spendwise.api.budget.BudgetMemberResponse;
import pt.spendwise.api.budget.BudgetRepository;
import pt.spendwise.api.budget.BudgetResponse;
import pt.spendwise.api.budget.BudgetType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AccountDeletionOptionsServiceTest {

    private static final UUID OWNER_BUDGET_ID = UUID.randomUUID();
    private static final UUID VIEWER_BUDGET_ID = UUID.randomUUID();
    private static final UUID TARGET_MEMBER_ID = UUID.randomUUID();

    private BudgetRepository budgetRepository;
    private BudgetAuthorizationService authorizationService;
    private BudgetMemberManagementRepository memberRepository;
    private AccountDeletionOptionsService service;

    @BeforeEach
    void setUp() {
        budgetRepository = mock(BudgetRepository.class);
        BudgetMembershipRepository membershipRepository = mock(BudgetMembershipRepository.class);
        authorizationService = new BudgetAuthorizationService(membershipRepository);
        memberRepository = mock(BudgetMemberManagementRepository.class);
        service = new AccountDeletionOptionsService(budgetRepository, authorizationService, memberRepository);

        when(budgetRepository.findAllVisibleToCurrentUser()).thenReturn(List.of(
                budget(OWNER_BUDGET_ID, "Household", BudgetType.SHARED),
                budget(VIEWER_BUDGET_ID, "Friends", BudgetType.SHARED),
                budget(UUID.randomUUID(), "Personal", BudgetType.PERSONAL)));
        when(membershipRepository.findCurrentUserActiveRole(OWNER_BUDGET_ID)).thenReturn(Optional.of(BudgetRole.OWNER));
        when(membershipRepository.findCurrentUserActiveRole(VIEWER_BUDGET_ID)).thenReturn(Optional.of(BudgetRole.VIEWER));
        when(memberRepository.findForBudget(OWNER_BUDGET_ID)).thenReturn(List.of(
                member(UUID.randomUUID(), BudgetRole.OWNER, "Duarte"),
                member(TARGET_MEMBER_ID, BudgetRole.CONTRIBUTOR, "Rita")));
    }

    @Test
    void returnsTransferTargetsOnlyForSharedBudgetsOwnedByCurrentUser() {
        assertThat(service.forCurrentUser())
                .containsExactly(new AccountDeletionOptionsResponse(
                        OWNER_BUDGET_ID,
                        "Household",
                        List.of(new AccountDeletionOptionsResponse.TransferTarget(TARGET_MEMBER_ID, "Rita"))));

        verify(memberRepository).findForBudget(OWNER_BUDGET_ID);
        verify(memberRepository, never()).findForBudget(VIEWER_BUDGET_ID);
    }

    private BudgetResponse budget(UUID id, String name, BudgetType type) {
        Instant now = Instant.parse("2026-11-23T10:00:00Z");
        return new BudgetResponse(id, name, type, "EUR", now, null, null);
    }

    private BudgetMemberResponse member(UUID id, BudgetRole role, String name) {
        Instant now = Instant.parse("2026-11-23T10:00:00Z");
        return new BudgetMemberResponse(id, role, now, null, name);
    }
}
