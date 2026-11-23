package pt.spendwise.api.profile;

import java.util.List;
import java.util.UUID;

public record AccountDeletionOptionsResponse(
        UUID budgetId,
        String budgetName,
        List<TransferTarget> transferTargets) {

    public record TransferTarget(UUID memberId, String displayName) {
    }
}
