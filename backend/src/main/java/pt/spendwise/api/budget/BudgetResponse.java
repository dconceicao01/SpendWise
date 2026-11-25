package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.UUID;
import pt.spendwise.api.authorization.BudgetRole;

public record BudgetResponse(
        UUID id,
        String name,
        @JsonProperty("budget_type") BudgetType budgetType,
        @JsonProperty("currency_code") String currencyCode,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("archived_at") Instant archivedAt,
        @JsonProperty("current_user_role") BudgetRole currentUserRole) {

    public BudgetResponse withCurrentUserRole(BudgetRole role) {
        return new BudgetResponse(id, name, budgetType, currencyCode, createdAt, archivedAt, role);
    }
}
