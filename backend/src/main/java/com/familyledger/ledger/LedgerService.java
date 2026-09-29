package com.familyledger.ledger;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Time;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service("ledgerDomainService")
public class LedgerService {
  private final JdbcTemplate db;
  private final LedgerAuthorization authorization;

  public LedgerService(JdbcTemplate db, LedgerAuthorization authorization) {
    this.db = db;
    this.authorization = authorization;
  }

  @Transactional
  public LedgerSummary createLedger(long userId, String name) {
    String normalized = normalizedName(name);
    String now = Time.now();
    long ledgerId = Db.insert(db,
        "INSERT INTO ledger (name, is_web_enabled, created_by_user_id, created_at) VALUES (?, 0, ?, ?)",
        normalized, userId, now);
    db.update("INSERT INTO ledger_membership "
        + "(ledger_id, user_id, role, web_login_allowed, active, joined_at) VALUES (?, ?, 'OWNER', 0, 1, ?)",
        ledgerId, userId, now);
    initializeResources(ledgerId, now);
    return new LedgerSummary(ledgerId, normalized, "OWNER", false);
  }

  public List<LedgerSummary> listForUser(long userId) {
    return db.query("SELECT l.id, l.name, l.is_web_enabled, lm.role "
            + "FROM ledger l JOIN ledger_membership lm ON lm.ledger_id = l.id "
            + "WHERE lm.user_id = ? AND lm.active = 1 ORDER BY l.id",
        (rs, i) -> new LedgerSummary(rs.getLong("id"), rs.getString("name"),
            rs.getString("role"), rs.getInt("is_web_enabled") == 1), userId);
  }

  public LedgerSummary getForUser(AuthPrincipal principal, long ledgerId) {
    LedgerContext context = authorization.requireMembership(principal, ledgerId);
    List<LedgerSummary> summaries = db.query("SELECT id, name, is_web_enabled FROM ledger WHERE id = ?",
        (rs, i) -> new LedgerSummary(rs.getLong("id"), rs.getString("name"), context.role(),
            rs.getInt("is_web_enabled") == 1), ledgerId);
    if (summaries.isEmpty()) throw ApiException.notFound("LEDGER_NOT_FOUND", "账本不存在");
    return summaries.get(0);
  }

  public LedgerSummary rename(AuthPrincipal principal, long ledgerId, String name) {
    LedgerContext context = authorization.requireOwner(principal, ledgerId);
    String normalized = normalizedName(name);
    db.update("UPDATE ledger SET name = ? WHERE id = ?", normalized, ledgerId);
    return new LedgerSummary(ledgerId, normalized, context.role(),
        db.queryForObject("SELECT is_web_enabled FROM ledger WHERE id = ?", Integer.class, ledgerId) == 1);
  }

  private void initializeResources(long ledgerId, String now) {
    db.update("INSERT INTO account (ledger_id, name, balance_cents, is_default, archived, created_at) "
        + "VALUES (?, '默认账户', 0, 1, 0, ?)", ledgerId, now);
    db.update("INSERT INTO category (ledger_id, kind, name, archived, created_at) VALUES "
        + "(?, 'expense', '其他', 0, ?), (?, 'income', '其他收入', 0, ?)", ledgerId, now, ledgerId, now);
  }

  private static String normalizedName(String name) {
    if (name == null || name.trim().isEmpty()) {
      throw ApiException.badRequest("VALIDATION_FAILED", "账本名称不能为空");
    }
    return name.trim();
  }
}
