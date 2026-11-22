package pt.spendwise.api.budget;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateBudgetCategoryRequest(@NotBlank @Size(max = 80) String name) {
}
