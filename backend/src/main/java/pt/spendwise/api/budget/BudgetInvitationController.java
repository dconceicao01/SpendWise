package pt.spendwise.api.budget;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class BudgetInvitationController {

    private final BudgetInvitationService invitationService;

    public BudgetInvitationController(BudgetInvitationService invitationService) {
        this.invitationService = invitationService;
    }

    @GetMapping("/budgets/{budgetId}/invitations")
    public List<BudgetInvitationResponse> list(@PathVariable UUID budgetId) {
        return invitationService.list(budgetId);
    }

    @PostMapping("/budgets/{budgetId}/invitations")
    public ResponseEntity<BudgetInvitationResponse> create(
            @PathVariable UUID budgetId, @Valid @RequestBody CreateBudgetInvitationRequest request) {
        BudgetInvitationResponse invitation = invitationService.create(budgetId, request);
        return ResponseEntity.created(URI.create("/api/v1/budgets/" + budgetId + "/invitations/" + invitation.id()))
                .body(invitation);
    }

    @PostMapping("/invitations/accept")
    public BudgetInvitationAcceptanceResponse accept(@Valid @RequestBody AcceptBudgetInvitationRequest request) {
        return invitationService.accept(request.token());
    }

    @PostMapping("/budgets/{budgetId}/invitations/{invitationId}/revoke")
    public BudgetInvitationResponse revoke(@PathVariable UUID budgetId, @PathVariable UUID invitationId) {
        return invitationService.revoke(budgetId, invitationId);
    }
}
