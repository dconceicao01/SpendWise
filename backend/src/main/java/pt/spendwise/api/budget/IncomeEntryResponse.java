package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record IncomeEntryResponse(
        UUID id,
        @JsonProperty("budget_id") UUID budgetId,
        @JsonProperty("period_id") UUID periodId,
        @JsonProperty("income_member_id") UUID incomeMemberId,
        @JsonProperty("recorded_by_member_id") UUID recordedByMemberId,
        @JsonProperty("allocation_set_id") UUID allocationSetId,
        @JsonProperty("schedule_id") UUID scheduleId,
        @JsonProperty("scheduled_for") LocalDate scheduledFor,
        BigDecimal amount,
        @JsonProperty("occurred_on") LocalDate occurredOn,
        String description,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("allocation_snapshot") List<IncomeAllocationSnapshotResponse> allocationSnapshot) {
}
