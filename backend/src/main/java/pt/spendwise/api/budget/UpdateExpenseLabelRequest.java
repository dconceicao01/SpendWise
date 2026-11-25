package pt.spendwise.api.budget;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record UpdateExpenseLabelRequest(@NotNull @JsonProperty("label_id") UUID labelId) {}
