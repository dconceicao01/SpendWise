package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record IncomeCorrectionResponse(
        UUID id,
        @JsonProperty("budget_id") UUID budgetId,
        @JsonProperty("income_entry_id") UUID incomeEntryId,
        @JsonProperty("period_id") UUID periodId,
        @JsonProperty("allocation_set_id") UUID allocationSetId,
        @JsonProperty("recorded_by_member_id") UUID recordedByMemberId,
        @JsonProperty("amount_delta") BigDecimal amountDelta,
        String reason,
        @JsonProperty("occurred_on") LocalDate occurredOn,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("allocation_snapshot") List<IncomeCorrectionAllocationResponse> allocationSnapshot) {
    public IncomeCorrectionResponse {
        allocationSnapshot = List.copyOf(allocationSnapshot);
    }
}
