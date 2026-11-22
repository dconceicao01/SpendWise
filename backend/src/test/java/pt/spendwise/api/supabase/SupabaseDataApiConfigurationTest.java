package pt.spendwise.api.supabase;

import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SupabaseDataApiConfigurationTest {

    private final SupabaseDataApiConfiguration configuration = new SupabaseDataApiConfiguration();

    @Test
    void permitsHttpOnlyForLoopbackDevelopment() {
        assertThatCode(() -> configuration.supabaseDataApiRestClient(
                RestClient.builder(), "http://127.0.0.1:54321"))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsRemoteHttpDataApiUrls() {
        assertThatThrownBy(() -> configuration.supabaseDataApiRestClient(
                RestClient.builder(), "http://supabase.example.test"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Supabase URL must use HTTPS outside local development");
    }

    @Test
    void rejectsUrlsWithQueryOrFragment() {
        assertThatThrownBy(() -> configuration.supabaseDataApiRestClient(
                RestClient.builder(), "https://supabase.example.test?tenant=other"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Supabase URL must be an absolute URL without query or fragment");
    }
}
