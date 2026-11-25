package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.UUID;

public record ExpenseLabelResponse(
        UUID id,
        @JsonProperty("budget_id") UUID budgetId,
        @JsonProperty("category_id") UUID categoryId,
        String name,
        @JsonProperty("is_system") boolean isSystem,
        @JsonProperty("created_at") Instant createdAt) {}
