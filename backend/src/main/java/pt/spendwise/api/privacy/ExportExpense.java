package pt.spendwise.api.privacy;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import pt.spendwise.api.budget.ExpenseInvoiceStatus;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record ExportExpense(
        UUID id,
        UUID periodId,
        UUID categoryId,
        UUID labelId,
        String labelName,
        BigDecimal amount,
        LocalDate spentOn,
        String description,
        ExpenseInvoiceStatus invoiceStatus,
        String supplierNipc,
        Instant createdAt) {
}
