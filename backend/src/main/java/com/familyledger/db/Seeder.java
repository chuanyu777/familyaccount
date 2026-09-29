package com.familyledger.db;

import com.familyledger.common.Time;
import java.security.SecureRandom;
import java.security.spec.KeySpec;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 初始化固定特殊账本及其预置身份，幂等且只写入新多租户 schema。 */
@Component
public class Seeder {
  private static final int HASH_ITERATIONS = 120_000;
  private static final int HASH_BITS = 256;

  private final JdbcTemplate db;
  private final String ledgerName;
  private final String adminUsername;
  private final String adminPassword;
  private final String ownerDisplayName;
  private final String ownerUsername;
  private final String ownerPassword;
  private final String memberDisplayName;
  private final String memberUsername;
  private final String memberPassword;

  public Seeder(
      JdbcTemplate db,
      @Value("${familyledger.seed.special-ledger-name:}") String ledgerName,
      @Value("${familyledger.seed.platform-admin.username:}") String adminUsername,
      @Value("${familyledger.seed.platform-admin.password:}") String adminPassword,
      @Value("${familyledger.seed.owner.display-name:本人}") String ownerDisplayName,
      @Value("${familyledger.seed.owner.username:}") String ownerUsername,
      @Value("${familyledger.seed.owner.password:}") String ownerPassword,
      @Value("${familyledger.seed.member.display-name:配偶}") String memberDisplayName,
      @Value("${familyledger.seed.member.username:}") String memberUsername,
      @Value("${familyledger.seed.member.password:}") String memberPassword) {
    this.db = db;
    this.ledgerName = required("special-ledger-name", ledgerName);
    this.adminUsername = required("platform-admin.username", adminUsername);
    this.adminPassword = required("platform-admin.password", adminPassword);
    this.ownerDisplayName = required("owner.display-name", ownerDisplayName);
    this.ownerUsername = required("owner.username", ownerUsername);
    this.ownerPassword = required("owner.password", ownerPassword);
    this.memberDisplayName = required("member.display-name", memberDisplayName);
    this.memberUsername = required("member.username", memberUsername);
    this.memberPassword = required("member.password", memberPassword);
  }

  @Transactional
  public void ensureSeeded() {
    Long existing = db.queryForObject(
        "SELECT COUNT(*) FROM ledger WHERE is_web_enabled = 1", Long.class);
    if (existing != null && existing > 0) return;

    String ts = Time.now();
    long ownerId = insertUser(ownerDisplayName, ts);
    long memberId = insertUser(memberDisplayName, ts);
    long ledgerId = insertLedger(ledgerName, ownerId, ts);

    db.update("INSERT INTO ledger_membership "
        + "(ledger_id, user_id, role, web_login_allowed, active, joined_at) "
        + "VALUES (?, ?, 'OWNER', 1, 1, ?)", ledgerId, ownerId, ts);
    db.update("INSERT INTO ledger_membership "
        + "(ledger_id, user_id, role, web_login_allowed, active, joined_at) "
        + "VALUES (?, ?, 'MEMBER', 1, 1, ?)", ledgerId, memberId, ts);
    db.update("INSERT INTO web_credential "
        + "(user_id, username, password_hash, enabled, created_at) VALUES (?, ?, ?, 1, ?)",
        ownerId, ownerUsername, hashPassword(ownerPassword), ts);
    db.update("INSERT INTO web_credential "
        + "(user_id, username, password_hash, enabled, created_at) VALUES (?, ?, ?, 1, ?)",
        memberId, memberUsername, hashPassword(memberPassword), ts);
    db.update("INSERT INTO platform_admin "
        + "(username, password_hash, enabled, created_at) VALUES (?, ?, 1, ?)",
        adminUsername, hashPassword(adminPassword), ts);
    db.update("INSERT INTO account "
        + "(ledger_id, name, balance_cents, is_default, archived, created_at) "
        + "VALUES (?, '默认账户', 0, 1, 0, ?)", ledgerId, ts);
    db.update("INSERT INTO category (ledger_id, kind, name, archived, created_at) "
        + "VALUES (?, 'expense', '其他', 0, ?)", ledgerId, ts);
    db.update("INSERT INTO category (ledger_id, kind, name, archived, created_at) "
        + "VALUES (?, 'income', '其他收入', 0, ?)", ledgerId, ts);
  }

  private long insertUser(String displayName, String timestamp) {
    KeyHolder keys = new GeneratedKeyHolder();
    db.update(connection -> {
      var statement = connection.prepareStatement(
          "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", new String[] {"id"});
      statement.setString(1, displayName);
      statement.setString(2, timestamp);
      return statement;
    }, keys);
    return generatedId(keys, "app_user");
  }

  private long insertLedger(String name, long ownerId, String timestamp) {
    KeyHolder keys = new GeneratedKeyHolder();
    db.update(connection -> {
      var statement = connection.prepareStatement(
          "INSERT INTO ledger (name, is_web_enabled, created_by_user_id, created_at) "
              + "VALUES (?, 1, ?, ?)", new String[] {"id"});
      statement.setString(1, name);
      statement.setLong(2, ownerId);
      statement.setString(3, timestamp);
      return statement;
    }, keys);
    return generatedId(keys, "ledger");
  }

  private static long generatedId(KeyHolder keys, String table) {
    Number key = keys.getKey();
    if (key == null) throw new IllegalStateException("无法取得 " + table + " 主键");
    return key.longValue();
  }

  private static String required(String name, String value) {
    String normalized = value == null ? "" : value.trim();
    if (normalized.isEmpty()) {
      throw new IllegalStateException("缺少种子配置：familyledger.seed." + name);
    }
    return normalized;
  }

  /** PBKDF2 format is shared with the later authentication implementation. */
  private static String hashPassword(String password) {
    try {
      byte[] salt = new byte[16];
      new SecureRandom().nextBytes(salt);
      KeySpec spec = new PBEKeySpec(password.toCharArray(), salt, HASH_ITERATIONS, HASH_BITS);
      byte[] hash = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
          .generateSecret(spec).getEncoded();
      return "pbkdf2-sha256$" + HASH_ITERATIONS + "$"
          + Base64.getEncoder().encodeToString(salt) + "$"
          + Base64.getEncoder().encodeToString(hash);
    } catch (Exception e) {
      throw new IllegalStateException("密码哈希失败", e);
    }
  }
}
