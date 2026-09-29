package com.familyledger.auth;

import com.familyledger.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService service;
  private final AuthGuard guard;
  private final AuthConfig config;
  private final AuthAttemptLimiter limiter;

  public AuthController(AuthService service, AuthGuard guard, AuthConfig config,
      AuthAttemptLimiter limiter) {
    this.service = service;
    this.guard = guard;
    this.config = config;
    this.limiter = limiter;
  }

  @PostMapping("/web/login")
  public ResponseEntity<Void> webLogin(@RequestBody(required = false) Map<String, Object> body,
      HttpServletRequest request, HttpServletResponse response) {
    String username = text(body, "username");
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
    String username = text(body, "username");
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
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("code", service.issueWebBindingCode(principal.userId()));
    return result;
  }

  @PostMapping("/wechat/bind")
  public Map<String, Object> bindWeChat(@RequestBody(required = false) Map<String, Object> body,
      HttpServletResponse response) {
    String bindingCode = text(body, "bindingCode");
    String loginCode = text(body, "code");
    WeChatClient.WeChatIdentity identity = service.exchangeWeChatCode(loginCode);
    AuthPrincipal principal = service.bindWeChatIdentity(bindingCode, identity.openid());
    response.addHeader("Set-Cookie", AuthSession.cookieHeader(config.getLedgerCookie(), principal, config,
        System.currentTimeMillis()));
    return principalBody(principal);
  }

  @PostMapping("/logout")
  public ResponseEntity<Void> logout(HttpServletResponse response) {
    response.addHeader("Set-Cookie", AuthSession.clearCookieHeader(config.getLedgerCookie()));
    response.addHeader("Set-Cookie", AuthSession.clearCookieHeader(config.getPlatformCookie()));
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/session")
  public Map<String, Object> session(HttpServletRequest request) {
    return principalBody(guard.currentPrincipal(request));
  }

  private static Map<String, Object> principalBody(AuthPrincipal principal) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("type", principal.type().name());
    if (principal.userId() != null) result.put("userId", principal.userId());
    if (principal.platformAdminId() != null) result.put("platformAdminId", principal.platformAdminId());
    return result;
  }

  private static String text(Map<String, Object> body, String key) {
    Object value = body == null ? null : body.get(key);
    return value == null ? null : String.valueOf(value);
  }

}
