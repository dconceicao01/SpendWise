package pt.spendwise.api.budget;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/budgets/{budgetId}/members")
public class BudgetMemberController {

    private final BudgetMemberService memberService;

    public BudgetMemberController(BudgetMemberService memberService) {
        this.memberService = memberService;
    }

    @GetMapping
    public List<BudgetMemberResponse> list(@PathVariable UUID budgetId) {
        return memberService.list(budgetId);
    }

    @PatchMapping("/{memberId}/role")
    public BudgetMemberResponse changeRole(
            @PathVariable UUID budgetId,
            @PathVariable UUID memberId,
            @Valid @RequestBody ChangeBudgetMemberRoleRequest request) {
        return memberService.changeRole(budgetId, memberId, request);
    }

    @PostMapping("/{memberId}/remove")
    public BudgetMemberResponse remove(@PathVariable UUID budgetId, @PathVariable UUID memberId) {
        return memberService.remove(budgetId, memberId);
    }
}
