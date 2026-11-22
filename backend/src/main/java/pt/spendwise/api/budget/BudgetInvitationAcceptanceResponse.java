package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.UUID;

public record BudgetInvitationAcceptanceResponse(
        boolean accepted,
        @JsonProperty("budget_id") UUID budgetId,
        BudgetInvitationRole role,
        @JsonProperty("rate_limited") boolean rateLimited) {
}
