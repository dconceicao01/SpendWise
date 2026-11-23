package pt.spendwise.api.profile;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

public record DeleteAccountRequest(@NotNull List<@Valid OwnerTransfer> ownerTransfers) {

    public record OwnerTransfer(@NotNull UUID budgetId, @NotNull UUID targetMemberId) {
    }
}
