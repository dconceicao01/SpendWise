package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record IncomeScheduleResponse(
        UUID id,
        @JsonProperty("budget_id") UUID budgetId,
        @JsonProperty("income_member_id") UUID incomeMemberId,
        @JsonProperty("created_by_member_id") UUID createdByMemberId,
        BigDecimal amount,
        String description,
        IncomeScheduleFrequency frequency,
        @JsonProperty("monthly_short_month_behavior") MonthlyShortMonthBehavior monthlyShortMonthBehavior,
        @JsonProperty("start_date") LocalDate startDate,
        @JsonProperty("end_date") LocalDate endDate,
        @JsonProperty("next_occurrence_on") LocalDate nextOccurrenceOn,
        IncomeScheduleStatus status,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("updated_at") Instant updatedAt) {
}
