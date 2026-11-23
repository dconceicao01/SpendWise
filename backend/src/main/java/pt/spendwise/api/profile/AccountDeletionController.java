package pt.spendwise.api.profile;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
public class AccountDeletionController {

    private final AccountDeletionService deletionService;

    public AccountDeletionController(AccountDeletionService deletionService) {
        this.deletionService = deletionService;
    }

    @PostMapping("/deletion")
    public ResponseEntity<Void> deleteCurrent(@Valid @RequestBody DeleteAccountRequest request) {
        deletionService.deleteCurrent(request);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
