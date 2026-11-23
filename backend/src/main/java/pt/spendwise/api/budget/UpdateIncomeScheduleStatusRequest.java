package pt.spendwise.api.budget;

import jakarta.validation.constraints.NotNull;

public record UpdateIncomeScheduleStatusRequest(@NotNull IncomeScheduleStatus status) {
}
