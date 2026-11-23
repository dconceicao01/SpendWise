package pt.spendwise.api.authorization;

import java.util.Optional;
import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

@Service
public class BudgetAuthorizationService {

    private final BudgetMembershipRepository membershipRepository;

    public BudgetAuthorizationService(BudgetMembershipRepository membershipRepository) {
        this.membershipRepository = membershipRepository;
    }

    public void requireAllowed(UUID budgetId, BudgetAction action) {
        if (budgetId == null || action == null) {
            throw new IllegalArgumentException("Budget and action are required");
        }

        boolean allowed = membershipRepository.findCurrentUserActiveRole(budgetId)
                .filter(action::allows)
                .isPresent();
        if (!allowed) {
            // Use the same response for a missing budget, a non-member, and an insufficient role.
            throw new AccessDeniedException("Budget access denied");
        }
    }

    public Optional<BudgetRole> currentRole(UUID budgetId) {
        return membershipRepository.findCurrentUserActiveRole(budgetId);
    }
}
