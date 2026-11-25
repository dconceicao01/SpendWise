package pt.spendwise.api.budget;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/budgets/{budgetId}/categories/{categoryId}/expense-labels")
public class ExpenseLabelController {
    private final ExpenseLabelService service;

    public ExpenseLabelController(ExpenseLabelService service) {
        this.service = service;
    }

    @GetMapping
    public List<ExpenseLabelResponse> list(@PathVariable UUID budgetId, @PathVariable UUID categoryId) {
        return service.list(budgetId, categoryId);
    }

    @PostMapping
    public ResponseEntity<ExpenseLabelResponse> create(
            @PathVariable UUID budgetId,
            @PathVariable UUID categoryId,
            @Valid @RequestBody CreateExpenseLabelRequest request) {
        ExpenseLabelResponse label = service.create(budgetId, categoryId, request);
        return ResponseEntity.created(URI.create("/api/v1/budgets/" + budgetId + "/categories/" + categoryId
                + "/expense-labels/" + label.id())).body(label);
    }
}
