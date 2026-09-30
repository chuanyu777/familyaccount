package com.familyledger.auth;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

@Component
public class AuthConfig {
  public static final String LEDGER_COOKIE = "ledger_session";
  public static final String PLATFORM_COOKIE = "platform_session";

  private final boolean production;
  private final String sessionSecret;
  private final long sessionTtlMillis;
  private final String wechatAppId;
  private final String wechatAppSecret;
  private final String wechatBaseUrl;
  private final boolean cookieSecure;

  public AuthConfig(
      Environment environment,
      @Value("${familyledger.auth.session-secret:}") String sessionSecret,
      @Value("${familyledger.auth.session-ttl-seconds:2592000}") long sessionTtlSeconds,
      @Value("${familyledger.wechat.app-id:}") String wechatAppId,
      @Value("${familyledger.wechat.app-secret:}") String wechatAppSecret,
      @Value("${familyledger.wechat.base-url:https://api.weixin.qq.com}") String wechatBaseUrl,
      @Value("${familyledger.auth.cookie-secure:false}") boolean cookieSecure) {
    this.production = environment != null && environment.acceptsProfiles(Profiles.of("prod", "production"));
    this.sessionSecret = sessionSecret == null ? "" : sessionSecret.trim();
    this.sessionTtlMillis = sessionTtlSeconds * 1000L;
    this.wechatAppId = wechatAppId == null ? "" : wechatAppId.trim();
    this.wechatAppSecret = wechatAppSecret == null ? "" : wechatAppSecret.trim();
    this.wechatBaseUrl = wechatBaseUrl == null ? "" : wechatBaseUrl.trim();
    this.cookieSecure = cookieSecure;
    if (sessionTtlSeconds <= 0) throw new IllegalArgumentException("session TTL must be positive");
  }

  @PostConstruct
  void assertProductionConfig() {
    if (production && sessionSecret.isEmpty()) {
      throw new IllegalStateException("SESSION_SECRET is required in production");
    }
    if (production && !cookieSecure) {
      throw new IllegalStateException("SESSION_COOKIE_SECURE must be true in production");
    }
  }

  public String getSessionSecret() { return sessionSecret; }
  public long getSessionTtlMillis() { return sessionTtlMillis; }
  public String getLedgerCookie() { return LEDGER_COOKIE; }
  public String getPlatformCookie() { return PLATFORM_COOKIE; }
  public String getWechatAppId() { return wechatAppId; }
  public String getWechatAppSecret() { return wechatAppSecret; }
  public String getWechatBaseUrl() { return wechatBaseUrl; }
  public boolean isCookieSecure() { return cookieSecure; }
}
