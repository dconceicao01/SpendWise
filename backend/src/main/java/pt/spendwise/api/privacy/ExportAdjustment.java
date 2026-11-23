package pt.spendwise.api.privacy;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
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
