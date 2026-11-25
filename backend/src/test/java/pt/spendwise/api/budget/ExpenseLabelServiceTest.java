package pt.spendwise.api.budget;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

class ExpenseLabelServiceTest {
    private static final UUID BUDGET_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID CATEGORY_ID = UUID.fromString("20000000-0000-0000-0000-000000000001");
    private static final UUID LABEL_ID = UUID.fromString("30000000-0000-0000-0000-000000000001");

    private ExpenseLabelRepository repository;
    private BudgetAuthorizationService authorizationService;
    private ExpenseLabelService service;

    @BeforeEach
    void setUp() {
        repository = mock(ExpenseLabelRepository.class);
        authorizationService = mock(BudgetAuthorizationService.class);
        service = new ExpenseLabelService(repository, authorizationService);
    }

    @Test
    void listsLabelsAfterReadAuthorization() {
        ExpenseLabelResponse label = new ExpenseLabelResponse(
                LABEL_ID, BUDGET_ID, CATEGORY_ID, "Cultura", false, Instant.parse("2026-11-25T00:00:00Z"));
        when(repository.findForCategory(BUDGET_ID, CATEGORY_ID)).thenReturn(List.of(label));

        assertThat(service.list(BUDGET_ID, CATEGORY_ID)).containsExactly(label);

        verify(authorizationService).requireAllowed(BUDGET_ID, BudgetAction.READ);
    }

    @Test
    void createsTrimmedLabelAfterMovementAuthorization() {
        ExpenseLabelResponse label = new ExpenseLabelResponse(
                LABEL_ID, BUDGET_ID, CATEGORY_ID, "Cultura", false, Instant.parse("2026-11-25T00:00:00Z"));
        when(repository.create(BUDGET_ID, CATEGORY_ID, "Cultura")).thenReturn(label);

        assertThat(service.create(BUDGET_ID, CATEGORY_ID, new CreateExpenseLabelRequest(" Cultura ")))
                .isEqualTo(label);

        verify(authorizationService).requireAllowed(BUDGET_ID, BudgetAction.RECORD_MOVEMENT);
        verify(repository).create(BUDGET_ID, CATEGORY_ID, "Cultura");
    }
}
