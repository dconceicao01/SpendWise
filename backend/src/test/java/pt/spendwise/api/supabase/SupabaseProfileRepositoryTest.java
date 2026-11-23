package pt.spendwise.api.supabase;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pt.spendwise.api.profile.UpdateProfileRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabaseProfileRepositoryTest {

    private static final String USER_ID = "462e86cb-e4f1-474f-9b4b-5290e7b84c8b";
    private static final String ACCESS_TOKEN = "synthetic-current-user-jwt";
    private MockRestServiceServer mockServer;
    private SupabaseProfileRepository repository;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://spendwise-test.supabase.co/rest/v1");
        mockServer = MockRestServiceServer.bindTo(builder).build();
        repository = new SupabaseProfileRepository(
                new SupabaseDataApiClient(builder.build(), "sb_publishable_synthetic"));
        Jwt jwt = Jwt.withTokenValue(ACCESS_TOKEN).header("alg", "RS256").subject(USER_ID)
                .claim("email", "duarte@example.test").claim("user_metadata", Map.of("full_name", "Duarte")).build();
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt);
        authentication.setAuthenticated(true);
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                .setAuthentication(authentication);
    }

    @AfterEach
    void clearSecurityContext() {
        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    void readsOnlyTheAuthenticatedProfilesRowAndUsesMetadataAsFallback() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/profiles?select=user_id,full_name,phone_e164,default_currency,created_at,updated_at&user_id=eq." + USER_ID))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

        var profile = repository.findCurrent();

        assertThat(profile.userId()).isEqualTo(UUID.fromString(USER_ID));
        assertThat(profile.email()).isEqualTo("duarte@example.test");
        assertThat(profile.fullName()).isEqualTo("Duarte");
        assertThat(profile.defaultCurrency()).isEqualTo("EUR");
        mockServer.verify();
    }

    @Test
    void updatesExistingProfileWithAuthenticatedJwt() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/profiles?select=user_id,full_name,phone_e164,default_currency,created_at,updated_at&user_id=eq." + USER_ID))
                .andExpect(method(HttpMethod.PATCH))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(jsonPath("$.full_name").value("Duarte Silva"))
                .andExpect(jsonPath("$.phone_e164").value("+351912345678"))
                .andExpect(jsonPath("$.default_currency").value("USD"))
                .andExpect(jsonPath("$.updated_at").exists())
                .andRespond(withSuccess("[{\"user_id\":\"" + USER_ID
                        + "\",\"full_name\":\"Duarte Silva\",\"phone_e164\":\"+351912345678\","
                        + "\"default_currency\":\"USD\",\"created_at\":\"2026-11-22T09:00:00Z\","
                        + "\"updated_at\":\"2026-11-23T09:00:00Z\"}]", MediaType.APPLICATION_JSON));

        var profile = repository.updateCurrent(new UpdateProfileRequest("Duarte Silva", "+351912345678", "USD"));

        assertThat(profile).hasValueSatisfying(value -> {
            assertThat(value.email()).isEqualTo("duarte@example.test");
            assertThat(value.defaultCurrency()).isEqualTo("USD");
        });
        mockServer.verify();
    }

    @Test
    void createsMissingProfileUsingCurrentJwtSubject() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/profiles?select=user_id,full_name,phone_e164,default_currency,created_at,updated_at&user_id=eq." + USER_ID))
                .andExpect(method(HttpMethod.PATCH))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/profiles?select=user_id,full_name,phone_e164,default_currency,created_at,updated_at"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(jsonPath("$.user_id").value(USER_ID))
                .andExpect(jsonPath("$.full_name").value("Duarte"))
                .andExpect(jsonPath("$.phone_e164").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.default_currency").value("EUR"))
                .andExpect(jsonPath("$.updated_at").exists())
                .andRespond(withSuccess("[{\"user_id\":\"" + USER_ID
                        + "\",\"full_name\":\"Duarte\",\"default_currency\":\"EUR\","
                        + "\"created_at\":\"2026-11-23T09:00:00Z\","
                        + "\"updated_at\":\"2026-11-23T09:00:00Z\"}]", MediaType.APPLICATION_JSON));

        assertThat(repository.updateCurrent(new UpdateProfileRequest("Duarte", null, "EUR"))).isPresent();
        mockServer.verify();
    }
}
