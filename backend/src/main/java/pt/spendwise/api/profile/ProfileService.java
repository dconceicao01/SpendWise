package pt.spendwise.api.profile;

import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.RestClientResponseException;

@Service
public class ProfileService {

    private final ProfileRepository profileRepository;

    public ProfileService(ProfileRepository profileRepository) {
        this.profileRepository = profileRepository;
    }

    public ProfileResponse getCurrent() {
        return profileRepository.findCurrent();
    }

    public ProfileResponse updateCurrent(UpdateProfileRequest request) {
        String normalizedPhone = request.phoneE164() == null || request.phoneE164().isBlank()
                ? null
                : request.phoneE164().strip();
        UpdateProfileRequest normalized = new UpdateProfileRequest(
                request.fullName().strip(), normalizedPhone, request.defaultCurrency());
        try {
            return profileRepository.updateCurrent(normalized)
                    .orElseThrow(() -> new IllegalStateException("Updated profile is not visible to its owner"));
        } catch (RestClientResponseException exception) {
            String response = exception.getResponseBodyAsString();
            if (exception.getStatusCode().value() == 401 || exception.getStatusCode().value() == 403
                    || response.contains("42501")) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Profile access denied");
            }
            if (response.contains("23514") || response.contains("22023")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Profile details are invalid");
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Profile could not be updated");
        }
    }
}
