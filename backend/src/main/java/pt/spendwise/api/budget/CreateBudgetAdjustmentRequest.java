package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record CreateBudgetAdjustmentRequest(
        @NotNull @JsonProperty("period_id") UUID periodId,
        @NotNull @JsonProperty("category_id") UUID categoryId,
        @NotNull @Digits(integer = 15, fraction = 4) @JsonProperty("amount_delta") BigDecimal amountDelta,
        @NotBlank @Size(max = 500) String reason,
        @NotNull @JsonProperty("occurred_on") LocalDate occurredOn,
        @JsonProperty("corrected_expense_entry_id") UUID correctedExpenseEntryId) {
}
