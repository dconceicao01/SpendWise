package pt.spendwise.api.budget;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record UpdateBudgetPeriodRequest(
        @NotNull LocalDate startsOn,
        @NotNull LocalDate endsOn) {
}
