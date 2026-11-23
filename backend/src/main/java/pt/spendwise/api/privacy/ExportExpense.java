package pt.spendwise.api.privacy;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record ExportExpense(
        UUID id,
        UUID periodId,
        UUID categoryId,
        BigDecimal amount,
        LocalDate spentOn,
        String description,
        Instant createdAt) {
}
