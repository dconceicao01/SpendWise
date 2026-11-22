package pt.spendwise.api.budget;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;

@Service
public class BudgetMemberService {

    private final BudgetMemberManagementRepository memberRepository;
    private final BudgetAuthorizationService authorizationService;

    public BudgetMemberService(
            BudgetMemberManagementRepository memberRepository,
            BudgetAuthorizationService authorizationService) {
        this.memberRepository = memberRepository;
        this.authorizationService = authorizationService;
    }

    public List<BudgetMemberResponse> list(UUID budgetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.READ);
        return memberRepository.findForBudget(budgetId);
    }

    public BudgetMemberResponse changeRole(UUID budgetId, UUID memberId, ChangeBudgetMemberRoleRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        return memberRepository.changeRole(budgetId, memberId, request.role())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Active budget member not found"));
    }

    public BudgetMemberResponse remove(UUID budgetId, UUID memberId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        return memberRepository.remove(budgetId, memberId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Active budget member not found"));
    }
}
