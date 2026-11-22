package pt.spendwise.api.authorization;

import java.util.EnumSet;

public enum BudgetAction {
    READ(EnumSet.of(BudgetRole.OWNER, BudgetRole.CONTRIBUTOR, BudgetRole.VIEWER)),
    RECORD_MOVEMENT(EnumSet.of(BudgetRole.OWNER, BudgetRole.CONTRIBUTOR)),
    MANAGE(EnumSet.of(BudgetRole.OWNER));

    private final EnumSet<BudgetRole> permittedRoles;

    BudgetAction(EnumSet<BudgetRole> permittedRoles) {
        this.permittedRoles = permittedRoles;
    }

    public boolean allows(BudgetRole role) {
        return permittedRoles.contains(role);
    }
}
