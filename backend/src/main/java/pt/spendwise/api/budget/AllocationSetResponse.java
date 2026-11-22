package pt.spendwise.api.budget;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AllocationSetResponse(
        UUID id,
        UUID budgetId,
        int version,
        String status,
        LocalDate effectiveFrom,
        Instant createdAt,
        List<AllocationItemResponse> items) {

    public AllocationSetResponse {
        items = List.copyOf(items);
    }
}
