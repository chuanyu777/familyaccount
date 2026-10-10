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

  static String canonicalUsername(String username) {
    return username == null ? null : username.trim();
  }

  public AuthPrincipal authenticateWeb(String username, String password) {
    if (username == null || password == null) throw authFailed();
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT COALESCE(wl.wechat_user_id, wc.user_id) AS effective_user_id, wc.password_hash "
            + "FROM web_credential wc "
            + "LEFT JOIN web_account_link wl ON wl.web_user_id = wc.user_id "
            + "JOIN ledger_membership lm ON lm.user_id = COALESCE(wl.wechat_user_id, wc.user_id) "
            + "JOIN ledger l ON l.id = lm.ledger_id "
            + "WHERE wc.username = ? AND wc.enabled = 1 AND lm.active = 1 "
            + "AND lm.web_login_allowed = 1 AND l.is_web_enabled = 1 "
            + "AND (wl.id IS NULL OR wl.ledger_id = lm.ledger_id) LIMIT 1", canonicalUsername(username));
    if (rows.isEmpty() || !passwords.matches(password, String.valueOf(rows.get(0).get("password_hash")))) {
      throw authFailed();
    }
    return AuthPrincipal.webLedgerUser(((Number) rows.get(0).get("effective_user_id")).longValue());
  }

  public AuthPrincipal authenticatePlatformAdmin(String username, String password) {
    if (username == null || password == null) throw authFailed();
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id, password_hash FROM platform_admin WHERE username = ? AND enabled = 1 LIMIT 1",
        canonicalUsername(username));
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

  @Transactional
  public AuthPrincipal bindWeChatIdentity(String code, String openid) {
    Map<String, Object> binding = validBinding(code, true);
    long webUserId = ((Number) binding.get("user_id")).longValue();
    long ledgerId = ((Number) binding.get("ledger_id")).longValue();
    preview(binding);
    Long linked = db.queryForObject(
        "SELECT COUNT(*) FROM web_account_link WHERE ledger_id = ? AND web_user_id = ?",
        Long.class, ledgerId, webUserId);
    if (linked != null && linked > 0) {
      throw ApiException.conflict("WEB_ACCOUNT_ALREADY_LINKED", "该 Web 账号已绑定其他微信账号");
    }
    List<Long> existing = db.query("SELECT user_id FROM wechat_identity WHERE openid = ? FOR UPDATE",
        (rs, i) -> rs.getLong(1), openid);
    if (!existing.isEmpty()) {
      throw ApiException.conflict("WECHAT_ALREADY_BOUND", "微信身份已绑定其他用户");
    }
    db.update("INSERT INTO wechat_identity (user_id, openid, created_at) VALUES (?, ?, ?)",
        webUserId, openid, Time.now());
    db.update("UPDATE web_binding_code SET used_at = ? WHERE code_hash = ?", Time.now(), sha256(code));
    return AuthPrincipal.ledgerUser(webUserId);
  }

  public WeChatClient.WeChatIdentity exchangeWeChatCode(String loginCode) {
    try {
      return wechat.exchangeLoginCode(loginCode);
    } catch (RuntimeException e) {
      throw ApiException.unauthorized("WECHAT_LOGIN_FAILED", "微信登录失败");
    }
  }

  @Transactional
  public BindingCodeView issueWebBindingCode(long userId, long ledgerId) {
    Long allowed = db.queryForObject(
        "SELECT COUNT(*) FROM ledger_membership lm JOIN ledger l ON l.id = lm.ledger_id "
            + "WHERE lm.user_id = ? AND lm.ledger_id = ? AND lm.active = 1 "
            + "AND lm.web_login_allowed = 1 AND l.is_web_enabled = 1", Long.class, userId, ledgerId);
    if (allowed == null || allowed == 0) {
      throw ApiException.forbidden("BINDING_NOT_ALLOWED", "该用户不支持 Web 绑定");
    }
    Long linked = db.queryForObject(
        "SELECT COUNT(*) FROM web_account_link WHERE ledger_id = ? "
            + "AND (web_user_id = ? OR wechat_user_id = ?)", Long.class, ledgerId, userId, userId);
    if (linked != null && linked > 0) {
      throw ApiException.conflict("WEB_ACCOUNT_ALREADY_LINKED", "该 Web 账号已导入微信");
    }
    byte[] raw = new byte[32];
    random.nextBytes(raw);
    String code = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    String expiresAt = expiresAt(BINDING_TTL_SECONDS);
    db.update("INSERT INTO web_binding_code (user_id, ledger_id, code_hash, expires_at, used_at, created_at) "
            + "VALUES (?, ?, ?, ?, NULL, ?)", userId, ledgerId, sha256(code), expiresAt, Time.now());
    return new BindingCodeView(code, expiresAt);
  }

  @Transactional
  public WebLedgerBindingPreview previewWebLedgerImport(long wechatUserId, String code) {
    Map<String, Object> binding = validBinding(code, false);
    ensureImportAvailable(wechatUserId, binding);
    return preview(binding);
  }

  @Transactional
  public WebLedgerBindingPreview importWebLedger(long wechatUserId, String code) {
    Map<String, Object> binding = validBinding(code, true);
    ensureImportAvailable(wechatUserId, binding);
    WebLedgerBindingPreview imported = preview(binding);
    long webUserId = ((Number) binding.get("user_id")).longValue();
    long ledgerId = ((Number) binding.get("ledger_id")).longValue();
    db.update("UPDATE ledger_membership SET user_id = ?, joined_at = ? WHERE ledger_id = ? AND user_id = ?",
        wechatUserId, Time.now(), ledgerId, webUserId);
    db.update("UPDATE ledger SET created_by_user_id = ? WHERE id = ? AND created_by_user_id = ?",
        wechatUserId, ledgerId, webUserId);
    db.update("INSERT INTO web_account_link (ledger_id, web_user_id, wechat_user_id, created_at) "
            + "VALUES (?, ?, ?, ?)", ledgerId, webUserId, wechatUserId, Time.now());
    db.update("UPDATE web_binding_code SET used_at = ? WHERE code_hash = ?", Time.now(), sha256(code));
    return imported;
  }

  private Map<String, Object> validBinding(String code, boolean lock) {
    if (code == null || code.isBlank()) throw bindingInvalid();
    String suffix = lock ? " FOR UPDATE" : "";
    List<Map<String, Object>> binding = db.queryForList(
        "SELECT user_id, ledger_id, expires_at, used_at FROM web_binding_code WHERE code_hash = ?" + suffix,
        sha256(code));
    if (binding.isEmpty()) throw bindingInvalid();
    Map<String, Object> row = binding.get(0);
    if (row.get("ledger_id") == null || row.get("used_at") != null
        || String.valueOf(row.get("expires_at")).compareTo(Time.now()) <= 0) throw bindingInvalid();
    return row;
  }

  private void ensureImportAvailable(long wechatUserId, Map<String, Object> binding) {
    long webUserId = ((Number) binding.get("user_id")).longValue();
    long ledgerId = ((Number) binding.get("ledger_id")).longValue();
    if (webUserId == wechatUserId) {
      throw ApiException.conflict("LEDGER_ALREADY_IMPORTED", "当前账号已拥有该账本");
    }
    List<Map<String, Object>> source = db.queryForList(
        "SELECT lm.role FROM ledger_membership lm JOIN ledger l ON l.id = lm.ledger_id "
            + "WHERE lm.ledger_id = ? AND lm.user_id = ? AND lm.active = 1 "
            + "AND lm.web_login_allowed = 1 AND l.is_web_enabled = 1",
        ledgerId, webUserId);
    if (source.isEmpty()) throw bindingInvalid();
    Long linked = db.queryForObject(
        "SELECT COUNT(*) FROM web_account_link WHERE ledger_id = ? AND web_user_id = ?",
        Long.class, ledgerId, webUserId);
    if (linked != null && linked > 0) {
      throw ApiException.conflict("WEB_ACCOUNT_ALREADY_LINKED", "该 Web 账号已导入其他微信账号");
    }
    Long existing = db.queryForObject(
        "SELECT COUNT(*) FROM ledger_membership WHERE ledger_id = ? AND user_id = ?",
        Long.class, ledgerId, wechatUserId);
    if (existing != null && existing > 0) {
      throw ApiException.conflict("LEDGER_ALREADY_IMPORTED", "当前微信账号已加入该账本");
    }
  }

  private WebLedgerBindingPreview preview(Map<String, Object> binding) {
    long webUserId = ((Number) binding.get("user_id")).longValue();
    long ledgerId = ((Number) binding.get("ledger_id")).longValue();
    List<WebLedgerBindingPreview> rows = db.query(
        "SELECT l.id, l.name, lm.role FROM ledger l JOIN ledger_membership lm ON lm.ledger_id = l.id "
            + "WHERE l.id = ? AND lm.user_id = ? AND lm.active = 1",
        (rs, i) -> new WebLedgerBindingPreview(rs.getLong("id"), rs.getString("name"), rs.getString("role")),
        ledgerId, webUserId);
    if (rows.isEmpty()) throw bindingInvalid();
    return rows.get(0);
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
