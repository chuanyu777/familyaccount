package com.familyledger.platform;

import com.familyledger.common.ApiException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Read-only projections for platform administrators. */
@Service
public class PlatformAdminQueryService {
  private final JdbcTemplate db;

  public PlatformAdminQueryService(JdbcTemplate db) {
    this.db = db;
  }

  public List<PlatformLedgerSummary> listLedgers(String query) {
    String normalized = query == null ? "" : query.trim();
    String sql = "SELECT l.id, l.name, l.created_at, l.created_by_user_id AS owner_user_id, "
        + "u.display_name AS owner_display_name, l.is_web_enabled, "
        + "COALESCE(m.member_count, 0) AS member_count "
        + "FROM ledger l JOIN app_user u ON u.id = l.created_by_user_id "
        + "LEFT JOIN (SELECT ledger_id, COUNT(*) AS member_count FROM ledger_membership "
        + "WHERE active = 1 GROUP BY ledger_id) m ON m.ledger_id = l.id";
    Object[] args = new Object[0];
    if (!normalized.isEmpty()) {
      long id = -1;
      try {
        id = Long.parseLong(normalized);
      } catch (NumberFormatException ignored) {
        // Non-numeric or out-of-range queries still search ledger names.
      }
      sql += " WHERE (l.name LIKE ? OR l.id = ?)";
      args = new Object[] {"%" + normalized + "%", id > 0 ? id : -1};
    }
    sql += " ORDER BY l.id";
    return db.query(sql, (rs, rowNum) -> new PlatformLedgerSummary(
        rs.getLong("id"), rs.getString("name"), rs.getString("created_at"),
        rs.getLong("owner_user_id"), rs.getString("owner_display_name"),
        rs.getLong("member_count"), rs.getInt("is_web_enabled") == 1), args);
  }

  public PlatformLedgerView readLedger(long ledgerId) {
    List<Map<String, Object>> ledgerRows = db.query(
        "SELECT id, name, is_web_enabled, created_by_user_id, created_at FROM ledger WHERE id = ?",
        (rs, rowNum) -> {
          Map<String, Object> row = new LinkedHashMap<>();
          row.put("id", rs.getLong("id"));
          row.put("name", rs.getString("name"));
          row.put("isWebEnabled", rs.getInt("is_web_enabled"));
          row.put("createdByUserId", rs.getLong("created_by_user_id"));
          row.put("createdAt", rs.getString("created_at"));
          return row;
        }, ledgerId);
    if (ledgerRows.isEmpty()) throw ApiException.notFound("LEDGER_NOT_FOUND", "账本不存在");

    List<Map<String, Object>> members = rows(
        "SELECT lm.id, lm.user_id, u.display_name, lm.role, lm.web_login_allowed, lm.active, lm.joined_at "
            + "FROM ledger_membership lm JOIN app_user u ON u.id = lm.user_id "
            + "WHERE lm.ledger_id = ? ORDER BY lm.id", ledgerId);
    List<Map<String, Object>> accounts = rows(
        "SELECT id, name, balance_cents, is_default, archived, created_at FROM account "
            + "WHERE ledger_id = ? ORDER BY id", ledgerId);
    List<Map<String, Object>> categories = rows(
        "SELECT id, kind, name, archived, created_at FROM category WHERE ledger_id = ? ORDER BY id",
        ledgerId);
    List<Map<String, Object>> transactions = rows(
        "SELECT id, type, amount_cents, occurred_on, note, account_id, to_account_id, category_id, "
            + "created_by_user_id, source_type, source_id, created_at FROM txn "
            + "WHERE ledger_id = ? ORDER BY occurred_on DESC, id DESC", ledgerId);
    List<Map<String, Object>> assets = rows(
        "SELECT id, name, value_cents, kind, archived, updated_at FROM asset WHERE ledger_id = ? ORDER BY id",
        ledgerId);
    List<Map<String, Object>> liabilities = rows(
        "SELECT id, name, remaining_cents, monthly_payment_cents, payment_day, archived, created_at "
            + "FROM liability WHERE ledger_id = ? ORDER BY id", ledgerId);
    List<Map<String, Object>> repayments = rows(
        "SELECT id, liability_id, amount_cents, occurred_on, account_id, transaction_id, "
            + "created_by_user_id, created_at FROM repayment WHERE ledger_id = ? "
            + "ORDER BY occurred_on DESC, id DESC", ledgerId);
    List<Map<String, Object>> snapshots = rows(
        "SELECT id, asset_id, snap_month, value_cents, note, recorded_at FROM asset_snapshot "
            + "WHERE ledger_id = ? ORDER BY snap_month DESC, id DESC", ledgerId);

    Map<String, Object> analysis = new LinkedHashMap<>();
    analysis.put("memberCount", members.stream().filter(row -> number(row.get("active")) == 1).count());
    analysis.put("transactionCount", transactions.size());
    analysis.put("repaymentCount", repayments.size());
    long income = scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM txn WHERE ledger_id = ? AND type = 'income'", ledgerId);
    long expense = scalar("SELECT COALESCE(SUM(amount_cents), 0) FROM txn WHERE ledger_id = ? AND type = 'expense'", ledgerId);
    analysis.put("incomeCents", income);
    analysis.put("expenseCents", expense);
    analysis.put("netCents", income - expense);
    analysis.put("accountBalanceCents", scalar("SELECT COALESCE(SUM(balance_cents), 0) FROM account WHERE ledger_id = ?", ledgerId));
    analysis.put("assetValueCents", scalar("SELECT COALESCE(SUM(value_cents), 0) FROM asset WHERE ledger_id = ?", ledgerId));
    analysis.put("liabilityRemainingCents", scalar("SELECT COALESCE(SUM(remaining_cents), 0) FROM liability WHERE ledger_id = ?", ledgerId));

    return new PlatformLedgerView(ledgerRows.get(0), members, accounts, categories,
        transactions, assets, liabilities, repayments, snapshots, analysis);
  }

  private List<Map<String, Object>> rows(String sql, Object... args) {
    return db.queryForList(sql, args).stream().map(this::camelize).toList();
  }

  private long scalar(String sql, long ledgerId) {
    Number value = db.queryForObject(sql, Number.class, ledgerId);
    return value == null ? 0L : value.longValue();
  }

  private Map<String, Object> camelize(Map<String, Object> row) {
    Map<String, Object> out = new LinkedHashMap<>();
    row.forEach((key, value) -> out.put(toCamelCase(key), value));
    return out;
  }

  private static String toCamelCase(String key) {
    StringBuilder out = new StringBuilder(key.length());
    boolean upper = false;
    for (char ch : key.toCharArray()) {
      if (ch == '_') {
        upper = true;
      } else if (upper) {
        out.append(Character.toUpperCase(ch));
        upper = false;
      } else {
        out.append(Character.toLowerCase(ch));
      }
    }
    return out.toString();
  }

  private static long number(Object value) {
    return value instanceof Number number ? number.longValue() : Long.parseLong(String.valueOf(value));
  }
}
