package pt.spendwise.api.budget;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import pt.spendwise.api.authorization.BudgetAction;
import pt.spendwise.api.authorization.BudgetAuthorizationService;
import pt.spendwise.api.authorization.BudgetRole;

@Service
public class BudgetInvitationService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final String INVALID_INVITATION = "Invitation is invalid or no longer available";

    private final BudgetInvitationRepository invitationRepository;
    private final BudgetMemberManagementRepository memberRepository;
    private final BudgetAuthorizationService authorizationService;
    private final String invitationBaseUrl;
    private final Duration invitationTtl;

    public BudgetInvitationService(
            BudgetInvitationRepository invitationRepository,
            BudgetMemberManagementRepository memberRepository,
            BudgetAuthorizationService authorizationService,
            @Value("${spendwise.invitation.base-url:http://localhost:8081/invitations/accept}") String invitationBaseUrl,
            @Value("${spendwise.invitation.ttl:PT168H}") Duration invitationTtl) {
        if (invitationTtl.isZero() || invitationTtl.isNegative() || invitationTtl.compareTo(Duration.ofDays(30)) > 0) {
            throw new IllegalArgumentException("Invitation lifetime must be positive and no longer than 30 days");
        }
        validateInvitationBaseUrl(invitationBaseUrl);
        this.invitationRepository = invitationRepository;
        this.memberRepository = memberRepository;
        this.authorizationService = authorizationService;
        this.invitationBaseUrl = invitationBaseUrl;
        this.invitationTtl = invitationTtl;
    }

    public List<BudgetInvitationResponse> list(UUID budgetId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        return invitationRepository.findForBudget(budgetId);
    }

    public BudgetInvitationResponse create(UUID budgetId, CreateBudgetInvitationRequest request) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        UUID creatorMemberId = memberRepository.findForBudget(budgetId).stream()
                .filter(member -> member.role() == BudgetRole.OWNER)
                .map(BudgetMemberResponse::id)
                .findFirst()
                .orElseThrow(() -> new AccessDeniedException("Budget access denied"));

        byte[] secret = new byte[32];
        SECURE_RANDOM.nextBytes(secret);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
        String tokenHash = sha256Hex(token);
        try {
            BudgetInvitationResponse stored = invitationRepository.create(
                    budgetId,
                    creatorMemberId,
                    request.email().strip().toLowerCase(Locale.ROOT),
                    request.role(),
                    tokenHash,
                    Instant.now().plus(invitationTtl));
            String separator = invitationBaseUrl.contains("#") ? "&" : "#";
            return new BudgetInvitationResponse(
                    stored.id(), stored.budgetId(), stored.email(), stored.role(), stored.expiresAt(),
                    stored.acceptedAt(), stored.revokedAt(), stored.createdAt(),
                    invitationBaseUrl + separator + "token=" + token);
        } catch (RestClientResponseException exception) {
            if (exception.getResponseBodyAsString().contains("invite_rate_limited")) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Invitation creation limit reached");
            }
            throw BudgetDomainErrors.translate(exception, "Invitation could not be created");
        }
    }

    public BudgetInvitationResponse revoke(UUID budgetId, UUID invitationId) {
        authorizationService.requireAllowed(budgetId, BudgetAction.MANAGE);
        return invitationRepository.revoke(budgetId, invitationId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invitation not found"));
    }

    public BudgetInvitationAcceptanceResponse accept(String token) {
        if (token == null || token.length() != 43 || !token.matches("[A-Za-z0-9_-]{43}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_INVITATION);
        }
        BudgetInvitationAcceptanceResponse result = invitationRepository.accept(sha256Hex(token));
        if (result.rateLimited()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many invitation attempts");
        }
        if (!result.accepted()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_INVITATION);
        }
        return result;
    }

    private String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private void validateInvitationBaseUrl(String value) {
        URI uri;
        try {
            uri = URI.create(value);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Invitation base URL is invalid", exception);
        }
        boolean secureRemoteUrl = "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null;
        boolean localDevelopmentUrl = "http".equalsIgnoreCase(uri.getScheme())
                && ("localhost".equalsIgnoreCase(uri.getHost()) || "127.0.0.1".equals(uri.getHost()));
        if ((!secureRemoteUrl && !localDevelopmentUrl)
                || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null) {
            throw new IllegalArgumentException("Invitation base URL must use HTTPS outside localhost and cannot include credentials, query, or fragment");
        }
    }
}
