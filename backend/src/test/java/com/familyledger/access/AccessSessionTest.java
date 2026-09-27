package com.familyledger.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** 会话签名、配置校验与解锁限流的单元测试。 */
class AccessSessionTest {
  private static final String SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";

  private static AccessConfig config() {
    return new AccessConfig(false, "house-code", SECRET, 0);
  }

  @Test
  void 会话在三十天内有效过期后失效() {
    AccessConfig config = config();
    long issued = System.currentTimeMillis();
    String cookie = AccessSession.createCookieValue(config, issued);

    assertThat(AccessSession.verifyCookieValue(cookie, config, issued + 29L * 24 * 3600 * 1000)).isTrue();
    assertThat(AccessSession.verifyCookieValue(cookie, config, issued + 31L * 24 * 3600 * 1000)).isFalse();
  }

  @Test
  void 篡改畸形与被截断的会话一律拒绝() {
    AccessConfig config = config();
    long now = System.currentTimeMillis();
    String cookie = AccessSession.createCookieValue(config, now);

    assertThat(AccessSession.verifyCookieValue(cookie + "x", config, now)).isFalse();
    assertThat(AccessSession.verifyCookieValue(cookie.substring(0, cookie.indexOf('.')), config, now)).isFalse();
    assertThat(AccessSession.verifyCookieValue("a.b.c", config, now)).isFalse();
    assertThat(AccessSession.verifyCookieValue("", config, now)).isFalse();
    assertThat(AccessSession.verifyCookieValue(null, config, now)).isFalse();
  }

  @Test
  void 轮换签名密钥后旧会话立即失效() {
    AccessConfig before = config();
    AccessConfig after = new AccessConfig(false, "house-code", "another-secret-value", 0);
    long now = System.currentTimeMillis();
    String cookie = AccessSession.createCookieValue(before, now);

    assertThat(AccessSession.verifyCookieValue(cookie, after, now)).isFalse();
  }

  @Test
  void 口令比对只在完全相等时通过() {
    assertThat(AccessSession.codesMatch("house-code", "house-code")).isTrue();
    assertThat(AccessSession.codesMatch("wrong", "house-code")).isFalse();
    assertThat(AccessSession.codesMatch("", "house-code")).isFalse();
  }

  @Test
  void 下发与清除的Cookie属性符合契约() {
    AccessConfig dev = config();
    String header = AccessSession.cookieHeader(dev, System.currentTimeMillis(), false);
    assertThat(header).contains("Path=/").contains("HttpOnly").contains("SameSite=Strict");
    assertThat(header).doesNotContain("Secure");
    assertThat(header).contains("Max-Age=" + dev.getSessionTtlMs() / 1000);

    // Secure 只取决于请求是否真的走 HTTPS，而不是运行环境：
    // 纯 HTTP 源站（裸 80）必须不带 Secure，否则浏览器不存 Cookie，解锁会被反复踢回。
    assertThat(AccessSession.cookieHeader(dev, System.currentTimeMillis(), true)).contains("Secure");
    assertThat(AccessSession.clearCookieHeader(dev, true)).contains("Max-Age=0").contains("Secure");
    assertThat(AccessSession.clearCookieHeader(dev, false)).contains("Max-Age=0").doesNotContain("Secure");
  }

  @Test
  void 生产环境缺少口令或密钥时拒绝启动() {
    assertThatThrownBy(() -> new AccessConfig(true, "", SECRET, 0).assertProductionConfig())
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("FAMILY_ACCESS_CODE");
    assertThatThrownBy(() -> new AccessConfig(true, "house-code", "", 0).assertProductionConfig())
        .isInstanceOf(IllegalStateException.class);
    new AccessConfig(false, "", "", 0).assertProductionConfig(); // 开发环境不强制
  }

  @Test
  void 配置了口令即启用生产环境强制启用() {
    assertThat(new AccessConfig(false, "", "", 0).isEnabled()).isFalse();
    assertThat(new AccessConfig(false, "house-code", SECRET, 0).isEnabled()).isTrue();
    assertThat(new AccessConfig(true, "", "", 0).isEnabled()).isTrue();
  }

  @Test
  void 代理跳数必须是非负整数() {
    assertThat(new AccessConfig(false, "c", SECRET, 0).getTrustProxyHops()).isZero();
    assertThatThrownBy(() -> new AccessConfig(false, "c", SECRET, -1))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void 同一地址五次失败后限流窗口过期后释放() {
    FailedAttemptLimiter limiter = new FailedAttemptLimiter();
    long start = 1_700_000_000_000L;
    for (int i = 0; i < FailedAttemptLimiter.MAX_FAILED_ATTEMPTS; i++) {
      assertThat(limiter.isLimited("203.0.113.9", start)).isFalse();
      limiter.recordFailure("203.0.113.9", start);
    }
    assertThat(limiter.isLimited("203.0.113.9", start)).isTrue();
    assertThat(limiter.isLimited("198.51.100.7", start)).isFalse();

    long later = start + FailedAttemptLimiter.WINDOW_MS + 1;
    assertThat(limiter.isLimited("203.0.113.9", later)).isFalse();
  }
}
