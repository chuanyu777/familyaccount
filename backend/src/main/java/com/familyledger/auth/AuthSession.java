package com.familyledger.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** 无状态签名 session；cookie 中只放主体类型、主体 id 和过期时间。 */
public final class AuthSession {
  private static final String HMAC = "HmacSHA256";

  private AuthSession() {}

  public static String issue(AuthPrincipal principal, String secret, long nowMillis, long ttlMillis) {
    long expiresAt = nowMillis + ttlMillis;
    String payload = "type=" + principal.type().name()
        + "&uid=" + value(principal.userId())
        + "&aid=" + value(principal.platformAdminId())
        + "&exp=" + expiresAt;
    return encode(payload) + "." + sign(payload, secret);
  }

  public static Optional<AuthPrincipal> parse(String token, String secret, long nowMillis) {
    if (token == null || token.isBlank() || secret == null || secret.isEmpty()) {
      return Optional.empty();
    }
    String[] parts = token.split("\\.", -1);
    if (parts.length != 2) return Optional.empty();
    String payload;
    try {
      payload = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
    } catch (IllegalArgumentException e) {
      return Optional.empty();
    }
    if (!MessageDigest.isEqual(sign(payload, secret).getBytes(StandardCharsets.UTF_8),
        parts[1].getBytes(StandardCharsets.UTF_8))) return Optional.empty();
    Map<String, String> fields = new HashMap<>();
    for (String field : payload.split("&")) {
      String[] pair = field.split("=", 2);
      if (pair.length == 2) fields.put(pair[0], pair[1]);
    }
    try {
      long exp = Long.parseLong(fields.get("exp"));
      if (nowMillis >= exp) return Optional.empty();
      PrincipalType type = PrincipalType.valueOf(fields.get("type"));
      long id = Long.parseLong(type == PrincipalType.LEDGER_USER
          ? fields.get("uid") : fields.get("aid"));
      return Optional.of(type == PrincipalType.LEDGER_USER
          ? AuthPrincipal.ledgerUser(id) : AuthPrincipal.platformAdmin(id));
    } catch (RuntimeException e) {
      return Optional.empty();
    }
  }

  public static String cookieHeader(String name, AuthPrincipal principal, AuthConfig config, long nowMillis) {
    return name + "=" + issue(principal, config.getSessionSecret(), nowMillis, config.getSessionTtlMillis())
        + "; Max-Age=" + (config.getSessionTtlMillis() / 1000)
        + "; Path=/; HttpOnly; SameSite=Strict";
  }

  public static String clearCookieHeader(String name) {
    return name + "=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict";
  }

  public static Optional<AuthPrincipal> fromRequest(HttpServletRequest request, AuthConfig config) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) return Optional.empty();
    for (Cookie cookie : cookies) {
      if (config.getLedgerCookie().equals(cookie.getName())) {
        Optional<AuthPrincipal> parsed = parse(cookie.getValue(), config.getSessionSecret(), System.currentTimeMillis());
        if (parsed.isPresent()) return parsed;
      }
      if (config.getPlatformCookie().equals(cookie.getName())) {
        Optional<AuthPrincipal> parsed = parse(cookie.getValue(), config.getSessionSecret(), System.currentTimeMillis());
        if (parsed.isPresent()) return parsed;
      }
    }
    return Optional.empty();
  }

  private static String value(Long value) { return value == null ? "" : Long.toString(value); }

  private static String encode(String value) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }

  private static String sign(String payload, String secret) {
    try {
      Mac mac = Mac.getInstance(HMAC);
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(
          mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException | java.security.InvalidKeyException e) {
      throw new IllegalStateException("无法计算 session 签名", e);
    }
  }
}
