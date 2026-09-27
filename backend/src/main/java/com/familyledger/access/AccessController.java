package com.familyledger.access;

import com.familyledger.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 家庭访问口令的公开端点（唯一不受守卫保护的 /api 前缀）。
 *
 * <p>契约与前端解锁页 web/public/unlock.html 严格对应：
 * unlock 成功返回 204 + Set-Cookie，失败返回 401 ACCESS_DENIED，
 * 触发限流返回 429 TOO_MANY_ATTEMPTS；lock 清空 Cookie；session 供代理层鉴权。
 */
@RestController
@RequestMapping("/api/access")
public class AccessController {
  private final AccessConfig config;
  private final FailedAttemptLimiter limiter;

  public AccessController(AccessConfig config, FailedAttemptLimiter limiter) {
    this.config = config;
    this.limiter = limiter;
  }

  @PostMapping("/unlock")
  public ResponseEntity<Void> unlock(
      @RequestBody(required = false) Map<String, Object> body,
      HttpServletRequest request,
      HttpServletResponse response) {
    if (!config.isEnabled()) {
      return ResponseEntity.noContent().build();
    }
    long now = System.currentTimeMillis();
    String ip = ClientIp.resolve(request, config.getTrustProxyHops());
    if (limiter.isLimited(ip, now)) {
      throw ApiException.tooManyRequests("TOO_MANY_ATTEMPTS", "尝试次数过多，请稍后再试");
    }
    Object raw = body == null ? null : body.get("code");
    String provided = raw == null ? "" : String.valueOf(raw);
    if (!AccessSession.codesMatch(provided, config.getAccessCode())) {
      limiter.recordFailure(ip, now);
      throw ApiException.unauthorized("ACCESS_DENIED", "家庭访问口令错误");
    }
    boolean secure = AccessSession.isSecureRequest(request, config);
    response.addHeader("Set-Cookie", AccessSession.cookieHeader(config, now, secure));
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/lock")
  public ResponseEntity<Void> lock(HttpServletRequest request, HttpServletResponse response) {
    boolean secure = AccessSession.isSecureRequest(request, config);
    response.addHeader("Set-Cookie", AccessSession.clearCookieHeader(config, secure));
    return ResponseEntity.noContent().build();
  }

  /** 供 Nginx auth_request 使用：有会话 204，无会话 401。 */
  @GetMapping("/session")
  public ResponseEntity<Void> session(HttpServletRequest request) {
    if (!config.isEnabled()) {
      return ResponseEntity.noContent().build();
    }
    if (!AccessSession.hasValidSession(request, config, System.currentTimeMillis())) {
      throw ApiException.unauthorized("ACCESS_REQUIRED", "需要家庭访问口令");
    }
    return ResponseEntity.noContent().build();
  }
}
