package pt.spendwise.api.budget;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
import pt.spendwise.api.authorization.BudgetRole;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "SUPABASE_ISSUER_URI=http://127.0.0.1:54321/auth/v1",
        "SUPABASE_URL=http://127.0.0.1:54321",
        "SUPABASE_PUBLISHABLE_KEY=test-publishable-key"
})
@AutoConfigureMockMvc
class BudgetMemberControllerTest {

    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID MEMBER_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private BudgetMemberService memberService;

    @Test
    void listsMemberNamesAndRolesToAnAuthenticatedMember() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        when(memberService.list(BUDGET_ID)).thenReturn(List.of(member("Ada", BudgetRole.CONTRIBUTOR, null)));

        mockMvc.perform(get("/api/v1/budgets/" + BUDGET_ID + "/members")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].display_name").value("Ada"))
                .andExpect(jsonPath("$[0].role").value("CONTRIBUTOR"))
                .andExpect(jsonPath("$[0].member_id").value(MEMBER_ID.toString()))
                .andExpect(jsonPath("$[0].user_id").doesNotExist());

        verify(memberService).list(BUDGET_ID);
    }

    @Test
    void ownerCanChangeAnActiveMemberRole() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        when(memberService.changeRole(
                BUDGET_ID, MEMBER_ID, new ChangeBudgetMemberRoleRequest(BudgetMemberRole.VIEWER)))
                .thenReturn(member("Ada", BudgetRole.VIEWER, null));

        mockMvc.perform(patch("/api/v1/budgets/" + BUDGET_ID + "/members/" + MEMBER_ID + "/role")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"VIEWER\"}"))
                .andExpect(status().isOk());

        verify(memberService).changeRole(
                BUDGET_ID, MEMBER_ID, new ChangeBudgetMemberRoleRequest(BudgetMemberRole.VIEWER));
    }

    @Test
    void rejectsChangingMembershipDirectlyToOwner() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());

        mockMvc.perform(patch("/api/v1/budgets/" + BUDGET_ID + "/members/" + MEMBER_ID + "/role")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"OWNER\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void ownerCanRemoveAnActiveMemberWithoutDeletingHistory() throws Exception {
        when(jwtDecoder.decode("valid-token")).thenReturn(validJwt());
        when(memberService.remove(BUDGET_ID, MEMBER_ID))
                .thenReturn(member("Ada", BudgetRole.CONTRIBUTOR, Instant.parse("2026-11-22T17:00:00Z")));

        mockMvc.perform(post("/api/v1/budgets/" + BUDGET_ID + "/members/" + MEMBER_ID + "/remove")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer valid-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removed_at").exists());

        verify(memberService).remove(BUDGET_ID, MEMBER_ID);
    }

    private BudgetMemberResponse member(String name, BudgetRole role, Instant removedAt) {
        return new BudgetMemberResponse(MEMBER_ID, role, Instant.parse("2026-11-22T16:00:00Z"), removedAt, name);
    }

    private Jwt validJwt() {
        Instant now = Instant.now();
        return new Jwt("valid-token", now.minusSeconds(5), now.plusSeconds(60),
                Map.of("alg", "RS256"),
                Map.of("sub", "462e86cb-e4f1-474f-9b4b-5290e7b84c8b",
                        "iss", "http://127.0.0.1:54321/auth/v1",
                        "aud", List.of("authenticated")));
    }
}
