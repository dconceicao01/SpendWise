package pt.spendwise.api.privacy;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import pt.spendwise.api.budget.IncomeScheduleFrequency;
import pt.spendwise.api.budget.IncomeScheduleStatus;
import pt.spendwise.api.budget.MonthlyShortMonthBehavior;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record ExportIncomeSchedule(
        UUID id,
        BigDecimal amount,
        IncomeScheduleFrequency frequency,
        MonthlyShortMonthBehavior monthlyShortMonthBehavior,
        LocalDate startDate,
        LocalDate endDate,
        LocalDate nextOccurrenceOn,
        IncomeScheduleStatus status,
        Instant createdAt,
        Instant updatedAt) {
}
