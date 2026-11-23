package pt.spendwise.api.supabase;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Repository;
import org.springframework.web.client.RestClientResponseException;
import pt.spendwise.api.profile.ProfileRepository;
import pt.spendwise.api.profile.ProfileResponse;
import pt.spendwise.api.profile.UpdateProfileRequest;

@Repository
public class SupabaseProfileRepository implements ProfileRepository {

    private static final String SELECT_PROFILE =
            "user_id,full_name,phone_e164,default_currency,created_at,updated_at";
    private static final ParameterizedTypeReference<List<ProfileRow>> PROFILE_ROWS =
            new ParameterizedTypeReference<>() {};

    private final SupabaseDataApiClient dataApiClient;

    public SupabaseProfileRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public ProfileResponse findCurrent() {
        JwtAuthenticationToken authentication = currentJwt();
        Map<String, String> query = profileQuery(authentication.getToken().getSubject());
        List<ProfileRow> rows = dataApiClient.request(HttpMethod.GET, "profiles", query, null, PROFILE_ROWS);
        if (rows != null && !rows.isEmpty()) {
            return rows.getFirst().toResponse(authentication.getToken().getClaimAsString("email"));
        }

        return new ProfileResponse(
                UUID.fromString(authentication.getToken().getSubject()),
                authentication.getToken().getClaimAsString("email"),
                fullNameFromMetadata(authentication),
                null,
                "EUR",
                null,
                null);
    }

    @Override
    public Optional<ProfileResponse> updateCurrent(UpdateProfileRequest profile) {
        JwtAuthenticationToken authentication = currentJwt();
        String userId = authentication.getToken().getSubject();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("full_name", profile.fullName());
        body.put("phone_e164", profile.phoneE164());
        body.put("default_currency", profile.defaultCurrency());
        body.put("updated_at", Instant.now().toString());

        Optional<ProfileRow> updated = patch(userId, body);
        if (updated.isEmpty()) {
            Map<String, Object> insertBody = new LinkedHashMap<>(body);
            insertBody.put("user_id", userId);
            try {
                List<ProfileRow> inserted = dataApiClient.requestReturningRepresentation(
                        HttpMethod.POST, "profiles", Map.of("select", SELECT_PROFILE), insertBody, PROFILE_ROWS);
                updated = first(inserted);
            } catch (RestClientResponseException exception) {
                if (!isDuplicateKey(exception)) {
                    throw exception;
                }
                updated = patch(userId, body);
            }
        }
        return updated.map(row -> row.toResponse(authentication.getToken().getClaimAsString("email")));
    }

    private Optional<ProfileRow> patch(String userId, Map<String, Object> body) {
        Map<String, String> query = profileQuery(userId);
        List<ProfileRow> updated = dataApiClient.requestReturningRepresentation(
                HttpMethod.PATCH, "profiles", query, body, PROFILE_ROWS);
        return first(updated);
    }

    private Map<String, String> profileQuery(String userId) {
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", SELECT_PROFILE);
        query.put("user_id", "eq." + userId);
        return query;
    }

    private Optional<ProfileRow> first(List<ProfileRow> rows) {
        return rows == null ? Optional.empty() : rows.stream().findFirst();
    }

    private boolean isDuplicateKey(RestClientResponseException exception) {
        return exception.getStatusCode().value() == 409
                || exception.getResponseBodyAsString().contains("23505");
    }

    private JwtAuthenticationToken currentJwt() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuthenticationToken)
                || !authentication.isAuthenticated()) {
            throw new IllegalStateException("An authenticated user JWT is required for profile access");
        }
        return jwtAuthenticationToken;
    }

    private String fullNameFromMetadata(JwtAuthenticationToken authentication) {
        Map<String, Object> metadata = authentication.getToken().getClaimAsMap("user_metadata");
        if (metadata == null) {
            return "";
        }
        Object fullName = metadata.get("full_name");
        return fullName instanceof String name ? name.strip() : "";
    }

    private record ProfileRow(
            @JsonProperty("user_id") UUID userId,
            @JsonProperty("full_name") String fullName,
            @JsonProperty("phone_e164") String phoneE164,
            @JsonProperty("default_currency") String defaultCurrency,
            @JsonProperty("created_at") Instant createdAt,
            @JsonProperty("updated_at") Instant updatedAt) {

        private ProfileResponse toResponse(String email) {
            return new ProfileResponse(userId, email, fullName, phoneE164, defaultCurrency, createdAt, updatedAt);
        }
    }
}
