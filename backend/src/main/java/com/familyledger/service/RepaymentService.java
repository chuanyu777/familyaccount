package com.familyledger.service;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Ledger-scoped repayment mutations and their generated expense transactions. */
@Service
public class RepaymentService {
  private final JdbcTemplate db;
  private final AccountService accounts;
  private final LiabilityService liabilities;
  private final CategoryService categories;
  private final LedgerAuthorization authorization;

  public RepaymentService(JdbcTemplate db, AccountService accounts,
      LiabilityService liabilities, CategoryService categories, LedgerAuthorization authorization) {
    this.db = db;
    this.accounts = accounts;
    this.liabilities = liabilities;
    this.categories = categories;
    this.authorization = authorization;
  }

  public List<Map<String, Object>> list(LedgerContext context, Long liabilityId) {
    String sql = "SELECT id, liability_id, amount_cents, occurred_on, account_id, transaction_id, "
        + "created_by_user_id, created_at FROM repayment WHERE ledger_id = ?";
    if (liabilityId != null) sql += " AND liability_id = ?";
    sql += " ORDER BY id";
    Object[] args = liabilityId == null
        ? new Object[] {context.ledgerId()}
        : new Object[] {context.ledgerId(), liabilityId};
    return db.queryForList(sql, args).stream().map(this::toRow).toList();
  }

  @Transactional
  public Map<String, Object> create(AuthPrincipal principal, LedgerContext context,
      Map<String, Object> input) {
    authorization.requireMembership(principal, context.ledgerId());
    long liabilityId = longValue(input.get("liabilityId"));
    Map<String, Object> liability = liabilities.getForRepayment(context, liabilityId);
    long accountId = input.get("accountId") == null
        ? requireDefault(context) : longValue(input.get("accountId"));
    accounts.getForEntry(context, accountId);
    long amount = amount(input.get("amount"), liability);
    String occurred = textOrDefault(input.get("occurredOn"), Time.today());
    String note = input.get("note") == null
        ? "还款 - " + liability.get("name") : String.valueOf(input.get("note"));
    long categoryId = categoryId(context);
    decrementLiability(context, liabilityId, amount);
    long repaymentId = Db.insert(db, "INSERT INTO repayment (ledger_id, liability_id, amount_cents, "
        + "occurred_on, account_id, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        context.ledgerId(), liabilityId, amount, occurred, accountId, principal.userId(), Time.now());
    long transactionId = Db.insert(db, "INSERT INTO txn (ledger_id, type, amount_cents, occurred_on, note, "
        + "account_id, category_id, created_by_user_id, source_type, source_id, created_at) "
        + "VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, 'repayment', ?, ?)",
        context.ledgerId(), amount, occurred, note, accountId, categoryId, principal.userId(), repaymentId, Time.now());
    accounts.applyBalanceDelta(context, accountId, -amount);
    db.update("UPDATE repayment SET transaction_id = ? WHERE id = ? AND ledger_id = ?",
        transactionId, repaymentId, context.ledgerId());
    return row(context, repaymentId);
  }

  @Transactional
  public Map<String, Object> update(AuthPrincipal principal, LedgerContext context, long id,
      Map<String, Object> patch) {
    Map<String, Object> old = repayment(context, id);
    authorization.requireCreatorOrOwner(principal, context.ledgerId(),
        Row.lng(old, "created_by_user_id"));
    long oldAmount = Row.lng(old, "amount_cents");
    long oldLiabilityId = Row.lng(old, "liability_id");
    long oldAccountId = Row.lng(old, "account_id");
    long liabilityId = patch.containsKey("liabilityId")
        ? longValue(patch.get("liabilityId")) : oldLiabilityId;
    Map<String, Object> liability = liabilities.getForRepayment(context, liabilityId);
    Map<String, Object> liabilityForValidation = new LinkedHashMap<>(liability);
    if (liabilityId == oldLiabilityId) {
      liabilityForValidation.put("remainingCents",
          Row.lng(liability, "remainingCents") + oldAmount);
    }
    long accountId = patch.containsKey("accountId")
        ? longValue(patch.get("accountId")) : oldAccountId;
    accounts.getForEntry(context, accountId);
    long amount = patch.containsKey("amount")
        ? amount(patch.get("amount"), liabilityForValidation) : oldAmount;
    String occurred = patch.containsKey("occurredOn")
        ? textOrDefault(patch.get("occurredOn"), Time.today())
        : String.valueOf(old.get("occurred_on"));
    String note = patch.containsKey("note")
        ? (patch.get("note") == null ? null : String.valueOf(patch.get("note")))
        : "还款 - " + liability.get("name");
    long categoryId = categoryId(context);

    incrementLiability(context, oldLiabilityId, oldAmount);
    decrementLiability(context, liabilityId, amount);
    accounts.applyBalanceDelta(context, oldAccountId, oldAmount);
    accounts.applyBalanceDelta(context, accountId, -amount);
    db.update("UPDATE repayment SET liability_id = ?, amount_cents = ?, occurred_on = ?, account_id = ? "
        + "WHERE id = ? AND ledger_id = ?", liabilityId, amount, occurred, accountId, id, context.ledgerId());
    db.update("UPDATE txn SET amount_cents = ?, occurred_on = ?, note = ?, account_id = ?, category_id = ? "
        + "WHERE id = ? AND ledger_id = ? AND source_type = 'repayment'",
        amount, occurred, note, accountId, categoryId, Row.lng(old, "transaction_id"), context.ledgerId());
    return row(context, id);
  }

  @Transactional
  public void delete(AuthPrincipal principal, LedgerContext context, long id) {
    Map<String, Object> repayment = repayment(context, id);
    authorization.requireCreatorOrOwner(principal, context.ledgerId(),
        Row.lng(repayment, "created_by_user_id"));
    long amount = Row.lng(repayment, "amount_cents");
    incrementLiability(context, Row.lng(repayment, "liability_id"), amount);
    accounts.applyBalanceDelta(context, Row.lng(repayment, "account_id"), amount);
    db.update("DELETE FROM txn WHERE id = ? AND ledger_id = ? AND source_type = 'repayment'",
        Row.lng(repayment, "transaction_id"), context.ledgerId());
    db.update("DELETE FROM repayment WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
  }

  private long categoryId(LedgerContext context) {
    return Row.lng(categories.upsert(context, "expense", "还款"), "id");
  }

  private void decrementLiability(LedgerContext context, long liabilityId, long amount) {
    int updated = db.update("UPDATE liability SET remaining_cents = remaining_cents - ? "
        + "WHERE id = ? AND ledger_id = ? AND archived = 0 AND remaining_cents >= ?",
        amount, liabilityId, context.ledgerId(), amount);
    if (updated != 1) throw ApiException.conflict("LIABILITY_BALANCE_CHANGED", "负债剩余金额不足");
  }

  private void incrementLiability(LedgerContext context, long liabilityId, long amount) {
    int updated = db.update("UPDATE liability SET remaining_cents = remaining_cents + ? "
        + "WHERE id = ? AND ledger_id = ?", amount, liabilityId, context.ledgerId());
    if (updated != 1) throw ApiException.notFound("LIABILITY_NOT_FOUND", "负债不存在");
  }

  private Map<String, Object> repayment(LedgerContext context, long id) {
    List<Map<String, Object>> rows = db.queryForList("SELECT id, liability_id, amount_cents, occurred_on, "
        + "account_id, transaction_id, created_by_user_id, created_at FROM repayment "
        + "WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
    if (rows.isEmpty()) throw ApiException.notFound("REPAYMENT_NOT_FOUND", "还款不存在");
    return rows.get(0);
  }

  private Map<String, Object> row(LedgerContext context, long id) {
    return toRow(repayment(context, id));
  }

  private long requireDefault(LedgerContext context) {
    Long id = accounts.defaultAccountId(context);
    if (id == null) throw ApiException.notFound("ACCOUNT_NOT_FOUND", "缺少默认账户");
    return id;
  }

  private static long amount(Object value, Map<String, Object> liability) {
    long cents;
    if (value == null) {
      cents = Row.lng(liability, "monthlyPaymentCents");
      if (cents == 0) throw ApiException.badRequest("VALIDATION_FAILED", "月供为 0，必须指定还款金额");
    } else {
      try { cents = Money.toCents(value); }
      catch (IllegalArgumentException e) { throw ApiException.badRequest("VALIDATION_FAILED", "还款金额格式非法"); }
    }
    long remaining = Row.lng(liability, "remainingCents");
    if (cents <= 0 || cents > remaining) throw ApiException.badRequest("VALIDATION_FAILED", "还款金额非法");
    return cents;
  }

  private static long longValue(Object value) {
    if (value instanceof Number n) return n.longValue();
    try { return Long.parseLong(String.valueOf(value)); }
    catch (NumberFormatException e) { throw ApiException.badRequest("VALIDATION_FAILED", "ID格式非法"); }
  }

  private static String textOrDefault(Object value, String fallback) {
    if (value == null) return fallback;
    String text = String.valueOf(value).trim();
    return text.isEmpty() ? fallback : text;
  }

  private Map<String, Object> toRow(Map<String, Object> r) {
    long amount = Row.lng(r, "amount_cents");
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", Row.lng(r, "id"));
    out.put("liability_id", Row.lng(r, "liability_id"));
    out.put("amount_cents", amount);
    out.put("amount", Money.toYuanString(amount));
    out.put("occurred_on", Row.str(r, "occurred_on"));
    out.put("account_id", Row.lng(r, "account_id"));
    out.put("transaction_id", Row.lngOrNull(r, "transaction_id"));
    out.put("created_by_user_id", Row.lng(r, "created_by_user_id"));
    out.put("created_at", Row.str(r, "created_at"));
    return out;
  }
}
