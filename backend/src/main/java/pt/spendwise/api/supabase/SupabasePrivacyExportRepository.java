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
import pt.spendwise.api.privacy.ExportProfile;
import pt.spendwise.api.privacy.PrivacyExportRepository;

@Repository
public class SupabasePrivacyExportRepository implements PrivacyExportRepository {

    private static final ParameterizedTypeReference<List<ProfileRow>> PROFILE_ROWS =
            new ParameterizedTypeReference<>() {};

    private final SupabaseDataApiClient dataApiClient;

    public SupabasePrivacyExportRepository(SupabaseDataApiClient dataApiClient) {
        this.dataApiClient = dataApiClient;
    }

    @Override
    public Optional<ExportProfile> findCurrentUserProfile() {
        JwtAuthenticationToken authentication = currentJwt();
        Map<String, String> query = new LinkedHashMap<>();
        query.put("select", "user_id,full_name,phone_e164,default_currency,created_at,updated_at");
        query.put("user_id", "eq." + authentication.getToken().getSubject());
        List<ProfileRow> rows = dataApiClient.request(HttpMethod.GET, "profiles", query, null, PROFILE_ROWS);
        String email = authentication.getToken().getClaimAsString("email");
        if (rows == null || rows.isEmpty()) {
            return Optional.of(new ExportProfile(UUID.fromString(authentication.getToken().getSubject()), email,
                    null, null, null, null, null));
        }
        ProfileRow row = rows.getFirst();
        return Optional.of(new ExportProfile(
                row.userId(), email, row.fullName(), row.phoneE164(), row.defaultCurrency(), row.createdAt(),
                row.updatedAt()));
    }

    private JwtAuthenticationToken currentJwt() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuthenticationToken)
                || !authentication.isAuthenticated()) {
            throw new IllegalStateException("An authenticated user JWT is required for profile export");
        }
        return jwtAuthenticationToken;
    }

    private record ProfileRow(
            @JsonProperty("user_id") UUID userId,
            @JsonProperty("full_name") String fullName,
            @JsonProperty("phone_e164") String phoneE164,
            @JsonProperty("default_currency") String defaultCurrency,
            @JsonProperty("created_at") Instant createdAt,
            @JsonProperty("updated_at") Instant updatedAt) {
    }
}
