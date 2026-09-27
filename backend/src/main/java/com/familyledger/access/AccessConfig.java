package com.familyledger.access;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

/**
 * 家庭访问口令的运行期配置。
 *
 * <p>与前端/部署的契约（与已删除的 Node 实现保持一致）：
 * 口令与会话签名密钥只来自环境变量，绝不入库、绝不写到浏览器；
 * 生产环境缺任一密钥时进程拒绝启动；部署在反向代理后必须显式配置 TRUST_PROXY_HOPS。
 */
@Component
public class AccessConfig {
  public static final String COOKIE_NAME = "family_access";
  /** 可信设备有效期：30 天。 */
  public static final long SESSION_TTL_MS = 30L * 24 * 60 * 60 * 1000;

  private final boolean production;
  private final String accessCode;
  private final String sessionSecret;
  private final int trustProxyHops;

  @Autowired
  public AccessConfig(
      Environment environment,
      @Value("${FAMILY_ACCESS_CODE:}") String accessCode,
      @Value("${SESSION_SECRET:}") String sessionSecret,
      @Value("${TRUST_PROXY_HOPS:0}") String trustProxyHops) {
    this.production = environment != null && environment.acceptsProfiles(Profiles.of("prod", "production"));
    this.accessCode = accessCode == null ? "" : accessCode.trim();
    this.sessionSecret = sessionSecret == null ? "" : sessionSecret;
    this.trustProxyHops = parseTrustProxyHops(trustProxyHops);
  }

  /** 测试/手工构造用。 */
  public AccessConfig(boolean production, String accessCode, String sessionSecret, int trustProxyHops) {
    if (trustProxyHops < 0) {
      throw new IllegalArgumentException("TRUST_PROXY_HOPS must be a non-negative integer");
    }
    this.production = production;
    this.accessCode = accessCode == null ? "" : accessCode.trim();
    this.sessionSecret = sessionSecret == null ? "" : sessionSecret;
    this.trustProxyHops = trustProxyHops;
  }

  @PostConstruct
  public void assertProductionConfig() {
    if (!production) {
      return;
    }
    if (accessCode.isEmpty() || sessionSecret.isEmpty()) {
      throw new IllegalStateException(
          "FAMILY_ACCESS_CODE and SESSION_SECRET are required in production");
    }
  }

  public boolean isEnabled() {
    return production || !accessCode.isEmpty();
  }

  public boolean isProduction() {
    return production;
  }

  public String getAccessCode() {
    return accessCode;
  }

  public String getSessionSecret() {
    return sessionSecret;
  }

  public int getTrustProxyHops() {
    return trustProxyHops;
  }

  public String getCookieName() {
    return COOKIE_NAME;
  }

  public long getSessionTtlMs() {
    return SESSION_TTL_MS;
  }

  private static int parseTrustProxyHops(String raw) {
    String value = raw == null ? "" : raw.trim();
    if (value.isEmpty()) {
      return 0;
    }
    try {
      int hops = Integer.parseInt(value);
      if (hops < 0) {
        throw new NumberFormatException(value);
      }
      return hops;
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException("TRUST_PROXY_HOPS must be a non-negative integer", e);
    }
  }
}
