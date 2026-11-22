package pt.spendwise.api.budget;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;
import pt.spendwise.api.authorization.BudgetRole;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BudgetMemberServiceTest {

    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID MEMBER_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");
    private BudgetMemberManagementRepository repository;
    private BudgetAuthorizationService authorization;
    private BudgetMemberService service;

    @BeforeEach
    void setUp() {
        repository = mock(BudgetMemberManagementRepository.class);
        authorization = mock(BudgetAuthorizationService.class);
        service = new BudgetMemberService(repository, authorization);
    }

    @Test
    void listsMembersForActiveBudgetMembers() {
        List<BudgetMemberResponse> members = List.of(member(BudgetRole.CONTRIBUTOR, null));
        when(repository.findForBudget(BUDGET_ID)).thenReturn(members);

        assertThat(service.list(BUDGET_ID)).isEqualTo(members);
        verify(authorization).requireAllowed(BUDGET_ID, BudgetAction.READ);
    }

    @Test
    void changesRolesAndRemovesMembersOnlyAfterOwnerAuthorization() {
        ChangeBudgetMemberRoleRequest roleRequest = new ChangeBudgetMemberRoleRequest(BudgetMemberRole.VIEWER);
        when(repository.changeRole(BUDGET_ID, MEMBER_ID, BudgetMemberRole.VIEWER))
                .thenReturn(Optional.of(member(BudgetRole.VIEWER, null)));
        when(repository.remove(BUDGET_ID, MEMBER_ID))
                .thenReturn(Optional.of(member(BudgetRole.VIEWER, Instant.parse("2026-11-22T17:00:00Z"))));

        assertThat(service.changeRole(BUDGET_ID, MEMBER_ID, roleRequest).role()).isEqualTo(BudgetRole.VIEWER);
        assertThat(service.remove(BUDGET_ID, MEMBER_ID).removedAt()).isNotNull();

        verify(authorization, org.mockito.Mockito.times(2)).requireAllowed(BUDGET_ID, BudgetAction.MANAGE);
    }

    private BudgetMemberResponse member(BudgetRole role, Instant removedAt) {
        return new BudgetMemberResponse(MEMBER_ID, role, Instant.parse("2026-11-22T16:00:00Z"), removedAt, "Duarte");
    }
}
