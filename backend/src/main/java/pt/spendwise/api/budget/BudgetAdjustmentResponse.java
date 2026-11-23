package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record BudgetAdjustmentResponse(
        UUID id,
        @JsonProperty("budget_id") UUID budgetId,
        @JsonProperty("period_id") UUID periodId,
        @JsonProperty("category_id") UUID categoryId,
        @JsonProperty("corrected_expense_entry_id") UUID correctedExpenseEntryId,
        @JsonProperty("recorded_by_member_id") UUID recordedByMemberId,
        @JsonProperty("amount_delta") BigDecimal amountDelta,
        String reason,
        @JsonProperty("occurred_on") LocalDate occurredOn,
        @JsonProperty("created_at") Instant createdAt) {
}
