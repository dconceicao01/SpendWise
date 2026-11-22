package pt.spendwise.api.budget;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BudgetCategoryServiceTest {

    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID CATEGORY_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");
    private BudgetCategoryRepository repository;
    private BudgetAuthorizationService authorization;
    private BudgetCategoryService service;

    @BeforeEach
    void setUp() {
        repository = mock(BudgetCategoryRepository.class);
        authorization = mock(BudgetAuthorizationService.class);
        service = new BudgetCategoryService(repository, authorization);
    }

    @Test
    void listsCategoriesForActiveMembers() {
        List<BudgetCategoryResponse> categories = List.of(category());
        when(repository.findForBudget(BUDGET_ID)).thenReturn(categories);

        assertThat(service.list(BUDGET_ID)).isEqualTo(categories);
        verify(authorization).requireAllowed(BUDGET_ID, BudgetAction.READ);
    }

    @Test
    void createsRenamesAndArchivesOnlyAfterOwnerAuthorization() {
        when(repository.create(BUDGET_ID, "Travel")).thenReturn(category());
        when(repository.updateName(BUDGET_ID, CATEGORY_ID, "Travel")).thenReturn(Optional.of(category()));
        when(repository.archive(BUDGET_ID, CATEGORY_ID)).thenReturn(Optional.of(category()));

        assertThat(service.create(BUDGET_ID, new CreateBudgetCategoryRequest(" Travel "))).isEqualTo(category());
        assertThat(service.rename(BUDGET_ID, CATEGORY_ID, new UpdateBudgetCategoryRequest(" Travel ")))
                .isEqualTo(category());
        assertThat(service.archive(BUDGET_ID, CATEGORY_ID)).isEqualTo(category());

        verify(authorization, org.mockito.Mockito.times(3)).requireAllowed(BUDGET_ID, BudgetAction.MANAGE);
    }

    private BudgetCategoryResponse category() {
        return new BudgetCategoryResponse(CATEGORY_ID, BUDGET_ID, "Travel", Instant.parse("2026-11-22T17:00:00Z"), null);
    }
}
