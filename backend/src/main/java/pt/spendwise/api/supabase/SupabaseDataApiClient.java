package pt.spendwise.api.supabase;

import java.util.Map;
import java.util.function.Function;
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
    private static final Pattern FUNCTION_NAME = Pattern.compile("^[A-Za-z][A-Za-z0-9_]*$");
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

        return execute(
                method,
                uriBuilder -> buildUri(uriBuilder, relation, queryParameters),
                requestBody,
                responseType,
                false);
    }

    public <T> T requestReturningRepresentation(
            HttpMethod method,
            String relation,
            Map<String, String> queryParameters,
            Object requestBody,
            ParameterizedTypeReference<T> responseType) {
        if (!RELATION_NAME.matcher(relation).matches()) {
            throw new IllegalArgumentException("Invalid Supabase relation name");
        }

        return execute(
                method,
                uriBuilder -> buildUri(uriBuilder, relation, queryParameters),
                requestBody,
                responseType,
                true);
    }

    public <T> T callFunction(
            String functionName,
            Object requestBody,
            ParameterizedTypeReference<T> responseType) {
        if (!FUNCTION_NAME.matcher(functionName).matches()) {
            throw new IllegalArgumentException("Invalid Supabase function name");
        }

        return execute(
                HttpMethod.POST,
                uriBuilder -> uriBuilder.pathSegment("rpc", functionName).build(),
                requestBody,
                responseType,
                false);
    }

    private <T> T execute(
            HttpMethod method,
            Function<UriBuilder, java.net.URI> uriBuilderFunction,
            Object requestBody,
            ParameterizedTypeReference<T> responseType,
            boolean returnRepresentation) {

        String accessToken = requireCurrentAccessToken();
        RestClient.RequestBodySpec request = restClient.method(method)
                .uri(uriBuilderFunction)
                .header("apikey", publishableKey)
                .headers(headers -> headers.setBearerAuth(accessToken));

        if (returnRepresentation) {
            request.header("Prefer", "return=representation");
        }
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
