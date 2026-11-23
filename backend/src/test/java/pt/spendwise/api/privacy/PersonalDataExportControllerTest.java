package pt.spendwise.api.privacy;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "SUPABASE_ISSUER_URI=http://127.0.0.1:54321/auth/v1",
        "SUPABASE_URL=http://127.0.0.1:54321",
        "SUPABASE_PUBLISHABLE_KEY=test-publishable-key"
})
@AutoConfigureMockMvc
class PersonalDataExportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private PersonalDataExportService exportService;

    @Test
    void exportRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/me/export"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void returnsPrivateExportWithoutCaching() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        when(exportService.exportForCurrentUser()).thenReturn(new PersonalDataExport(Instant.EPOCH, null, List.of()));

        mockMvc.perform(get("/api/v1/me/export").header(HttpHeaders.AUTHORIZATION, "Bearer valid-token"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json("{\"generated_at\":\"1970-01-01T00:00:00Z\",\"budgets\":[]}"))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        org.hamcrest.Matchers.containsString("spendwise-data-export.json")))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
    }

    private Jwt validJwt() {
        Instant issuedAt = Instant.parse("2026-11-23T09:00:00Z");
        return new Jwt("valid-token", issuedAt, issuedAt.plusSeconds(3600),
                Map.of("alg", "RS256"), Map.of(
                        "iss", "http://127.0.0.1:54321/auth/v1",
                        "sub", "184ae91b-0cf6-443f-aeb6-26b88f65cba0",
                        "aud", List.of("authenticated"),
                        "role", "authenticated"));
    }
}
