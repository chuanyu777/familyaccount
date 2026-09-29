package com.familyledger.auth;

import com.familyledger.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class AuthGuard {
  public static final String REQUEST_PRINCIPAL = AuthGuard.class.getName() + ".principal";

  private final AuthConfig config;

  public AuthGuard(AuthConfig config) { this.config = config; }

  public Optional<AuthPrincipal> resolve(HttpServletRequest request) {
    Object principal = request.getAttribute(REQUEST_PRINCIPAL);
    if (principal instanceof AuthPrincipal authPrincipal) return Optional.of(authPrincipal);
    return AuthSession.fromRequest(request, config);
  }

  public AuthPrincipal currentPrincipal(HttpServletRequest request) {
    return resolve(request).orElseThrow(() -> ApiException.unauthorized("AUTH_REQUIRED", "需要登录"));
  }

  public AuthPrincipal requireLedgerUser(HttpServletRequest request) {
    AuthPrincipal principal = currentPrincipal(request);
    if (principal.type() != PrincipalType.LEDGER_USER) {
      throw ApiException.forbidden("LEDGER_SESSION_REQUIRED", "需要账本用户登录");
    }
    return principal;
  }

  public AuthPrincipal requirePlatformAdmin(HttpServletRequest request) {
    AuthPrincipal principal = currentPrincipal(request);
    if (principal.type() != PrincipalType.PLATFORM_ADMIN) {
      throw ApiException.forbidden("PLATFORM_SESSION_REQUIRED", "需要平台管理员登录");
    }
    return principal;
  }
}
