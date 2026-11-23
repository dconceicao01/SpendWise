package pt.spendwise.api.profile;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.UUID;

public record ProfileResponse(
        @JsonProperty("user_id") UUID userId,
        String email,
        @JsonProperty("full_name") String fullName,
        @JsonProperty("phone_e164") String phoneE164,
        @JsonProperty("default_currency") String defaultCurrency,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("updated_at") Instant updatedAt) {
}
