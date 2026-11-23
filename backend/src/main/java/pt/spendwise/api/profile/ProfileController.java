package pt.spendwise.api.profile;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/me/profile")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    @GetMapping
    public ResponseEntity<ProfileResponse> getCurrent() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(profileService.getCurrent());
    }

    @PutMapping
    public ResponseEntity<ProfileResponse> updateCurrent(@Valid @RequestBody UpdateProfileRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(profileService.updateCurrent(request));
    }
}
