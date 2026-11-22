package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.UUID;
import pt.spendwise.api.authorization.BudgetRole;

public record BudgetMemberResponse(
        @JsonProperty("member_id") UUID id,
        BudgetRole role,
        @JsonProperty("joined_at") Instant joinedAt,
        @JsonProperty("removed_at") Instant removedAt,
        @JsonProperty("display_name") String displayName) {
}
