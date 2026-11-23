package pt.spendwise.api.profile;

public interface AccountDeletionRepository {

    void removeAccountData(DeleteAccountRequest request);

    void deleteAuthIdentity();
}
