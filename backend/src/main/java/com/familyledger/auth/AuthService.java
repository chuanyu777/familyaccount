package com.familyledger.auth;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Time;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
  private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
  private static final long BINDING_TTL_SECONDS = 600;

  private final JdbcTemplate db;
  private final PasswordHasher passwords;
  private final WeChatClient wechat;
  private final SecureRandom random = new SecureRandom();

  public AuthService(JdbcTemplate db, PasswordHasher passwords, WeChatClient wechat) {
    this.db = db;
    this.passwords = passwords;
    this.wechat = wechat;
  }

  public AuthPrincipal authenticateWeb(String username, String password) {
    if (username == null || password == null) throw authFailed();
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT wc.user_id, wc.password_hash FROM web_credential wc "
            + "JOIN ledger_membership lm ON lm.user_id = wc.user_id "
            + "JOIN ledger l ON l.id = lm.ledger_id "
            + "WHERE wc.username = ? AND wc.enabled = 1 AND lm.active = 1 "
            + "AND lm.web_login_allowed = 1 AND l.is_web_enabled = 1 LIMIT 1", username.trim());
    if (rows.isEmpty() || !passwords.matches(password, String.valueOf(rows.get(0).get("password_hash")))) {
      throw authFailed();
    }
    return AuthPrincipal.webLedgerUser(((Number) rows.get(0).get("user_id")).longValue());
  }

  public AuthPrincipal authenticatePlatformAdmin(String username, String password) {
    if (username == null || password == null) throw authFailed();
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id, password_hash FROM platform_admin WHERE username = ? AND enabled = 1 LIMIT 1",
        username.trim());
    if (rows.isEmpty() || !passwords.matches(password, String.valueOf(rows.get(0).get("password_hash")))) {
      throw authFailed();
    }
    return AuthPrincipal.platformAdmin(((Number) rows.get(0).get("id")).longValue());
  }

  @Transactional
  public AuthPrincipal loginWeChat(String loginCode) {
    final WeChatClient.WeChatIdentity identity = exchangeWeChatCode(loginCode);
    if (identity == null || identity.openid() == null || identity.openid().isBlank()) {
      throw ApiException.unauthorized("WECHAT_LOGIN_FAILED", "微信登录失败");
    }
    List<Long> existing = db.query("SELECT user_id FROM wechat_identity WHERE openid = ?",
        (rs, i) -> rs.getLong(1), identity.openid());
    long userId;
    if (!existing.isEmpty()) {
      userId = existing.get(0);
    } else {
      userId = Db.insert(db, "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)",
          identity.displayName() == null || identity.displayName().isBlank() ? "微信用户" : identity.displayName(),
          Time.now());
      db.update("INSERT INTO wechat_identity (user_id, openid, created_at) VALUES (?, ?, ?)",
          userId, identity.openid(), Time.now());
    }
    return AuthPrincipal.ledgerUser(userId);
  }

  public WeChatClient.WeChatIdentity exchangeWeChatCode(String loginCode) {
    try {
      return wechat.exchangeLoginCode(loginCode);
    } catch (RuntimeException e) {
      throw ApiException.unauthorized("WECHAT_LOGIN_FAILED", "微信登录失败");
    }
  }

  @Transactional
  public BindingCodeView issueWebBindingCode(long userId) {
    Long allowed = db.queryForObject(
        "SELECT COUNT(*) FROM web_credential wc "
            + "JOIN ledger_membership lm ON lm.user_id = wc.user_id "
            + "JOIN ledger l ON l.id = lm.ledger_id "
            + "WHERE wc.user_id = ? AND wc.enabled = 1 AND lm.active = 1 "
            + "AND lm.web_login_allowed = 1 AND l.is_web_enabled = 1", Long.class, userId);
    if (allowed == null || allowed == 0) {
      throw ApiException.forbidden("BINDING_NOT_ALLOWED", "该用户不支持 Web 绑定");
    }
    byte[] raw = new byte[32];
    random.nextBytes(raw);
    String code = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    String expiresAt = expiresAt(BINDING_TTL_SECONDS);
    db.update("INSERT INTO web_binding_code (user_id, code_hash, expires_at, used_at, created_at) "
            + "VALUES (?, ?, ?, NULL, ?)", userId, sha256(code), expiresAt, Time.now());
    return new BindingCodeView(code, expiresAt);
  }

  @Transactional
  public AuthPrincipal bindWeChatIdentity(long userId, String code, String openid) {
    if (code == null || code.isBlank() || openid == null || openid.isBlank()) {
      throw ApiException.badRequest("VALIDATION_FAILED", "绑定参数不能为空");
    }
    List<Map<String, Object>> binding = db.queryForList(
        "SELECT user_id, expires_at, used_at FROM web_binding_code WHERE code_hash = ? FOR UPDATE",
        sha256(code));
    if (binding.isEmpty()) throw bindingInvalid();
    Map<String, Object> row = binding.get(0);
    String expiresAt = String.valueOf(row.get("expires_at"));
    if (row.get("used_at") != null || expiresAt.compareTo(Time.now()) <= 0
        || ((Number) row.get("user_id")).longValue() != userId) throw bindingInvalid();
    List<Long> bound = db.query("SELECT user_id FROM wechat_identity WHERE openid = ? FOR UPDATE",
        (rs, i) -> rs.getLong(1), openid);
    if (!bound.isEmpty()) {
      throw ApiException.conflict("WECHAT_ALREADY_BOUND", "微信身份已绑定其他用户");
    }
    db.update("INSERT INTO wechat_identity (user_id, openid, created_at) VALUES (?, ?, ?)",
        userId, openid, Time.now());
    db.update("UPDATE web_binding_code SET used_at = ? WHERE code_hash = ?", Time.now(), sha256(code));
    return AuthPrincipal.ledgerUser(userId);
  }

  @Transactional
  public AuthPrincipal bindWeChatIdentity(String code, String openid) {
    if (code == null || code.isBlank()) throw bindingInvalid();
    List<Long> userIds = db.query("SELECT user_id FROM web_binding_code WHERE code_hash = ? FOR UPDATE",
        (rs, i) -> rs.getLong(1), sha256(code));
    if (userIds.isEmpty()) throw bindingInvalid();
    return bindWeChatIdentity(userIds.get(0), code, openid);
  }

  private static ApiException authFailed() {
    return ApiException.unauthorized("AUTH_FAILED", "用户名或密码错误");
  }

  private static ApiException bindingInvalid() {
    return ApiException.conflict("BINDING_CODE_INVALID", "绑定码无效或已过期");
  }

  private static String expiresAt(long seconds) {
    return LocalDateTime.now().plusSeconds(seconds).format(TIMESTAMP);
  }

  private static String sha256(String value) {
    try {
      return Base64.getUrlEncoder().withoutPadding().encodeToString(
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException("SHA-256 不可用", e);
    }
  }
}
