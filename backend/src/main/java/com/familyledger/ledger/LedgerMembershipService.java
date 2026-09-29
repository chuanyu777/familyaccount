package com.familyledger.ledger;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.common.Time;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LedgerMembershipService {
  private final JdbcTemplate db;
  private final LedgerAuthorization authorization;

  public LedgerMembershipService(JdbcTemplate db, LedgerAuthorization authorization) {
    this.db = db;
    this.authorization = authorization;
  }

  public List<LedgerMembershipView> list(long userId, long ledgerId) {
    authorization.requireMembership(AuthPrincipal.ledgerUser(userId), ledgerId);
    return db.query("SELECT lm.id, lm.user_id, lm.role, lm.active, u.display_name "
            + "FROM ledger_membership lm JOIN app_user u ON u.id = lm.user_id "
            + "WHERE lm.ledger_id = ? ORDER BY lm.id",
        (rs, i) -> new LedgerMembershipView(rs.getLong("id"), ledgerId, rs.getLong("user_id"),
            rs.getString("role"), rs.getInt("active") == 1, rs.getString("display_name")), ledgerId);
  }

  @Transactional
  public void remove(long ownerId, long membershipId) {
    LedgerMembershipTarget target = target(membershipId);
    authorization.requireOwner(AuthPrincipal.ledgerUser(ownerId), target.ledgerId());
    if ("OWNER".equals(target.role())) {
      throw ApiException.conflict("OWNER_CANNOT_BE_REMOVED", "账本所有者不能被移除");
    }
    db.update("UPDATE ledger_membership SET active = 0 WHERE id = ?", membershipId);
  }

  @Transactional
  public void leave(long userId, long ledgerId) {
    LedgerContext context = authorization.requireMembership(AuthPrincipal.ledgerUser(userId), ledgerId);
    if (context.isOwner()) throw ApiException.conflict("OWNER_CANNOT_LEAVE", "账本所有者不能退出");
    db.update("UPDATE ledger_membership SET active = 0 WHERE ledger_id = ? AND user_id = ?",
        ledgerId, userId);
  }

  private LedgerMembershipTarget target(long membershipId) {
    List<LedgerMembershipTarget> rows = db.query("SELECT ledger_id, role FROM ledger_membership WHERE id = ?",
        (rs, i) -> new LedgerMembershipTarget(rs.getLong("ledger_id"), rs.getString("role")), membershipId);
    if (rows.isEmpty()) throw ApiException.notFound("MEMBERSHIP_NOT_FOUND", "成员关系不存在");
    return rows.get(0);
  }

  private record LedgerMembershipTarget(long ledgerId, String role) {}
}
