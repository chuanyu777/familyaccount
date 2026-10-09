package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 资金账户。 */
@Service
public class AccountService {
  private final JdbcTemplate db;
  private final LedgerAuthorization authorization;

  public AccountService(JdbcTemplate db, LedgerAuthorization authorization) {
    this.db = db;
    this.authorization = authorization;
  }

  public List<Map<String, Object>> list(LedgerContext context) {
    return db.queryForList("SELECT id, name, balance_cents, is_default, archived, created_at "
            + "FROM account WHERE ledger_id = ? ORDER BY id", context.ledgerId())
        .stream().map(this::toLedgerRow).toList();
  }

  public Map<String, Object> get(LedgerContext context, long id) {
    return toLedgerRow(fetchLedger(context, id));
  }

  public Map<String, Object> getForEntry(LedgerContext context, long id) {
    Map<String, Object> row = fetchLedger(context, id);
    if (Row.intOrNull(row, "archived") != null && Row.intOrNull(row, "archived") == 1) {
      throw ApiException.conflict("ACCOUNT_ARCHIVED", "账户已归档");
    }
    return toLedgerRow(row);
  }

  public Map<String, Object> create(LedgerContext context, String name) {
    return create(context, name, null);
  }

  public Map<String, Object> create(LedgerContext context, String name, Long balanceCents) {
    String normalized = requiredName(name, "账户");
    long balance = balanceCents == null ? 0 : balanceCents;
    long id = Db.insert(db, "INSERT INTO account "
        + "(ledger_id, name, balance_cents, is_default, archived, created_at) VALUES (?, ?, ?, 0, 0, ?)",
        context.ledgerId(), normalized, balance, Time.now());
    return get(context, id);
  }

  public Map<String, Object> update(LedgerContext context, long id, Map<String, Object> patch) {
    fetchLedger(context, id);
    if (patch != null && patch.containsKey("name")) {
      db.update("UPDATE account SET name = ? WHERE id = ? AND ledger_id = ?",
          requiredName(String.valueOf(patch.get("name")), "账户"), id, context.ledgerId());
    }
    return get(context, id);
  }

  public Long defaultAccountId(LedgerContext context) {
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id FROM account WHERE ledger_id = ? AND is_default = 1 AND archived = 0",
        context.ledgerId());
    return rows.isEmpty() ? null : Row.lng(rows.get(0), "id");
  }

  public Map<String, Object> calibrate(LedgerContext context, long id, long cents) {
    getForEntry(context, id);
    int updated = db.update("UPDATE account SET balance_cents = ? WHERE id = ? AND ledger_id = ? AND archived = 0",
        cents, id, context.ledgerId());
    if (updated != 1) throw ApiException.conflict("ACCOUNT_ARCHIVED", "账户已归档");
    return get(context, id);
  }

  public void applyBalanceDelta(LedgerContext context, long id, long cents) {
    getForEntry(context, id);
    int updated = db.update("UPDATE account SET balance_cents = balance_cents + ? "
        + "WHERE id = ? AND ledger_id = ? AND archived = 0", cents, id, context.ledgerId());
    if (updated != 1) throw ApiException.notFound("ACCOUNT_NOT_FOUND", "账户不存在");
  }

  /** Only for authorized corrections of an existing record's historical account reference. */
  void applyHistoricalBalanceDelta(LedgerContext context, long id, long cents) {
    int updated = db.update("UPDATE account SET balance_cents = balance_cents + ? "
        + "WHERE id = ? AND ledger_id = ?", cents, id, context.ledgerId());
    if (updated != 1) throw ApiException.notFound("ACCOUNT_NOT_FOUND", "账户不存在");
  }

  public void archive(LedgerContext context, long id) {
    authorization.requireOwner(AuthPrincipal.ledgerUser(context.userId()), context.ledgerId());
    fetchLedger(context, id);
    db.update("UPDATE account SET archived = 1 WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
  }

  public void restore(LedgerContext context, long id) {
    authorization.requireOwner(AuthPrincipal.ledgerUser(context.userId()), context.ledgerId());
    fetchLedger(context, id);
    db.update("UPDATE account SET archived = 0 WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
  }

  private Map<String, Object> fetchLedger(LedgerContext context, long id) {
    List<Map<String, Object>> rows = db.queryForList("SELECT id, name, balance_cents, is_default, archived, created_at "
        + "FROM account WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
    if (rows.isEmpty()) throw ApiException.notFound("ACCOUNT_NOT_FOUND", "账户 " + id + " 不存在");
    return rows.get(0);
  }

  private Map<String, Object> toLedgerRow(Map<String, Object> r) {
    Map<String, Object> out = new LinkedHashMap<>();
    long balance = Row.lng(r, "balance_cents");
    out.put("id", Row.lng(r, "id"));
    out.put("name", Row.str(r, "name"));
    out.put("balanceCents", balance);
    out.put("balance", Money.toYuanString(balance));
    out.put("isDefault", Row.intOrNull(r, "is_default"));
    out.put("archived", Row.intOrNull(r, "archived"));
    out.put("createdAt", Row.str(r, "created_at"));
    return out;
  }

  private static String requiredName(String name, String label) {
    if (name == null || name.trim().isEmpty()) {
      throw ApiException.badRequest("VALIDATION_FAILED", label + "名称不能为空");
    }
    return name.trim();
  }

}
