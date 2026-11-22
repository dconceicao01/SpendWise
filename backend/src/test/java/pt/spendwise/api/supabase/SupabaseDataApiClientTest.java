package pt.spendwise.api.supabase;

import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class SupabaseDataApiClientTest {

    private static final String ACCESS_TOKEN = "synthetic-user-access-token";
    private static final String PUBLISHABLE_KEY = "sb_publishable_synthetic";
    private MockRestServiceServer mockServer;
    private SupabaseDataApiClient supabaseDataApiClient;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://spendwise-test.supabase.co/rest/v1");
        mockServer = MockRestServiceServer.bindTo(builder).build();
        supabaseDataApiClient = new SupabaseDataApiClient(builder.build(), PUBLISHABLE_KEY);
        Jwt jwt = Jwt.withTokenValue(ACCESS_TOKEN)
                .header("alg", "RS256")
                .subject("synthetic-user-id")
                .build();
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
    void forwardsTheOriginalUserTokenAndPublishableKey() {
        mockServer.expect(requestTo("https://spendwise-test.supabase.co/rest/v1/profiles"))
                .andExpect(method(HttpMethod.GET))
                .andExpect(header("Authorization", "Bearer " + ACCESS_TOKEN))
                .andExpect(header("apikey", PUBLISHABLE_KEY))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

        String response = supabaseDataApiClient.request(
                HttpMethod.GET,
                "profiles",
                Map.of(),
                null,
                new ParameterizedTypeReference<>() {
                });

        mockServer.verify();
        org.assertj.core.api.Assertions.assertThat(response).isEqualTo("[]");
    }

    @Test
    void refusesAccessWhenThereIsNoAuthenticatedUserJwt() {
        org.springframework.security.core.context.SecurityContextHolder.clearContext();

        assertThatThrownBy(() -> supabaseDataApiClient.request(
                HttpMethod.GET,
                "profiles",
                Map.of(),
                null,
                new ParameterizedTypeReference<>() {
                }))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("An authenticated user JWT is required for Supabase Data API access");

        mockServer.verify();
    }

    @Test
    void rejectsInvalidRelationNamesBeforeSendingARequest() {
        assertThatThrownBy(() -> supabaseDataApiClient.request(
                HttpMethod.GET,
                "profiles;delete from budgets",
                Map.of(),
                null,
                new ParameterizedTypeReference<>() {
                }))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Invalid Supabase relation name");

        mockServer.verify();
    }
}
