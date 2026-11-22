package pt.spendwise.api.budget;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateBudgetRequest(
        @NotBlank @Size(max = 120) String name,
        @NotNull BudgetType budgetType,
        @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currencyCode) {
}
