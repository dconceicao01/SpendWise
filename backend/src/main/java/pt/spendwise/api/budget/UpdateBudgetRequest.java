package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record UpdateBudgetRequest(
        @NotBlank @Size(max = 120) String name,
        @JsonProperty("period_frequency") BudgetPeriodFrequency periodFrequency,
        @JsonProperty("period_anchor_start") LocalDate periodAnchorStart,
        @JsonProperty("period_end_on") LocalDate periodEndOn) {

    public UpdateBudgetRequest(String name) {
        this(name, null, null, null);
    }
}
