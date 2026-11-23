package pt.spendwise.api.budget;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

@Service
public class IncomeScheduleService {

    private static final int MAX_PAGE_SIZE = 100;
    private final IncomeScheduleRepository repository;
    private final BudgetAuthorizationService authorizationService;

    public IncomeScheduleService(
            IncomeScheduleRepository repository,
            BudgetAuthorizationService authorizationService) {
        this.repository = repository;
        this.authorizationService = authorizationService;
    }

    public List<IncomeScheduleResponse> list(UUID budgetId, int limit, int offset) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        if (limit < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Page size must be positive");
        }
        if (offset < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Page offset must not be negative");
        }
        return repository.findForBudget(budgetId, Math.min(limit, MAX_PAGE_SIZE), offset);
    }

    public IncomeScheduleResponse create(UUID budgetId, CreateIncomeScheduleRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.RECORD_MOVEMENT);
        if (request.endDate() != null && request.endDate().isBefore(request.startDate())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Schedule end date must not precede its start date");
        }
        try {
            return repository.create(budgetId, request)
                    .orElseThrow(() -> new IllegalStateException("Created income schedule is not visible to its owner"));
        } catch (RestClientResponseException exception) {
            throw translateScheduleError(exception);
        }
    }

    public IncomeScheduleResponse updateStatus(
            UUID budgetId, UUID scheduleId, UpdateIncomeScheduleStatusRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.RECORD_MOVEMENT);
        if (request.status() == IncomeScheduleStatus.COMPLETED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Completed schedules cannot be set by a user");
        }
        try {
            return repository.updateStatus(budgetId, scheduleId, request.status())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Income schedule not found"));
        } catch (RestClientResponseException exception) {
            throw translateScheduleError(exception);
        }
    }

    private ResponseStatusException translateScheduleError(RestClientResponseException exception) {
        String response = exception.getResponseBodyAsString();
        int status = exception.getStatusCode().value();
        if (status == 401 || status == 403 || response.contains("42501")) {
            return new ResponseStatusException(HttpStatus.FORBIDDEN, "Budget access denied");
        }
        if (status == 409 || response.contains("23514") || response.contains("23503")) {
            return new ResponseStatusException(HttpStatus.CONFLICT, "Income schedule conflicts with budget data");
        }
        if (response.contains("22023")) {
            return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Income schedule details are invalid");
        }
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Income schedule could not be saved");
    }
}
