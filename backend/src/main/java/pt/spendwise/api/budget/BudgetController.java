package pt.spendwise.api.budget;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/budgets")
public class BudgetController {

    private final BudgetService budgetService;

    public BudgetController(BudgetService budgetService) {
        this.budgetService = budgetService;
    }

    @PostMapping
    public ResponseEntity<BudgetResponse> create(@Valid @RequestBody CreateBudgetRequest request) {
        BudgetResponse budget = budgetService.create(request);
        return ResponseEntity.created(URI.create("/api/v1/budgets/" + budget.id())).body(budget);
    }

    @GetMapping
    public List<BudgetResponse> list() {
        return budgetService.listForCurrentUser();
    }

    @GetMapping("/{budgetId}")
    public BudgetResponse get(@PathVariable UUID budgetId) {
        return budgetService.get(budgetId);
    }

    @PatchMapping("/{budgetId}")
    public BudgetResponse rename(
            @PathVariable UUID budgetId,
            @Valid @RequestBody UpdateBudgetRequest request) {
        return budgetService.rename(budgetId, request);
    }

    @PostMapping("/{budgetId}/archive")
    public ResponseEntity<BudgetResponse> archive(@PathVariable UUID budgetId) {
        return ResponseEntity.status(HttpStatus.OK).body(budgetService.archive(budgetId));
    }

    @PostMapping("/{budgetId}/restore")
    public BudgetResponse restore(@PathVariable UUID budgetId) {
        return budgetService.restore(budgetId);
    }
}
