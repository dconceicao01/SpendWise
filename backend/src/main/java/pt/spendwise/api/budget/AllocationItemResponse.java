package pt.spendwise.api.budget;

import java.math.BigDecimal;
import java.util.UUID;

public record AllocationItemResponse(UUID categoryId, int percentageBasisPoints, BigDecimal percentage) {

    public static AllocationItemResponse from(UUID categoryId, int percentageBasisPoints) {
        return new AllocationItemResponse(categoryId, percentageBasisPoints,
                BigDecimal.valueOf(percentageBasisPoints, 2));
    }
}
