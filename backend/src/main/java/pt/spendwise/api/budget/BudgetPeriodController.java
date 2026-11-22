package pt.spendwise.api.budget;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/budgets/{budgetId}/periods")
public class BudgetPeriodController {

    private final BudgetPeriodService periodService;

    public BudgetPeriodController(BudgetPeriodService periodService) {
        this.periodService = periodService;
    }

    @GetMapping
    public List<BudgetPeriodResponse> list(@PathVariable UUID budgetId) {
        return periodService.list(budgetId);
    }

    @PostMapping
    public ResponseEntity<BudgetPeriodResponse> create(
            @PathVariable UUID budgetId,
            @Valid @RequestBody CreateBudgetPeriodRequest request) {
        BudgetPeriodResponse period = periodService.create(budgetId, request);
        return ResponseEntity.created(URI.create(
                "/api/v1/budgets/" + budgetId + "/periods/" + period.id())).body(period);
    }

    @PatchMapping("/{periodId}")
    public BudgetPeriodResponse update(
            @PathVariable UUID budgetId,
            @PathVariable UUID periodId,
            @Valid @RequestBody UpdateBudgetPeriodRequest request) {
        return periodService.update(budgetId, periodId, request);
    }
}
