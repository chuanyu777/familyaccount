package com.familyledger.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.Test;

class AuthSessionTest {
  private static final String SECRET = "session-secret";

  @Test
  void signedSessionCarriesOnlyItsPrincipalAndExpires() {
    String token = AuthSession.issue(AuthPrincipal.ledgerUser(42L), SECRET, 1_000L, 5_000L);

    Optional<AuthPrincipal> parsed = AuthSession.parse(token, SECRET, 5_999L);
    assertThat(parsed).contains(AuthPrincipal.ledgerUser(42L));
    assertThat(AuthSession.parse(token, SECRET, 6_000L)).isEmpty();
  }

  @Test
  void tamperedOrWrongSecretSessionIsRejected() {
    String token = AuthSession.issue(AuthPrincipal.platformAdmin(7L), SECRET, 1_000L, 5_000L);

    assertThat(AuthSession.parse(token + "x", SECRET, 2_000L)).isEmpty();
    assertThat(AuthSession.parse(token, "another-secret", 2_000L)).isEmpty();
  }
}
