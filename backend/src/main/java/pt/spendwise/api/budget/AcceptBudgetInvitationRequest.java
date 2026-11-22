package pt.spendwise.api.budget;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record AcceptBudgetInvitationRequest(
        @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String token) {
}
