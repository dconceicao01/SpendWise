package pt.spendwise.api.budget;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/budgets/{budgetId}")
public class BudgetMovementController {

    private final BudgetMovementService movementService;

    public BudgetMovementController(BudgetMovementService movementService) {
        this.movementService = movementService;
    }

    @GetMapping("/incomes")
    public List<IncomeEntryResponse> listIncomes(
            @PathVariable UUID budgetId,
            @RequestParam(required = false) UUID periodId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        return movementService.listIncomes(budgetId, periodId, limit, offset);
    }

    @PostMapping("/incomes")
    public ResponseEntity<IncomeEntryResponse> recordIncome(
            @PathVariable UUID budgetId, @Valid @RequestBody CreateIncomeRequest request) {
        IncomeEntryResponse income = movementService.recordIncome(budgetId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(income);
    }

    @GetMapping("/income-corrections")
    public List<IncomeCorrectionResponse> listIncomeCorrections(
            @PathVariable UUID budgetId,
            @RequestParam(required = false) UUID periodId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        return movementService.listIncomeCorrections(budgetId, periodId, limit, offset);
    }

    @PostMapping("/incomes/{incomeEntryId}/corrections")
    public ResponseEntity<IncomeCorrectionResponse> recordIncomeCorrection(
            @PathVariable UUID budgetId,
            @PathVariable UUID incomeEntryId,
            @Valid @RequestBody CreateIncomeCorrectionRequest request) {
        IncomeCorrectionResponse correction = movementService.recordIncomeCorrection(
                budgetId, incomeEntryId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(correction);
    }

    @GetMapping("/expenses")
    public List<ExpenseEntryResponse> listExpenses(
            @PathVariable UUID budgetId,
            @RequestParam(required = false) UUID periodId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        return movementService.listExpenses(budgetId, periodId, limit, offset);
    }

    @PostMapping("/expenses")
    public ResponseEntity<ExpenseEntryResponse> recordExpense(
            @PathVariable UUID budgetId, @Valid @RequestBody CreateExpenseRequest request) {
        ExpenseEntryResponse expense = movementService.recordExpense(budgetId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(expense);
    }

    @GetMapping("/adjustments")
    public List<BudgetAdjustmentResponse> listAdjustments(
            @PathVariable UUID budgetId,
            @RequestParam(required = false) UUID periodId,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        return movementService.listAdjustments(budgetId, periodId, limit, offset);
    }

    @PostMapping("/adjustments")
    public ResponseEntity<BudgetAdjustmentResponse> recordAdjustment(
            @PathVariable UUID budgetId, @Valid @RequestBody CreateBudgetAdjustmentRequest request) {
        BudgetAdjustmentResponse adjustment = movementService.recordAdjustment(budgetId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(adjustment);
    }
}
