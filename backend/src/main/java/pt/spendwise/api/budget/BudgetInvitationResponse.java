package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.UUID;

public record BudgetInvitationResponse(
        UUID id,
        @JsonProperty("budget_id") UUID budgetId,
        String email,
        BudgetInvitationRole role,
        @JsonProperty("expires_at") Instant expiresAt,
        @JsonProperty("accepted_at") Instant acceptedAt,
        @JsonProperty("revoked_at") Instant revokedAt,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("invitation_link") String invitationLink) {
}
