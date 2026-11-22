package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.UUID;

public record BudgetCategoryResponse(
        UUID id,
        @JsonProperty("budget_id") UUID budgetId,
        String name,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("archived_at") Instant archivedAt) {
}
