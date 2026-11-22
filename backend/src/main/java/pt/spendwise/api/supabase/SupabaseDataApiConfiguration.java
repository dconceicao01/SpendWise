package pt.spendwise.api.supabase;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class SupabaseDataApiConfiguration {

    @Bean
    RestClient supabaseDataApiRestClient(
            RestClient.Builder builder,
            @Value("${SUPABASE_URL}") String supabaseUrl) {
        URI baseUri = URI.create(supabaseUrl);
        if (baseUri.getHost() == null || baseUri.getRawQuery() != null || baseUri.getRawFragment() != null) {
            throw new IllegalArgumentException("Supabase URL must be an absolute URL without query or fragment");
        }
        if (!"https".equalsIgnoreCase(baseUri.getScheme()) && !isLoopbackHttp(baseUri)) {
            throw new IllegalArgumentException("Supabase URL must use HTTPS outside local development");
        }

        String baseUrl = supabaseUrl.replaceAll("/+$", "") + "/rest/v1";
        return builder.baseUrl(baseUrl).build();
    }

    private boolean isLoopbackHttp(URI uri) {
        return "http".equalsIgnoreCase(uri.getScheme())
                && ("localhost".equalsIgnoreCase(uri.getHost()) || "127.0.0.1".equals(uri.getHost())
                || "::1".equals(uri.getHost()) || "[::1]".equals(uri.getHost()));
    }
}
