package pt.spendwise.api.profile;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "SUPABASE_ISSUER_URI=http://127.0.0.1:54321/auth/v1",
        "SUPABASE_URL=http://127.0.0.1:54321",
        "SUPABASE_PUBLISHABLE_KEY=test-publishable-key"
})
@AutoConfigureMockMvc
class ProfileControllerTest {

    private static final UUID USER_ID = UUID.fromString("184ae91b-0cf6-443f-aeb6-26b88f65cba0");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private ProfileService profileService;

    @MockitoBean
    private AccountDeletionService accountDeletionService;

    @MockitoBean
    private AccountDeletionOptionsService accountDeletionOptionsService;

    @Test
    void profileRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/me/profile"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void returnsPrivateProfileWithoutCaching() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        when(profileService.getCurrent()).thenReturn(profile());

        mockMvc.perform(get("/api/v1/me/profile").header(HttpHeaders.AUTHORIZATION, "Bearer valid-token"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(content().json("{\"user_id\":\"" + USER_ID
                        + "\",\"email\":\"duarte@example.test\",\"full_name\":\"Duarte\",\"default_currency\":\"EUR\"}"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
    }

    @Test
    void updatesOnlyValidatedProfileFields() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        when(profileService.updateCurrent(new UpdateProfileRequest("Duarte Silva", null, "EUR")))
                .thenReturn(profile());

        mockMvc.perform(put("/api/v1/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"Duarte Silva\",\"phoneE164\":\"\",\"defaultCurrency\":\"EUR\"}"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));

        verify(profileService).updateCurrent(new UpdateProfileRequest("Duarte Silva", "", "EUR"));
    }

    @Test
    void rejectsInvalidProfileFields() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());

        mockMvc.perform(put("/api/v1/me/profile")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"\",\"phoneE164\":\"not-a-phone\",\"defaultCurrency\":\"EURO\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deletionRequiresAuthenticationAndReturnsNoStoreAfterServiceCompletes() throws Exception {
        mockMvc.perform(post("/api/v1/me/deletion")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerTransfers\":[]}"))
                .andExpect(status().isUnauthorized());

        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        mockMvc.perform(post("/api/v1/me/deletion")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerTransfers\":[]}"))
                .andExpect(status().isNoContent())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));

        verify(accountDeletionService).deleteCurrent(new DeleteAccountRequest(List.of()));
    }

    @Test
    void deletionOptionsRequireAuthenticationAndAreNotCached() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        when(accountDeletionOptionsService.forCurrentUser()).thenReturn(List.of());

        mockMvc.perform(get("/api/v1/me/deletion-options"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/me/deletion-options")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token"))
                .andExpect(status().isOk())
                .andExpect(content().json("[]"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));

        verify(accountDeletionOptionsService).forCurrentUser();
    }

    private ProfileResponse profile() {
        return new ProfileResponse(USER_ID, "duarte@example.test", "Duarte", null, "EUR",
                Instant.parse("2026-11-23T09:00:00Z"), Instant.parse("2026-11-23T09:00:00Z"));
    }

    private Jwt validJwt() {
        Instant issuedAt = Instant.parse("2026-11-23T09:00:00Z");
        return new Jwt("valid-token", issuedAt, issuedAt.plusSeconds(3600),
                Map.of("alg", "RS256"), Map.of(
                        "iss", "http://127.0.0.1:54321/auth/v1",
                        "sub", USER_ID.toString(),
                        "aud", List.of("authenticated"),
                        "role", "authenticated"));
    }
}
