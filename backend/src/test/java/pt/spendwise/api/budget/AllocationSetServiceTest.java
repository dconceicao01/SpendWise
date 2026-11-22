package pt.spendwise.api.budget;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AllocationSetServiceTest {

    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID CATEGORY_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");
    private static final UUID SET_ID = UUID.fromString("d7d0d8bf-f18f-4b90-a611-50baa2e4eaab");
    private AllocationSetRepository repository;
    private BudgetAuthorizationService authorization;
    private AllocationSetService service;

    @BeforeEach
    void setUp() {
        repository = mock(AllocationSetRepository.class);
        authorization = mock(BudgetAuthorizationService.class);
        service = new AllocationSetService(repository, authorization);
    }

    @Test
    void listsAllocationVersionsForActiveMembers() {
        List<AllocationSetResponse> sets = List.of(allocationSet());
        when(repository.findForBudget(BUDGET_ID)).thenReturn(sets);

        assertThat(service.list(BUDGET_ID)).isEqualTo(sets);
        verify(authorization).requireAllowed(BUDGET_ID, BudgetAction.READ);
    }

    @Test
    void createsReplacesAndActivatesForOwners() {
        CreateAllocationSetRequest create = new CreateAllocationSetRequest(List.of(item("50.25")));
        ReplaceAllocationItemsRequest replace = new ReplaceAllocationItemsRequest(List.of(item("50.25")));
        when(repository.createDraft(BUDGET_ID, create.items())).thenReturn(allocationSet());
        when(repository.replaceDraftItems(BUDGET_ID, SET_ID, replace.items())).thenReturn(allocationSet());
        when(repository.activate(BUDGET_ID, SET_ID)).thenReturn(allocationSet());

        assertThat(service.createDraft(BUDGET_ID, create)).isEqualTo(allocationSet());
        assertThat(service.replaceDraftItems(BUDGET_ID, SET_ID, replace)).isEqualTo(allocationSet());
        assertThat(service.activate(BUDGET_ID, SET_ID)).isEqualTo(allocationSet());

        verify(authorization, org.mockito.Mockito.times(3)).requireAllowed(BUDGET_ID, BudgetAction.MANAGE);
    }

    @Test
    void rejectsDuplicateCategoriesBeforeCallingTheRepository() {
        CreateAllocationSetRequest request = new CreateAllocationSetRequest(List.of(item("50"), item("50")));

        assertThatThrownBy(() -> service.createDraft(BUDGET_ID, request))
                .isInstanceOf(ResponseStatusException.class)
                .extracting("statusCode")
                .isEqualTo(HttpStatus.BAD_REQUEST);
        verify(repository, never()).createDraft(BUDGET_ID, request.items());
    }

    private AllocationItemRequest item(String percentage) {
        return new AllocationItemRequest(CATEGORY_ID, new BigDecimal(percentage));
    }

    private AllocationSetResponse allocationSet() {
        return new AllocationSetResponse(SET_ID, BUDGET_ID, 1, "DRAFT", LocalDate.parse("2026-11-22"),
                Instant.parse("2026-11-22T17:00:00Z"),
                List.of(AllocationItemResponse.from(CATEGORY_ID, 5025)));
    }
}
