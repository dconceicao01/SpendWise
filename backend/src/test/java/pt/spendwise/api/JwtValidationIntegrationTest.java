package pt.spendwise.api;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.net.InetSocketAddress;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "SUPABASE_URL=http://127.0.0.1:54321",
        "SUPABASE_PUBLISHABLE_KEY=test-publishable-key"
})
@AutoConfigureMockMvc
class JwtValidationIntegrationTest {

    private static final RSAKey SIGNING_KEY = generateSigningKey();
    private static final ECKey ES256_SIGNING_KEY = generateEs256SigningKey();
    private static final HttpServer JWKS_SERVER = startJwksServer();
    private static final String ISSUER = "http://127.0.0.1:" + JWKS_SERVER.getAddress().getPort() + "/auth/v1";

    @Autowired
    private MockMvc mockMvc;

    @DynamicPropertySource
    static void configureIssuer(DynamicPropertyRegistry registry) {
        registry.add("SUPABASE_ISSUER_URI", () -> ISSUER);
    }

    @AfterAll
    static void stopJwksServer() {
        JWKS_SERVER.stop(0);
    }

    @Test
    void acceptsJwtSignedByTheConfiguredJwksKey() throws Exception {
        mockMvc.perform(get("/api/v1/protected-resource")
                        .header(HttpHeaders.AUTHORIZATION,
                                "Bearer " + createToken(ISSUER, "authenticated", Instant.now().plusSeconds(60))))
                .andExpect(status().isNotFound());
    }

    @Test
    void acceptsJwtSignedByTheSupabaseEs256Key() throws Exception {
        mockMvc.perform(get("/api/v1/protected-resource")
                        .header(HttpHeaders.AUTHORIZATION,
                                "Bearer " + createToken(ISSUER, "authenticated",
                                        Instant.now().plusSeconds(60), SignatureAlgorithm.ES256)))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsJwtWithWrongIssuer() throws Exception {
        mockMvc.perform(get("/api/v1/protected-resource")
                        .header(HttpHeaders.AUTHORIZATION,
                                "Bearer " + createToken("https://wrong-issuer.invalid", "authenticated",
                                        Instant.now().plusSeconds(60))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsJwtWithAnonymousAudience() throws Exception {
        mockMvc.perform(get("/api/v1/protected-resource")
                        .header(HttpHeaders.AUTHORIZATION,
                                "Bearer " + createToken(ISSUER, "anon", Instant.now().plusSeconds(60))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsExpiredJwt() throws Exception {
        mockMvc.perform(get("/api/v1/protected-resource")
                        .header(HttpHeaders.AUTHORIZATION,
                                "Bearer " + createToken(ISSUER, "authenticated", Instant.now().minusSeconds(60))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsJwtWithInvalidSignature() throws Exception {
        String[] tokenParts = createToken(ISSUER, "authenticated", Instant.now().plusSeconds(60)).split("\\.");
        char firstSignatureCharacter = tokenParts[2].charAt(0);
        tokenParts[2] = (firstSignatureCharacter == 'A' ? "B" : "A") + tokenParts[2].substring(1);

        mockMvc.perform(get("/api/v1/protected-resource")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + String.join(".", tokenParts)))
                .andExpect(status().isUnauthorized());
    }

    private static String createToken(String issuer, String audience, Instant expiresAt) {
        return createToken(issuer, audience, expiresAt, SignatureAlgorithm.RS256);
    }

    private static String createToken(String issuer, String audience, Instant expiresAt,
            SignatureAlgorithm algorithm) {
        JWK signingKey = algorithm == SignatureAlgorithm.ES256 ? ES256_SIGNING_KEY : SIGNING_KEY;
        NimbusJwtEncoder encoder = new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(signingKey)));
        Instant now = Instant.now();
        Instant issuedAt = expiresAt.isBefore(now) ? expiresAt.minusSeconds(60) : now.minusSeconds(1);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .audience(java.util.List.of(audience))
                .subject("synthetic-test-user")
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .build();
        JwsHeader header = JwsHeader.with(algorithm)
                .keyId(signingKey.getKeyID())
                .build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    private static RSAKey generateSigningKey() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            KeyPair keyPair = generator.generateKeyPair();
            return new RSAKey.Builder((RSAPublicKey) keyPair.getPublic())
                    .privateKey((RSAPrivateKey) keyPair.getPrivate())
                    .algorithm(JWSAlgorithm.RS256)
                    .keyID(UUID.randomUUID().toString())
                    .build();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not generate the synthetic JWT signing key", exception);
        }
    }

    private static ECKey generateEs256SigningKey() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            KeyPair keyPair = generator.generateKeyPair();
            return new ECKey.Builder(Curve.P_256, (ECPublicKey) keyPair.getPublic())
                    .privateKey((ECPrivateKey) keyPair.getPrivate())
                    .algorithm(JWSAlgorithm.ES256)
                    .keyID(UUID.randomUUID().toString())
                    .build();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not generate the synthetic ES256 JWT signing key", exception);
        }
    }

    private static HttpServer startJwksServer() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/auth/v1/.well-known/jwks.json", exchange -> {
                byte[] response = new JWKSet(List.of(SIGNING_KEY.toPublicJWK(), ES256_SIGNING_KEY.toPublicJWK()))
                        .toString()
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, response.length);
                exchange.getResponseBody().write(response);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException exception) {
            throw new IllegalStateException("Could not start the synthetic JWKS endpoint", exception);
        }
    }
}
