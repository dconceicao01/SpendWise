package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ExpenseEntryResponse(
        UUID id,
        @JsonProperty("budget_id") UUID budgetId,
        @JsonProperty("period_id") UUID periodId,
        @JsonProperty("category_id") UUID categoryId,
        @JsonProperty("label_id") UUID labelId,
        @JsonProperty("label") ExpenseLabelDetails label,
        @JsonProperty("recorded_by_member_id") UUID recordedByMemberId,
        BigDecimal amount,
        @JsonProperty("spent_on") LocalDate spentOn,
        String description,
        @JsonProperty("created_at") Instant createdAt) {

    public record ExpenseLabelDetails(String name, @JsonProperty("is_system") boolean isSystem) {}
}
