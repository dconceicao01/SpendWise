package pt.spendwise.api.privacy;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record ExportAdjustment(
        UUID id,
        UUID periodId,
        UUID categoryId,
        UUID correctedExpenseEntryId,
        BigDecimal amountDelta,
        String reason,
        LocalDate occurredOn,
        Instant createdAt) {
}
