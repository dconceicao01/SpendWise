package pt.spendwise.api.profile;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountDeletionService {

    private final AccountDeletionRepository repository;

    public AccountDeletionService(AccountDeletionRepository repository) {
        this.repository = repository;
    }

    public void deleteCurrent(DeleteAccountRequest request) {
        try {
            repository.removeAccountData(request);
            repository.deleteAuthIdentity();
        } catch (RestClientResponseException exception) {
            String body = exception.getResponseBodyAsString();
            if (exception.getStatusCode().value() == 401 || exception.getStatusCode().value() == 403
                    || body.contains("42501")) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Account deletion is not authorized");
            }
            if (exception.getStatusCode().value() == 400 || body.contains("22023")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Owner transfers are invalid");
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Account deletion is pending; retry the request to finish it");
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Account deletion is not configured");
        } catch (RestClientException exception) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Account deletion is pending; retry the request to finish it");
        }
    }
}
