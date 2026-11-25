package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record CreateExpenseRequest(
        @NotNull @JsonProperty("period_id") UUID periodId,
        @NotNull @JsonProperty("category_id") UUID categoryId,
        @NotNull @JsonProperty("label_id") UUID labelId,
        @NotNull @DecimalMin(value = "0.0001") @Digits(integer = 15, fraction = 4) BigDecimal amount,
        @NotNull @JsonProperty("spent_on") LocalDate spentOn,
        @Size(max = 500) String description) {
}
