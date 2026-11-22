package pt.spendwise.api.budget;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

final class BudgetDomainErrors {

    private BudgetDomainErrors() {
    }

    static RuntimeException translate(RestClientResponseException exception, String conflictMessage) {
        String response = exception.getResponseBodyAsString();
        int status = exception.getStatusCode().value();
        if (status == 401 || status == 403 || response.contains("42501")) {
            return new AccessDeniedException("Budget access denied");
        }
        if (status == 409 || response.contains("23505") || response.contains("23514")) {
            return new ResponseStatusException(HttpStatus.CONFLICT, conflictMessage);
        }
        if (response.contains("22023")) {
            return new ResponseStatusException(HttpStatus.BAD_REQUEST, "The budget configuration is invalid");
        }
        return exception;
    }
}
