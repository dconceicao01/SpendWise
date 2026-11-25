package pt.spendwise.api.privacy;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import pt.spendwise.api.budget.IncomeCorrectionAllocationResponse;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record ExportIncomeCorrection(
        UUID id,
        UUID incomeEntryId,
        UUID periodId,
        UUID allocationSetId,
        BigDecimal amountDelta,
        String reason,
        LocalDate occurredOn,
        Instant createdAt,
        List<IncomeCorrectionAllocationResponse> allocationSnapshot) {

    public ExportIncomeCorrection {
        allocationSnapshot = List.copyOf(allocationSnapshot);
    }
}
