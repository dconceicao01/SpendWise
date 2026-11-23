package pt.spendwise.api.privacy;

import java.util.Optional;

public interface PrivacyExportRepository {

    Optional<ExportProfile> findCurrentUserProfile();
}
