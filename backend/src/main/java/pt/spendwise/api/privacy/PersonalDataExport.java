package pt.spendwise.api.privacy;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;

public record PersonalDataExport(
        @JsonProperty("generated_at") Instant generatedAt,
        ExportProfile profile,
        List<BudgetDataExport> budgets) {

    public PersonalDataExport {
        budgets = List.copyOf(budgets);
    }
}
