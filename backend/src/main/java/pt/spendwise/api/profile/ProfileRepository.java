package pt.spendwise.api.profile;

import java.util.Optional;

public interface ProfileRepository {

    ProfileResponse findCurrent();

    Optional<ProfileResponse> updateCurrent(UpdateProfileRequest request);
}
