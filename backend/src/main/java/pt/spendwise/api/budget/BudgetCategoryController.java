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
@RequestMapping("/api/v1/budgets/{budgetId}/categories")
public class BudgetCategoryController {

    private final BudgetCategoryService categoryService;

    public BudgetCategoryController(BudgetCategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    public List<BudgetCategoryResponse> list(@PathVariable UUID budgetId) {
        return categoryService.list(budgetId);
    }

    @PostMapping
    public ResponseEntity<BudgetCategoryResponse> create(
            @PathVariable UUID budgetId, @Valid @RequestBody CreateBudgetCategoryRequest request) {
        BudgetCategoryResponse category = categoryService.create(budgetId, request);
        return ResponseEntity.created(URI.create("/api/v1/budgets/" + budgetId + "/categories/" + category.id()))
                .body(category);
    }

    @PatchMapping("/{categoryId}")
    public BudgetCategoryResponse rename(
            @PathVariable UUID budgetId,
            @PathVariable UUID categoryId,
            @Valid @RequestBody UpdateBudgetCategoryRequest request) {
        return categoryService.rename(budgetId, categoryId, request);
    }

    @PostMapping("/{categoryId}/archive")
    public BudgetCategoryResponse archive(@PathVariable UUID budgetId, @PathVariable UUID categoryId) {
        return categoryService.archive(budgetId, categoryId);
    }
}
