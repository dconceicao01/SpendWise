package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record BudgetPeriodResponse(
        UUID id,
        @JsonProperty("budget_id") UUID budgetId,
        @JsonProperty("starts_on") LocalDate startsOn,
        @JsonProperty("ends_on") LocalDate endsOn,
        @JsonProperty("created_at") Instant createdAt) {
}
