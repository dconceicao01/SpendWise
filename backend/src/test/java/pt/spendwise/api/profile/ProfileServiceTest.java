package pt.spendwise.api.profile;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProfileServiceTest {

    private static final UUID USER_ID = UUID.fromString("462e86cb-e4f1-474f-9b4b-5290e7b84c8b");

    private ProfileRepository repository;
    private ProfileService service;

    @BeforeEach
    void setUp() {
        repository = mock(ProfileRepository.class);
        service = new ProfileService(repository);
    }

    @Test
    void returnsCurrentProfile() {
        ProfileResponse profile = profile();
        when(repository.findCurrent()).thenReturn(profile);

        assertThat(service.getCurrent()).isEqualTo(profile);
    }

    @Test
    void trimsNameAndTreatsBlankOptionalPhoneAsNull() {
        UpdateProfileRequest request = new UpdateProfileRequest(" Duarte ", "  ", "EUR");
        ProfileResponse profile = profile();
        when(repository.updateCurrent(new UpdateProfileRequest("Duarte", null, "EUR")))
                .thenReturn(Optional.of(profile));

        assertThat(service.updateCurrent(request)).isEqualTo(profile);
        verify(repository).updateCurrent(new UpdateProfileRequest("Duarte", null, "EUR"));
    }

    @Test
    void mapsProfileConstraintFailuresToBadRequest() {
        when(repository.updateCurrent(new UpdateProfileRequest("Duarte", null, "EUR")))
                .thenThrow(new org.springframework.web.client.HttpClientErrorException(
                        org.springframework.http.HttpStatus.BAD_REQUEST, "bad request", null,
                        "23514 check constraint".getBytes(), null));

        assertThatThrownBy(() -> service.updateCurrent(new UpdateProfileRequest("Duarte", null, "EUR")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Profile details are invalid");
    }

    private ProfileResponse profile() {
        return new ProfileResponse(USER_ID, "duarte@example.test", "Duarte", null, "EUR",
                Instant.parse("2026-11-23T09:00:00Z"), Instant.parse("2026-11-23T09:00:00Z"));
    }
}
