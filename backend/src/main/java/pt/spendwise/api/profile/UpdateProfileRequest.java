package pt.spendwise.api.profile;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateProfileRequest(
        @NotBlank @Size(max = 120) String fullName,
        @Pattern(regexp = "^$|^\\+[1-9][0-9]{7,14}$") String phoneE164,
        @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String defaultCurrency) {
}
