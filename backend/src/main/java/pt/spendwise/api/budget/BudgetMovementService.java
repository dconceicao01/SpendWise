package pt.spendwise.api.budget;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

@Service
public class BudgetMovementService {

    private static final int MAX_PAGE_SIZE = 100;
    private static final String MOVEMENT_CONFLICT = "Movement is invalid for this budget or period";

    private final BudgetMovementRepository movementRepository;
    private final BudgetAuthorizationService authorizationService;

    public BudgetMovementService(
            BudgetMovementRepository movementRepository,
            BudgetAuthorizationService authorizationService) {
        this.movementRepository = movementRepository;
        this.authorizationService = authorizationService;
    }

    public List<IncomeEntryResponse> listIncomes(UUID budgetId, UUID periodId, int limit, int offset) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        return movementRepository.findIncomes(budgetId, periodId, pageSize(limit), pageOffset(offset));
    }

    public IncomeEntryResponse recordIncome(UUID budgetId, CreateIncomeRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.RECORD_MOVEMENT);
        try {
            return movementRepository.recordIncome(budgetId, request)
                    .orElseThrow(() -> new IllegalStateException("Recorded income is not visible to its owner"));
        } catch (RestClientResponseException exception) {
            throw translateMovementError(exception);
        }
    }

    public List<IncomeCorrectionResponse> listIncomeCorrections(
            UUID budgetId, UUID periodId, int limit, int offset) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        return movementRepository.findIncomeCorrections(budgetId, periodId, pageSize(limit), pageOffset(offset));
    }

    public IncomeCorrectionResponse recordIncomeCorrection(
            UUID budgetId, UUID incomeEntryId, CreateIncomeCorrectionRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.RECORD_MOVEMENT);
        if (request.amountDelta().signum() == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Correction amount must not be zero");
        }
        try {
            return movementRepository.recordIncomeCorrection(budgetId, incomeEntryId, request)
                    .orElseThrow(() -> new IllegalStateException("Recorded income correction is not visible to its owner"));
        } catch (RestClientResponseException exception) {
            throw translateMovementError(exception);
        }
    }

    public List<ExpenseEntryResponse> listExpenses(UUID budgetId, UUID periodId, int limit, int offset) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        return movementRepository.findExpenses(budgetId, periodId, pageSize(limit), pageOffset(offset));
    }

    public List<ExpenseEntryResponse> listRequestedInvoices(
            UUID budgetId, int year, Integer month, int limit, int offset) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        LocalDate startInclusive;
        LocalDate endExclusive;
        try {
            if (year < 1 || year > 9999 || (month != null && (month < 1 || month > 12))) {
                throw new DateTimeException("Invoice year or month is outside the supported range");
            }
            startInclusive = LocalDate.of(year, month == null ? 1 : month, 1);
            endExclusive = month == null ? startInclusive.plusYears(1) : startInclusive.plusMonths(1);
        } catch (DateTimeException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invoice year and month are invalid");
        }
        return movementRepository.findRequestedInvoices(
                budgetId, startInclusive, endExclusive, pageSize(limit), pageOffset(offset));
    }

    public ExpenseEntryResponse recordExpense(UUID budgetId, CreateExpenseRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.RECORD_MOVEMENT);
        try {
            return movementRepository.recordExpense(budgetId, request)
                    .orElseThrow(() -> new IllegalStateException("Recorded expense is not visible to its owner"));
        } catch (RestClientResponseException exception) {
            throw translateMovementError(exception);
        }
    }

    public ExpenseEntryResponse updateExpenseLabel(UUID budgetId, UUID expenseId, UUID labelId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.RECORD_MOVEMENT);
        try {
            return movementRepository.updateExpenseLabel(budgetId, expenseId, labelId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found"));
        } catch (RestClientResponseException exception) {
            throw translateMovementError(exception);
        }
    }

    public List<BudgetAdjustmentResponse> listAdjustments(UUID budgetId, UUID periodId, int limit, int offset) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        return movementRepository.findAdjustments(budgetId, periodId, pageSize(limit), pageOffset(offset));
    }

    public BudgetAdjustmentResponse recordAdjustment(UUID budgetId, CreateBudgetAdjustmentRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.RECORD_MOVEMENT);
        if (request.amountDelta().signum() == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Adjustment amount must not be zero");
        }
        try {
            return movementRepository.recordAdjustment(budgetId, request)
                    .orElseThrow(() -> new IllegalStateException("Recorded adjustment is not visible to its owner"));
        } catch (RestClientResponseException exception) {
            throw translateMovementError(exception);
        }
    }

    private int pageSize(int limit) {
        if (limit < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Page size must be positive");
        }
        return Math.min(limit, MAX_PAGE_SIZE);
    }

    private int pageOffset(int offset) {
        if (offset < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Page offset must not be negative");
        }
        return offset;
    }

    private ResponseStatusException translateMovementError(RestClientResponseException exception) {
        String response = exception.getResponseBodyAsString();
        int status = exception.getStatusCode().value();
        if (status == 401 || status == 403 || response.contains("42501")) {
            return new ResponseStatusException(HttpStatus.FORBIDDEN, "Budget access denied");
        }
        if (status == 409 || response.contains("23514") || response.contains("23503")) {
            return new ResponseStatusException(HttpStatus.CONFLICT, MOVEMENT_CONFLICT);
        }
        if (response.contains("22023")) {
            return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Movement details are invalid");
        }
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Movement could not be saved");
    }
}
