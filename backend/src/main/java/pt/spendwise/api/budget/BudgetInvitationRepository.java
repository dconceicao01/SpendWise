package pt.spendwise.api.budget;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BudgetInvitationRepository {

    List<BudgetInvitationResponse> findForBudget(UUID budgetId);

    BudgetInvitationResponse create(
            UUID budgetId, UUID creatorMemberId, String email, BudgetInvitationRole role, String tokenHash, Instant expiresAt);

    Optional<BudgetInvitationResponse> revoke(UUID budgetId, UUID invitationId);

    BudgetInvitationAcceptanceResponse accept(String tokenHash);
}
