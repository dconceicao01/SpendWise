package pt.spendwise.api.supabase;

import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriBuilder;

@Component
public class SupabaseDataApiClient {

    private static final Pattern RELATION_NAME = Pattern.compile("^[A-Za-z][A-Za-z0-9_]*$");
    private final RestClient restClient;
    private final String publishableKey;

    public SupabaseDataApiClient(
            RestClient supabaseDataApiRestClient,
            @Value("${SUPABASE_PUBLISHABLE_KEY}") String publishableKey) {
        this.restClient = supabaseDataApiRestClient;
        this.publishableKey = publishableKey;
    }

    public <T> T request(
            HttpMethod method,
            String relation,
            Map<String, String> queryParameters,
            Object requestBody,
            ParameterizedTypeReference<T> responseType) {
        if (!RELATION_NAME.matcher(relation).matches()) {
            throw new IllegalArgumentException("Invalid Supabase relation name");
        }

        String accessToken = requireCurrentAccessToken();
        RestClient.RequestBodySpec request = restClient.method(method)
                .uri(uriBuilder -> buildUri(uriBuilder, relation, queryParameters))
                .header("apikey", publishableKey)
                .headers(headers -> headers.setBearerAuth(accessToken));

        if (requestBody != null) {
            request.contentType(MediaType.APPLICATION_JSON).body(requestBody);
        }

        return request.retrieve().body(responseType);
    }

    private String requireCurrentAccessToken() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuthenticationToken)
                || !authentication.isAuthenticated()) {
            throw new IllegalStateException("An authenticated user JWT is required for Supabase Data API access");
        }
        return jwtAuthenticationToken.getToken().getTokenValue();
    }

    private java.net.URI buildUri(UriBuilder uriBuilder, String relation, Map<String, String> queryParameters) {
        UriBuilder requestUri = uriBuilder.pathSegment(relation);
        queryParameters.forEach(requestUri::queryParam);
        return requestUri.build();
    }
}
