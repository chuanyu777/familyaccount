package com.familyledger.access;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

/**
 * 可信设备会话：base64url({exp}) + "." + HMAC-SHA256(载荷, SESSION_SECRET)。
 *
 * <p>无状态、无用户标识，仅表达「这台设备在 exp 之前已通过家庭口令校验」。
 * 轮换 SESSION_SECRET 会让所有已发出的 Cookie 立即失效。
 */
public final class AccessSession {
  private static final String HMAC_ALGORITHM = "HmacSHA256";
  private static final Pattern EXP_PATTERN = Pattern.compile("\"exp\"\\s*:\\s*(-?\\d+)");

  private AccessSession() {}

  /** 生成可用于 Set-Cookie 的会话值。 */
  public static String createCookieValue(AccessConfig config, long nowMillis) {
    String payload = encode(nowMillis + config.getSessionTtlMs());
    return payload + "." + sign(payload, config.getSessionSecret());
  }

  /** 校验会话值：结构、签名、过期三者都通过才算有效。 */
  public static boolean verifyCookieValue(String value, AccessConfig config, long nowMillis) {
    if (value == null || value.isEmpty()) {
      return false;
    }
    String[] parts = value.split("\\.");
    if (parts.length != 2) {
      return false;
    }
    String payload = parts[0];
    String provided = parts[1];
    byte[] expected = sign(payload, config.getSessionSecret()).getBytes(StandardCharsets.UTF_8);
    byte[] actual = provided.getBytes(StandardCharsets.UTF_8);
    if (!MessageDigest.isEqual(expected, actual)) {
      return false;
    }
    Long exp = decodeExp(payload);
    return exp != null && nowMillis < exp;
  }

  /**
   * 解锁成功时下发的 Set-Cookie 头。
   *
   * @param secure 是否追加 Secure。只有在请求确实走 HTTPS 时才应为 true —— 否则源站是纯 HTTP
   *     的部署（例如云厂商 CDN/LB 终止 TLS 之外的裸 80 站）会出现「解锁成功但浏览器不存 Cookie」，
   *     页面被反复踢回解锁页。
   */
  public static String cookieHeader(AccessConfig config, long nowMillis, boolean secure) {
    long maxAgeSeconds = config.getSessionTtlMs() / 1000;
    return config.getCookieName()
        + "="
        + createCookieValue(config, nowMillis)
        + "; Max-Age="
        + maxAgeSeconds
        + "; "
        + cookieAttributes(secure);
  }

  /** 锁定本设备时清空的 Set-Cookie 头。 */
  public static String clearCookieHeader(AccessConfig config, boolean secure) {
    return config.getCookieName() + "=; Max-Age=0; " + cookieAttributes(secure);
  }

  /**
   * 判断当前请求对浏览器而言是否为 HTTPS。
   *
   * <p>配置了 TRUST_PROXY_HOPS（即位于反向代理之后）时以 X-Forwarded-Proto 为准，
   * 否则以连接器自身的 isSecure() 为准。
   */
  public static boolean isSecureRequest(HttpServletRequest request, AccessConfig config) {
    if (config.getTrustProxyHops() > 0) {
      String proto = request.getHeader("X-Forwarded-Proto");
      if (proto != null && !proto.isBlank()) {
        return proto.split(",")[0].trim().equalsIgnoreCase("https");
      }
    }
    return request.isSecure();
  }

  /** 从请求里取出会话 Cookie。 */
  public static String cookieFromRequest(HttpServletRequest request, AccessConfig config) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) {
      return null;
    }
    for (Cookie cookie : cookies) {
      if (config.getCookieName().equals(cookie.getName())) {
        String value = cookie.getValue();
        return value == null || value.isEmpty() ? null : value;
      }
    }
    return null;
  }

  public static boolean hasValidSession(HttpServletRequest request, AccessConfig config, long nowMillis) {
    String cookie = cookieFromRequest(request, config);
    return cookie != null && verifyCookieValue(cookie, config, nowMillis);
  }

  /** 口令比对：先各自 sha256 再常量时间比较，规避长度侧信道。 */
  public static boolean codesMatch(String provided, String expected) {
    if (provided == null || expected == null) {
      return false;
    }
    MessageDigest digest = sha256();
    byte[] a = digest.digest(provided.getBytes(StandardCharsets.UTF_8));
    byte[] b = digest.digest(expected.getBytes(StandardCharsets.UTF_8));
    return MessageDigest.isEqual(a, b);
  }

  private static String cookieAttributes(boolean secure) {
    return "Path=/; HttpOnly; SameSite=Strict" + (secure ? "; Secure" : "");
  }

  private static String encode(long expMillis) {
    String json = "{\"exp\":" + expMillis + "}";
    return Base64.getUrlEncoder().withoutPadding().encodeToString(json.getBytes(StandardCharsets.UTF_8));
  }

  private static Long decodeExp(String payload) {
    byte[] decoded;
    try {
      decoded = Base64.getUrlDecoder().decode(payload);
    } catch (IllegalArgumentException e) {
      return null;
    }
    Matcher matcher = EXP_PATTERN.matcher(new String(decoded, StandardCharsets.UTF_8));
    if (!matcher.find()) {
      return null;
    }
    try {
      return Long.parseLong(matcher.group(1));
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static String sign(String payload, String secret) {
    try {
      Mac mac = Mac.getInstance(HMAC_ALGORITHM);
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
      byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    } catch (NoSuchAlgorithmException | java.security.InvalidKeyException e) {
      throw new IllegalStateException("无法计算会话签名", e);
    }
  }

  private static MessageDigest sha256() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 不可用", e);
    }
  }
}
