package pt.spendwise.api.budget;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

@Service
public class BudgetPeriodService {

    private final BudgetPeriodRepository periodRepository;
    private final BudgetAuthorizationService authorizationService;

    public BudgetPeriodService(
            BudgetPeriodRepository periodRepository,
            BudgetAuthorizationService authorizationService) {
        this.periodRepository = periodRepository;
        this.authorizationService = authorizationService;
    }

    public List<BudgetPeriodResponse> list(UUID budgetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        return periodRepository.findForBudget(budgetId);
    }

    public BudgetPeriodResponse create(UUID budgetId, CreateBudgetPeriodRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        validateDateRange(request.startsOn(), request.endsOn());
        return withConflictTranslation(() -> periodRepository.create(
                        budgetId, request.startsOn(), request.endsOn()))
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"));
    }

    public BudgetPeriodResponse update(UUID budgetId, UUID periodId, UpdateBudgetPeriodRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        validateDateRange(request.startsOn(), request.endsOn());
        return withConflictTranslation(() -> periodRepository.update(
                        budgetId, periodId, request.startsOn(), request.endsOn()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Budget period not found"));
    }

    private void validateDateRange(LocalDate startsOn, LocalDate endsOn) {
        if (endsOn.isBefore(startsOn)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Period end date must not precede its start date");
        }
    }

    private <T> T withConflictTranslation(Supplier<T> operation) {
        try {
            return operation.get();
        } catch (RestClientResponseException exception) {
            String response = exception.getResponseBodyAsString();
            int statusCode = exception.getStatusCode().value();
            boolean databaseConstraint = response.contains("23P01") || response.contains("23514");
            if (statusCode == 409 || databaseConstraint) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Period overlaps another period or excludes dates of recorded movements");
            }
            if (statusCode == 401 || statusCode == 403) {
                throw new AccessDeniedException("Budget access denied");
            }
            throw exception;
        }
    }
}
