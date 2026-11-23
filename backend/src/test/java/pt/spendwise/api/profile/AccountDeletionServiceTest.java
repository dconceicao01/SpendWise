package pt.spendwise.api.profile;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class AccountDeletionServiceTest {

    private AccountDeletionRepository repository;
    private AccountDeletionService service;
    private DeleteAccountRequest request;

    @BeforeEach
    void setUp() {
        repository = mock(AccountDeletionRepository.class);
        service = new AccountDeletionService(repository);
        request = new DeleteAccountRequest(List.of(new DeleteAccountRequest.OwnerTransfer(
                UUID.randomUUID(), UUID.randomUUID())));
    }

    @Test
    void commitsDatabaseCleanupBeforeDeletingAuthIdentity() {
        service.deleteCurrent(request);

        var order = inOrder(repository);
        order.verify(repository).removeAccountData(request);
        order.verify(repository).deleteAuthIdentity();
    }

    @Test
    void doesNotDeleteAuthIdentityWhenDatabaseCleanupFails() {
        org.mockito.Mockito.doThrow(new HttpServerErrorException(HttpStatus.BAD_GATEWAY))
                .when(repository).removeAccountData(request);

        assertThatThrownBy(() -> service.deleteCurrent(request))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        verify(repository).removeAccountData(request);
        verify(repository, never()).deleteAuthIdentity();
    }

    @Test
    void reportsRetryableFailureWhenAuthAdminIsUnavailable() {
        org.mockito.Mockito.doThrow(new IllegalStateException("not configured"))
                .when(repository).deleteAuthIdentity();

        assertThatThrownBy(() -> service.deleteCurrent(request))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
        verify(repository).removeAccountData(request);
        verify(repository).deleteAuthIdentity();
    }
}
