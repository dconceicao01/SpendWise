package pt.spendwise.api.privacy;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import pt.spendwise.api.budget.IncomeAllocationSnapshotResponse;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record ExportIncome(
        UUID id,
        UUID periodId,
        BigDecimal amount,
        LocalDate occurredOn,
        Instant createdAt,
        List<IncomeAllocationSnapshotResponse> allocationSnapshot) {

    public ExportIncome {
        allocationSnapshot = List.copyOf(allocationSnapshot);
    }
}
