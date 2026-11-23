package pt.spendwise.api;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "SUPABASE_ISSUER_URI=http://127.0.0.1:54321/auth/v1",
        "SUPABASE_URL=http://127.0.0.1:54321",
        "SUPABASE_PUBLISHABLE_KEY=test-publishable-key"
})
@AutoConfigureMockMvc
class SecurityConfigurationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void allowsHealthChecksWithoutAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk());
    }

    @Test
    void allowsCorsPreflightOnlyFromConfiguredLocalOrigins() throws Exception {
        mockMvc.perform(options("/api/v1/budgets")
                        .header(HttpHeaders.ORIGIN, "http://localhost:8081")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:8081"))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS));
    }

    @Test
    void rejectsCorsPreflightFromUnconfiguredOrigin() throws Exception {
        mockMvc.perform(options("/api/v1/budgets")
                        .header(HttpHeaders.ORIGIN, "https://untrusted.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isForbidden());
    }

    @Test
    void rejectsRequestsWithoutBearerToken() throws Exception {
        mockMvc.perform(get("/api/v1/protected-resource"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsInvalidBearerTokenWithoutLeakingDecoderDetails() throws Exception {
        when(jwtDecoder.decode("invalid-token"))
                .thenThrow(new BadJwtException("sensitive decoder diagnostic"));

        mockMvc.perform(get("/api/v1/protected-resource")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer invalid-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(result -> org.assertj.core.api.Assertions.assertThat(
                        result.getResponse().getContentAsString())
                        .doesNotContain("sensitive decoder diagnostic"));
    }

    @Test
    void letsAValidDecodedJwtReachTheRequestHandler() throws Exception {
        Instant now = Instant.now();
        Jwt jwt = new Jwt("valid-token", now.minusSeconds(5), now.plusSeconds(60),
                Map.of("alg", "RS256"), Map.of("sub", "test-user"));
        when(jwtDecoder.decode("valid-token")).thenReturn(jwt);

        mockMvc.perform(get("/api/v1/protected-resource")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token"))
                .andExpect(status().isNotFound());
    }
}
