package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.util.UUID;

public record IncomeAllocationSnapshotResponse(
        @JsonProperty("category_id") UUID categoryId,
        @JsonProperty("percentage_basis_points") int percentageBasisPoints,
        @JsonProperty("allocated_amount") BigDecimal allocatedAmount) {
}
