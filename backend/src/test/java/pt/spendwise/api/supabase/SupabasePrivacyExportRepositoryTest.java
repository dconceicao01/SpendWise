package pt.spendwise.api.supabase;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabasePrivacyExportRepositoryTest {

    private static final String USER_ID = "462e86cb-e4f1-474f-9b4b-5290e7b84c8b";
    private static final String ACCESS_TOKEN = "synthetic-current-user-jwt";

    private MockRestServiceServer mockServer;
    private SupabasePrivacyExportRepository repository;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://spendwise-test.supabase.co/rest/v1");
        mockServer = MockRestServiceServer.bindTo(builder).build();
        repository = new SupabasePrivacyExportRepository(
                new SupabaseDataApiClient(builder.build(), "sb_publishable_synthetic"));
        Jwt jwt = Jwt.withTokenValue(ACCESS_TOKEN).header("alg", "RS256").subject(USER_ID)
                .claim("email", "duarte@example.test").build();
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
    void profileExportIsFilteredToTheAuthenticatedUserAndUsesTheirJwt() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/profiles?select=user_id,full_name,phone_e164,default_currency,created_at,updated_at&user_id=eq." + USER_ID))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andRespond(withSuccess("[{\"user_id\":\"" + USER_ID
                        + "\",\"full_name\":\"Duarte\",\"default_currency\":\"EUR\"}]", MediaType.APPLICATION_JSON));

        assertThat(repository.findCurrentUserProfile())
                .hasValueSatisfying(profile -> {
                    assertThat(profile.userId()).isEqualTo(UUID.fromString(USER_ID));
                    assertThat(profile.email()).isEqualTo("duarte@example.test");
                    assertThat(profile.fullName()).isEqualTo("Duarte");
                    assertThat(profile.defaultCurrency()).isEqualTo("EUR");
                });
        mockServer.verify();
    }
}
