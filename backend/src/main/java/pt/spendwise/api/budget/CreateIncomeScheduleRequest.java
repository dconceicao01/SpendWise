package pt.spendwise.api.budget;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

public record CreateIncomeScheduleRequest(
        @NotNull @DecimalMin(value = "0.0001") @Digits(integer = 15, fraction = 4) BigDecimal amount,
        @NotNull IncomeScheduleFrequency frequency,
        @NotNull LocalDate startDate,
        LocalDate endDate,
        @NotNull MonthlyShortMonthBehavior monthlyShortMonthBehavior,
        @Size(max = 500) String description) {
}
