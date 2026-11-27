package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record CreateExpenseRequest(
        @NotNull @JsonProperty("period_id") UUID periodId,
        @NotNull @JsonProperty("category_id") UUID categoryId,
        @NotNull @JsonProperty("label_id") UUID labelId,
        @NotNull @DecimalMin(value = "0.0001") @Digits(integer = 15, fraction = 4) BigDecimal amount,
        @NotNull @JsonProperty("spent_on") LocalDate spentOn,
        @Size(max = 500) String description,
        @NotNull @JsonProperty("invoice_status") ExpenseInvoiceStatus invoiceStatus,
        @Pattern(regexp = "[0-9]{9}") @JsonProperty("supplier_nipc") String supplierNipc) {

    @AssertTrue(message = "A requested invoice requires a 9-digit NIPC; other expenses cannot have a NIPC")
    @JsonIgnore
    public boolean isInvoiceDetailsValid() {
        if (invoiceStatus == null) return false;
        return invoiceStatus == ExpenseInvoiceStatus.REQUESTED
                ? supplierNipc != null && supplierNipc.matches("[0-9]{9}")
                : supplierNipc == null;
    }
}
