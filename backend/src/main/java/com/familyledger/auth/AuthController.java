package com.familyledger.auth;

import com.familyledger.common.ApiException;
import com.familyledger.ledger.WebLedgerAuthorization;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService service;
  private final AuthGuard guard;
  private final AuthConfig config;
  private final AuthAttemptLimiter limiter;
  private final WebLedgerAuthorization webAuthorization;

  public AuthController(AuthService service, AuthGuard guard, AuthConfig config,
      AuthAttemptLimiter limiter, WebLedgerAuthorization webAuthorization) {
    this.service = service;
    this.guard = guard;
    this.config = config;
    this.limiter = limiter;
    this.webAuthorization = webAuthorization;
  }

  @PostMapping("/web/login")
  public ResponseEntity<Void> webLogin(@RequestBody(required = false) Map<String, Object> body,
      HttpServletRequest request, HttpServletResponse response) {
    String username = AuthService.canonicalUsername(text(body, "username"));
    String key = "web|" + request.getRemoteAddr() + "|" + username;
    long now = System.currentTimeMillis();
    if (limiter.isLimited(key, now)) throw ApiException.tooManyRequests("AUTH_RATE_LIMITED", "尝试次数过多，请稍后再试");
    AuthPrincipal principal;
    try {
      principal = service.authenticateWeb(username, text(body, "password"));
    } catch (ApiException e) {
      if ("AUTH_FAILED".equals(e.getCode())) limiter.recordFailure(key, now);
      throw e;
    }
    response.addHeader("Set-Cookie", AuthSession.cookieHeader(config.getLedgerCookie(), principal, config,
        System.currentTimeMillis()));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/platform/login")
  public ResponseEntity<Void> platformLogin(@RequestBody(required = false) Map<String, Object> body,
      HttpServletRequest request, HttpServletResponse response) {
    String username = AuthService.canonicalUsername(text(body, "username"));
    String key = "platform|" + request.getRemoteAddr() + "|" + username;
    long now = System.currentTimeMillis();
    if (limiter.isLimited(key, now)) throw ApiException.tooManyRequests("AUTH_RATE_LIMITED", "尝试次数过多，请稍后再试");
    AuthPrincipal principal;
    try {
      principal = service.authenticatePlatformAdmin(username, text(body, "password"));
    } catch (ApiException e) {
      if ("AUTH_FAILED".equals(e.getCode())) limiter.recordFailure(key, now);
      throw e;
    }
    response.addHeader("Set-Cookie", AuthSession.cookieHeader(config.getPlatformCookie(), principal, config,
        System.currentTimeMillis()));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/wechat/login")
  public Map<String, Object> wechatLogin(@RequestBody(required = false) Map<String, Object> body,
      HttpServletResponse response) {
    AuthPrincipal principal = service.loginWeChat(text(body, "code"));
    response.addHeader("Set-Cookie", AuthSession.cookieHeader(config.getLedgerCookie(), principal, config,
        System.currentTimeMillis()));
    return principalBody(principal);
  }

  @PostMapping("/binding-code")
  public Map<String, Object> issueBindingCode(HttpServletRequest request) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    long ledgerId = webAuthorization.requireSpecialLedger(principal).ledgerId();
    Map<String, Object> result = new LinkedHashMap<>();
    BindingCodeView binding = service.issueWebBindingCode(principal.userId(), ledgerId);
    result.put("code", binding.code());
    result.put("expiresAt", binding.expiresAt());
    return result;
  }

  @PostMapping("/web-ledger/preview")
  public WebLedgerBindingPreview previewWebLedgerImport(@RequestBody(required = false) Map<String, Object> body,
      HttpServletRequest request) {
    return service.previewWebLedgerImport(requireMiniProgramUser(request).userId(), text(body, "bindingCode"));
  }

  @PostMapping("/web-ledger/import")
  public WebLedgerBindingPreview importWebLedger(@RequestBody(required = false) Map<String, Object> body,
      HttpServletRequest request) {
    return service.importWebLedger(requireMiniProgramUser(request).userId(), text(body, "bindingCode"));
  }

  @PostMapping("/logout")
  public ResponseEntity<Void> logout(@RequestParam(value = "kind", defaultValue = "ledger") String kind,
      HttpServletResponse response) {
    if ("platform".equals(kind)) {
      response.addHeader("Set-Cookie", AuthSession.clearCookieHeader(config.getPlatformCookie()));
    } else if ("ledger".equals(kind)) {
      response.addHeader("Set-Cookie", AuthSession.clearCookieHeader(config.getLedgerCookie()));
    } else {
      throw ApiException.badRequest("INVALID_AUTH_KIND", "登录入口类型无效");
    }
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/session")
  public Map<String, Object> session(HttpServletRequest request) {
    AuthPrincipal principal = guard.currentPrincipal(request);
    if ("ledger".equals(request.getParameter("kind"))) {
      webAuthorization.requireSpecialLedger(principal);
    } else if ("platform".equals(request.getParameter("kind"))) {
      guard.requirePlatformAdmin(request);
    }
    return principalBody(principal);
  }

  private static Map<String, Object> principalBody(AuthPrincipal principal) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("type", principal.type().name());
    result.put("webSession", principal.webSession());
    if (principal.userId() != null) result.put("userId", principal.userId());
    if (principal.platformAdminId() != null) result.put("platformAdminId", principal.platformAdminId());
    return result;
  }

  private AuthPrincipal requireMiniProgramUser(HttpServletRequest request) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    if (principal.webSession()) {
      throw ApiException.forbidden("WECHAT_SESSION_REQUIRED", "请在已登录的小程序中导入账本");
    }
    return principal;
  }

  private static String text(Map<String, Object> body, String key) {
    Object value = body == null ? null : body.get(key);
    return value == null ? null : String.valueOf(value);
  }

}
