package com.familyledger.ledger;

import com.familyledger.auth.AuthPrincipal;
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
public class InvitationService {
  private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
  private static final long TTL_DAYS = 7;

  private final JdbcTemplate db;
  private final LedgerAuthorization authorization;
  private final SecureRandom random = new SecureRandom();

  public InvitationService(JdbcTemplate db, LedgerAuthorization authorization) {
    this.db = db;
    this.authorization = authorization;
  }

  @Transactional
  public InvitationView create(long ownerId, long ledgerId) {
    authorization.requireOwner(AuthPrincipal.ledgerUser(ownerId), ledgerId);
    byte[] bytes = new byte[32];
    random.nextBytes(bytes);
    String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    String expiresAt = LocalDateTime.now().plusDays(TTL_DAYS).format(TIMESTAMP);
    long id = Db.insert(db, "INSERT INTO ledger_invitation "
            + "(ledger_id, created_by_user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
        ledgerId, ownerId, hash(token), expiresAt, Time.now());
    return new InvitationView(id, ledgerId, token, expiresAt);
  }

  @Transactional
  public LedgerMembershipView accept(long userId, String token) {
    if (token == null || token.isBlank()) throw invitationInvalid();
    List<Map<String, Object>> invitations = db.queryForList(
        "SELECT id, ledger_id, expires_at, revoked_at, accepted_at, accepted_by_user_id "
            + "FROM ledger_invitation WHERE token_hash = ? FOR UPDATE", hash(token));
    if (invitations.isEmpty()) throw invitationInvalid();
    Map<String, Object> invitation = invitations.get(0);
    long ledgerId = ((Number) invitation.get("ledger_id")).longValue();
    if (invitation.get("accepted_at") != null) {
      Object acceptedBy = invitation.get("accepted_by_user_id");
      if (acceptedBy != null && ((Number) acceptedBy).longValue() == userId) {
        return membership(ledgerId, userId);
      }
      throw invitationInvalid();
    }
    if (invitation.get("revoked_at") != null
        || String.valueOf(invitation.get("expires_at")).compareTo(Time.now()) <= 0) {
      throw invitationInvalid();
    }
    List<Map<String, Object>> existing = db.queryForList(
        "SELECT id, role, active FROM ledger_membership WHERE ledger_id = ? AND user_id = ?",
        ledgerId, userId);
    if (existing.isEmpty()) {
      db.update("INSERT INTO ledger_membership "
          + "(ledger_id, user_id, role, web_login_allowed, active, joined_at) VALUES (?, ?, 'MEMBER', 0, 1, ?)",
          ledgerId, userId, Time.now());
    } else if (((Number) existing.get(0).get("active")).intValue() == 0) {
      db.update("UPDATE ledger_membership SET role = 'MEMBER', active = 1, joined_at = ? WHERE id = ?",
          Time.now(), ((Number) existing.get(0).get("id")).longValue());
    }
    db.update("UPDATE ledger_invitation SET accepted_at = ?, accepted_by_user_id = ? WHERE id = ?",
        Time.now(), userId, ((Number) invitation.get("id")).longValue());
    return membership(ledgerId, userId);
  }

  @Transactional
  public void revoke(long ownerId, long invitationId) {
    Long ledgerId = db.queryForObject("SELECT ledger_id FROM ledger_invitation WHERE id = ?",
        Long.class, invitationId);
    if (ledgerId == null) throw ApiException.notFound("INVITATION_NOT_FOUND", "邀请不存在");
    authorization.requireOwner(AuthPrincipal.ledgerUser(ownerId), ledgerId);
    db.update("UPDATE ledger_invitation SET revoked_at = ? WHERE id = ? AND accepted_at IS NULL",
        Time.now(), invitationId);
  }

  private LedgerMembershipView membership(long ledgerId, long userId) {
    List<LedgerMembershipView> rows = db.query("SELECT lm.id, lm.role, lm.active, u.display_name "
            + "FROM ledger_membership lm JOIN app_user u ON u.id = lm.user_id "
            + "WHERE lm.ledger_id = ? AND lm.user_id = ?",
        (rs, i) -> new LedgerMembershipView(rs.getLong("id"), ledgerId, userId,
            rs.getString("role"), rs.getInt("active") == 1, rs.getString("display_name")),
        ledgerId, userId);
    if (rows.isEmpty() || !rows.get(0).active()) throw invitationInvalid();
    return rows.get(0);
  }

  private static ApiException invitationInvalid() {
    return ApiException.conflict("INVITATION_INVALID", "邀请无效、已过期或已被使用");
  }

  private static String hash(String value) {
    try {
      return Base64.getUrlEncoder().withoutPadding().encodeToString(
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException("SHA-256 不可用", e);
    }
  }
}
