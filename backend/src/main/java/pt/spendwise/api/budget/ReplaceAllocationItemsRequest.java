package pt.spendwise.api.budget;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ReplaceAllocationItemsRequest(
        @NotNull @Size(min = 1, max = 100) List<@Valid AllocationItemRequest> items) {
}
