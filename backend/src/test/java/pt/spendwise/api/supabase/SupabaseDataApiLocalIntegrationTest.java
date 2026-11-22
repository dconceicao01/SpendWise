package pt.spendwise.api.supabase;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfSystemProperty(
        named = "spendwise.local.supabase",
        matches = "true")
class SupabaseDataApiLocalIntegrationTest {

    private static final ParameterizedTypeReference<List<Map<String, Object>>> PROFILE_ROWS =
            new ParameterizedTypeReference<>() {
            };

    private final List<String> createdUserIds = new ArrayList<>();
    private String supabaseUrl;
    private String publishableKey;
    private String adminKey;
    private RestClient authClient;
    private SupabaseDataApiClient dataApiClient;

    @BeforeEach
    void setUp() {
        supabaseUrl = requiredEnvironmentVariable("SUPABASE_URL");
        validateLocalSupabaseUrl(supabaseUrl);
        publishableKey = requiredEnvironmentVariable("SUPABASE_PUBLISHABLE_KEY");
        adminKey = requiredEnvironmentVariable("SPENDWISE_LOCAL_SUPABASE_ADMIN_KEY");
        String authUrl = supabaseUrl.replaceAll("/+$", "") + "/auth/v1";
        authClient = RestClient.builder().baseUrl(authUrl).build();
        RestClient dataApiRestClient = new SupabaseDataApiConfiguration()
                .supabaseDataApiRestClient(RestClient.builder(), supabaseUrl);
        dataApiClient = new SupabaseDataApiClient(dataApiRestClient, publishableKey);
    }

    @AfterEach
    void cleanUpSyntheticUsers() {
        SecurityContextHolder.clearContext();
        RestClientException cleanupFailure = null;
        for (String userId : createdUserIds) {
            try {
                authClient.delete()
                        .uri("/admin/users/{userId}", userId)
                        .headers(headers -> {
                            headers.set("apikey", adminKey);
                            headers.setBearerAuth(adminKey);
                        })
                        .retrieve()
                        .toBodilessEntity();
            } catch (RestClientException exception) {
                if (cleanupFailure == null) {
                    cleanupFailure = exception;
                } else {
                    cleanupFailure.addSuppressed(exception);
                }
            }
        }
        if (cleanupFailure != null) {
            throw new IllegalStateException("Could not delete all synthetic local Supabase users", cleanupFailure);
        }
    }

    @Test
    void forwardsRealUserJwtAndRlsHidesAnotherUsersProfile() {
        String suffix = UUID.randomUUID().toString();
        LocalUser firstUser = createAndSignIn("first-" + suffix + "@example.invalid");
        LocalUser secondUser = createAndSignIn("second-" + suffix + "@example.invalid");

        withUser(firstUser, () -> dataApiClient.request(
                HttpMethod.POST,
                "profiles",
                Map.of(),
                Map.of("user_id", firstUser.userId(), "full_name", "Synthetic first user"),
                new ParameterizedTypeReference<String>() {
                }));

        List<Map<String, Object>> firstUserRows = withUser(firstUser, () -> dataApiClient.request(
                HttpMethod.GET,
                "profiles",
                Map.of("select", "user_id,full_name", "user_id", "eq." + firstUser.userId()),
                null,
                PROFILE_ROWS));
        assertThat(firstUserRows).hasSize(1);
        assertThat(firstUserRows.getFirst()).containsEntry("user_id", firstUser.userId());

        List<Map<String, Object>> secondUserRows = withUser(secondUser, () -> dataApiClient.request(
                HttpMethod.GET,
                "profiles",
                Map.of("select", "user_id,full_name", "user_id", "eq." + firstUser.userId()),
                null,
                PROFILE_ROWS));
        assertThat(secondUserRows).isEmpty();
    }

    private LocalUser createAndSignIn(String email) {
        String password = "MVP11-" + UUID.randomUUID() + "aA1!";
        AdminUserResponse createdUser = authClient.post()
                .uri("/admin/users")
                .headers(headers -> {
                    headers.set("apikey", adminKey);
                    headers.setBearerAuth(adminKey);
                })
                .body(Map.of(
                        "email", email,
                        "password", password,
                        "email_confirm", true,
                        "user_metadata", Map.of("full_name", "Synthetic test user")))
                .retrieve()
                .body(AdminUserResponse.class);
        if (createdUser == null || createdUser.id() == null) {
            throw new IllegalStateException("Local Supabase did not return a synthetic user id");
        }
        createdUserIds.add(createdUser.id());

        LoginResponse login = authClient.post()
                .uri("/token?grant_type=password")
                .header("apikey", publishableKey)
                .body(Map.of("email", email, "password", password))
                .retrieve()
                .body(LoginResponse.class);
        if (login == null || login.accessToken() == null || login.user() == null) {
            throw new IllegalStateException("Local Supabase did not return a synthetic user session");
        }
        return new LocalUser(login.user().id(), login.accessToken());
    }

    private <T> T withUser(LocalUser user, java.util.function.Supplier<T> operation) {
        Jwt jwt = Jwt.withTokenValue(user.accessToken())
                .header("alg", "local-test")
                .subject(user.userId())
                .build();
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt);
        authentication.setAuthenticated(true);
        SecurityContextHolder.getContext().setAuthentication(authentication);
        try {
            return operation.get();
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private String requiredEnvironmentVariable(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Missing environment variable " + name);
        }
        return value;
    }

    private void validateLocalSupabaseUrl(String url) {
        URI uri = URI.create(url);
        String host = uri.getHost();
        boolean loopbackHost = "localhost".equalsIgnoreCase(host)
                || "127.0.0.1".equals(host)
                || "::1".equals(host)
                || "[::1]".equals(host);
        if (!loopbackHost || !"http".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("This integration test only permits local HTTP Supabase URLs");
        }
    }

    private record AdminUserResponse(String id) {
    }

    private record AuthUser(String id) {
    }

    private record LoginResponse(
            @JsonProperty("access_token") String accessToken,
            AuthUser user) {
    }

    private record LocalUser(String userId, String accessToken) {
    }
}
