package pt.spendwise.api.budget;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;
import pt.spendwise.api.authorization.BudgetRole;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BudgetInvitationServiceTest {

    private static final UUID BUDGET_ID = UUID.fromString("ed7a90f2-f8f1-4f72-b5e5-1e4a09c20f66");
    private static final UUID MEMBER_ID = UUID.fromString("b68b3f39-09d0-4458-9c78-06afcf65ed2f");
    private static final UUID INVITATION_ID = UUID.fromString("f6e16e50-c92e-4c53-a50b-3f17f1566eb8");

    private BudgetInvitationRepository repository;
    private BudgetMemberManagementRepository memberRepository;
    private BudgetAuthorizationService authorization;
    private BudgetInvitationService service;

    @BeforeEach
    void setUp() {
        repository = mock(BudgetInvitationRepository.class);
        memberRepository = mock(BudgetMemberManagementRepository.class);
        authorization = mock(BudgetAuthorizationService.class);
        service = new BudgetInvitationService(
                repository, memberRepository, authorization, "https://spendwise.example/invite", Duration.ofDays(7));
    }

    @Test
    void createsHashedSingleUseLinkForOwnerAndReturnsRawLinkOnlyOnce() throws Exception {
        when(memberRepository.findForBudget(BUDGET_ID)).thenReturn(List.of(member(BudgetRole.OWNER)));
        when(repository.create(eq(BUDGET_ID), eq(MEMBER_ID), eq("person@example.com"), eq(BudgetInvitationRole.VIEWER),
                anyString(), any(Instant.class)))
                .thenAnswer(invocation -> stored(invocation.getArgument(4), invocation.getArgument(5)));

        BudgetInvitationResponse response = service.create(
                BUDGET_ID, new CreateBudgetInvitationRequest(" Person@Example.com ", BudgetInvitationRole.VIEWER));

        assertThat(response.invitationLink()).startsWith("https://spendwise.example/invite#token=");
        assertThat(response.invitationLink()).doesNotContain("?");
        assertThat(response.expiresAt()).isAfter(Instant.now().plusSeconds(6 * 24 * 60 * 60));
        String token = response.invitationLink().substring(response.invitationLink().indexOf("token=") + 6);
        assertThat(token).hasSize(43).matches("[A-Za-z0-9_-]{43}");
        String expectedHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(token.getBytes(StandardCharsets.UTF_8)));
        verify(repository).create(eq(BUDGET_ID), eq(MEMBER_ID), eq("person@example.com"), eq(BudgetInvitationRole.VIEWER),
                eq(expectedHash), any(Instant.class));
        verify(authorization).requireAllowed(BUDGET_ID, BudgetAction.MANAGE);
    }

    @Test
    void acceptsOnlyValidTokenAndUsesGenericFailureForRejectedInvitations() {
        assertThatThrownBy(() -> service.accept("invalid"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invitation is invalid or no longer available");
        verify(repository, never()).accept(anyString());

        when(repository.accept(anyString())).thenReturn(new BudgetInvitationAcceptanceResponse(false, null, null, false));
        assertThatThrownBy(() -> service.accept("a".repeat(43)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Invitation is invalid or no longer available");
    }

    @Test
    void acceptsAWellFormedTokenAndReturnsTheJoinedBudget() {
        UUID joinedBudgetId = UUID.fromString("d34c0e60-a84b-468b-9bfb-17fa9d2b20a1");
        when(repository.accept(anyString())).thenReturn(
                new BudgetInvitationAcceptanceResponse(true, joinedBudgetId, BudgetInvitationRole.CONTRIBUTOR, false));

        BudgetInvitationAcceptanceResponse result = service.accept("a".repeat(43));

        assertThat(result.accepted()).isTrue();
        assertThat(result.budgetId()).isEqualTo(joinedBudgetId);
        assertThat(result.role()).isEqualTo(BudgetInvitationRole.CONTRIBUTOR);
    }

    @Test
    void mapsApprovedRateLimitToTooManyRequests() {
        when(repository.accept(anyString())).thenReturn(new BudgetInvitationAcceptanceResponse(false, null, null, true));

        assertThatThrownBy(() -> service.accept("a".repeat(43)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("429 TOO_MANY_REQUESTS");
    }

    @Test
    void requiresSecureRemoteInvitationLinksAndPositiveLifetime() {
        assertThatThrownBy(() -> new BudgetInvitationService(
                        repository, memberRepository, authorization,
                        "http://spendwise.example/invite", Duration.ofDays(7)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("HTTPS");
        assertThatThrownBy(() -> new BudgetInvitationService(
                        repository, memberRepository, authorization,
                        "https://spendwise.example/invite", Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("positive");
        assertThatThrownBy(() -> new BudgetInvitationService(
                        repository, memberRepository, authorization,
                        "https://spendwise.example/invite", Duration.ofDays(31)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("30 days");
    }

    @Test
    void revokesOnlyAfterOwnerAuthorization() {
        BudgetInvitationResponse revoked = new BudgetInvitationResponse(
                INVITATION_ID, BUDGET_ID, "person@example.com", BudgetInvitationRole.CONTRIBUTOR,
                Instant.parse("2026-11-29T12:00:00Z"), null, Instant.parse("2026-11-22T12:00:00Z"),
                Instant.parse("2026-11-22T11:00:00Z"), null);
        when(repository.revoke(BUDGET_ID, INVITATION_ID)).thenReturn(Optional.of(revoked));

        assertThat(service.revoke(BUDGET_ID, INVITATION_ID)).isEqualTo(revoked);
        verify(authorization).requireAllowed(BUDGET_ID, BudgetAction.MANAGE);
    }

    private BudgetMemberResponse member(BudgetRole role) {
        return new BudgetMemberResponse(MEMBER_ID, role, Instant.parse("2026-11-22T11:00:00Z"), null, "Duarte");
    }

    private BudgetInvitationResponse stored(String ignoredHash, Instant expiresAt) {
        return new BudgetInvitationResponse(
                INVITATION_ID, BUDGET_ID, "person@example.com", BudgetInvitationRole.VIEWER,
                expiresAt, null, null, Instant.now(), null);
    }
}
