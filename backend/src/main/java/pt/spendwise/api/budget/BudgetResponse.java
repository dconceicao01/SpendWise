package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import pt.spendwise.api.authorization.BudgetRole;

public record BudgetResponse(
        UUID id,
        String name,
        @JsonProperty("budget_type") BudgetType budgetType,
        @JsonProperty("currency_code") String currencyCode,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("archived_at") Instant archivedAt,
        @JsonProperty("period_frequency") BudgetPeriodFrequency periodFrequency,
        @JsonProperty("period_anchor_start") LocalDate periodAnchorStart,
        @JsonProperty("period_end_on") LocalDate periodEndOn,
        @JsonProperty("current_user_role") BudgetRole currentUserRole) {

    public BudgetResponse(
            UUID id, String name, BudgetType budgetType, String currencyCode,
            Instant createdAt, Instant archivedAt, BudgetRole currentUserRole) {
        this(id, name, budgetType, currencyCode, createdAt, archivedAt,
                BudgetPeriodFrequency.CUSTOM, null, null, currentUserRole);
    }

    public BudgetResponse withCurrentUserRole(BudgetRole role) {
        return new BudgetResponse(id, name, budgetType, currencyCode, createdAt, archivedAt,
                periodFrequency, periodAnchorStart, periodEndOn, role);
    }
}
