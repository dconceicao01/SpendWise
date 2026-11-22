package pt.spendwise.api.budget;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateBudgetRequest(@NotBlank @Size(max = 120) String name) {
}
