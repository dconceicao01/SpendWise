package pt.spendwise.api.profile;

import java.util.List;
import org.springframework.stereotype.Service;
import pt.spendwise.api.authorization.BudgetAuthorizationService;
import pt.spendwise.api.authorization.BudgetRole;
import pt.spendwise.api.budget.BudgetMemberManagementRepository;
import pt.spendwise.api.budget.BudgetRepository;
import pt.spendwise.api.budget.BudgetType;

@Service
public class AccountDeletionOptionsService {

    private final BudgetRepository budgetRepository;
    private final BudgetAuthorizationService authorizationService;
    private final BudgetMemberManagementRepository memberRepository;

    public AccountDeletionOptionsService(
            BudgetRepository budgetRepository,
            BudgetAuthorizationService authorizationService,
            BudgetMemberManagementRepository memberRepository) {
        this.budgetRepository = budgetRepository;
        this.authorizationService = authorizationService;
        this.memberRepository = memberRepository;
    }

    public List<AccountDeletionOptionsResponse> forCurrentUser() {
        return budgetRepository.findAllVisibleToCurrentUser().stream()
                .filter(budget -> budget.budgetType() == BudgetType.SHARED)
                .filter(budget -> authorizationService.currentRole(budget.id()).orElse(null) == BudgetRole.OWNER)
                .map(budget -> new AccountDeletionOptionsResponse(
                        budget.id(),
                        budget.name(),
                        memberRepository.findForBudget(budget.id()).stream()
                                .filter(member -> member.role() != BudgetRole.OWNER)
                                .map(member -> new AccountDeletionOptionsResponse.TransferTarget(
                                        member.id(), member.displayName()))
                                .toList()))
                .toList();
    }
}
