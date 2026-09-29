package com.familyledger.ledger;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.auth.PrincipalType;
import com.familyledger.common.ApiException;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class LedgerAuthorization {
  private final JdbcTemplate db;

  public LedgerAuthorization(JdbcTemplate db) { this.db = db; }

  public LedgerContext requireMembership(AuthPrincipal principal, long ledgerId) {
    if (principal == null || principal.type() != PrincipalType.LEDGER_USER) {
      throw ApiException.forbidden("LEDGER_MEMBERSHIP_REQUIRED", "需要账本成员身份");
    }
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT lm.user_id, lm.role, lm.web_login_allowed "
            + "FROM ledger_membership lm JOIN ledger l ON l.id = lm.ledger_id "
            + "WHERE lm.ledger_id = ? AND lm.user_id = ? AND lm.active = 1",
        ledgerId, principal.userId());
    if (rows.isEmpty()) {
      throw ApiException.forbidden("LEDGER_MEMBERSHIP_REQUIRED", "不是该账本的有效成员");
    }
    Map<String, Object> row = rows.get(0);
    return new LedgerContext(ledgerId, ((Number) row.get("user_id")).longValue(),
        String.valueOf(row.get("role")), ((Number) row.get("web_login_allowed")).intValue() == 1);
  }

  public LedgerContext requireOwner(AuthPrincipal principal, long ledgerId) {
    LedgerContext context = requireMembership(principal, ledgerId);
    if (!context.isOwner()) throw ApiException.forbidden("LEDGER_OWNER_REQUIRED", "需要账本所有者权限");
    return context;
  }

  public LedgerContext requireCreatorOrOwner(AuthPrincipal principal, long ledgerId, long createdByUserId) {
    LedgerContext context = requireMembership(principal, ledgerId);
    if (!context.isOwner() && context.userId() != createdByUserId) {
      throw ApiException.forbidden("RECORD_CREATOR_REQUIRED", "只能修改自己创建的记录");
    }
    return context;
  }
}
