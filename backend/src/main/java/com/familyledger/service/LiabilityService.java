package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.MonthUtil;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 负债：本金/月供/还款日，含月末余额反推与级联删除。 */
@Service
public class LiabilityService {
  private final JdbcTemplate db;
  private final AccountService accounts;
  private final LedgerAuthorization authorization;

  public LiabilityService(JdbcTemplate db, AccountService accounts, LedgerAuthorization authorization) {
    this.db = db;
    this.accounts = accounts;
    this.authorization = authorization;
  }

  public List<Map<String, Object>> list(LedgerContext context) {
    return db.queryForList("SELECT id, name, remaining_cents, monthly_payment_cents, payment_day, archived, created_at "
            + "FROM liability WHERE ledger_id = ? ORDER BY id", context.ledgerId())
        .stream().map(this::toLedgerRow).toList();
  }

  public Map<String, Object> get(LedgerContext context, long id) { return toLedgerRow(fetchLedger(context, id)); }

  public Map<String, Object> getForRepayment(LedgerContext context, long id) {
    Map<String, Object> row = fetchLedger(context, id);
    if (Row.intOrNull(row, "archived") != null && Row.intOrNull(row, "archived") == 1) {
      throw ApiException.conflict("LIABILITY_ARCHIVED", "负债已归档");
    }
    return toLedgerRow(row);
  }

  public Map<String, Object> create(LedgerContext context, Map<String, Object> input) {
    String name = requiredName(input.get("name"));
    long remaining = parseCents(input.get("remaining"), "本金");
    long monthly = input.get("monthlyPayment") == null ? 0 : parseCents(input.get("monthlyPayment"), "月供");
    Integer day = input.get("paymentDay") == null ? null : parsePaymentDay(input.get("paymentDay"));
    if (remaining < 0 || monthly < 0) throw ApiException.badRequest("VALIDATION_FAILED", "负债金额不能为负");
    long id = Db.insert(db, "INSERT INTO liability (ledger_id, name, remaining_cents, monthly_payment_cents, "
        + "payment_day, archived, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)", context.ledgerId(), name, remaining, monthly, day, Time.now());
    return get(context, id);
  }

  public Map<String, Object> update(LedgerContext context, long id, Map<String, Object> patch) {
    fetchLedger(context, id);
    if (patch.containsKey("name")) db.update("UPDATE liability SET name = ? WHERE id = ? AND ledger_id = ?",
        requiredName(patch.get("name")), id, context.ledgerId());
    if (patch.containsKey("remaining")) db.update("UPDATE liability SET remaining_cents = ? WHERE id = ? AND ledger_id = ?",
        parseNonNegative(patch.get("remaining"), "本金"), id, context.ledgerId());
    if (patch.containsKey("monthlyPayment")) db.update("UPDATE liability SET monthly_payment_cents = ? WHERE id = ? AND ledger_id = ?",
        parseNonNegative(patch.get("monthlyPayment"), "月供"), id, context.ledgerId());
    if (patch.containsKey("paymentDay")) db.update("UPDATE liability SET payment_day = ? WHERE id = ? AND ledger_id = ?",
        patch.get("paymentDay") == null ? null : parsePaymentDay(patch.get("paymentDay")), id, context.ledgerId());
    return get(context, id);
  }

  public void archive(LedgerContext context, long id) {
    authorization.requireOwner(AuthPrincipal.ledgerUser(context.userId()), context.ledgerId());
    fetchLedger(context, id); db.update("UPDATE liability SET archived = 1 WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
  }

  public void restore(LedgerContext context, long id) {
    authorization.requireOwner(AuthPrincipal.ledgerUser(context.userId()), context.ledgerId());
    fetchLedger(context, id); db.update("UPDATE liability SET archived = 0 WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
  }

  public List<Map<String, Object>> liabilitiesAtMonth(LedgerContext context, String month) {
    if (!MonthUtil.isValidMonth(month)) throw ApiException.badRequest("VALIDATION_FAILED", "月份需为 YYYY-MM");
    String cutoff = MonthUtil.lastDayOf(month);
    List<Map<String, Object>> rows = db.queryForList("SELECT id, remaining_cents, created_at FROM liability WHERE ledger_id = ?", context.ledgerId());
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> row : rows) {
      long id = Row.lng(row, "id"); String created = Row.str(row, "created_at");
      long cents = Row.lng(row, "remaining_cents") + Db.queryLong(db,
          "SELECT COALESCE(SUM(amount_cents), 0) FROM repayment WHERE ledger_id = ? AND liability_id = ? AND occurred_on > ?",
          context.ledgerId(), id, cutoff);
      if (created != null && created.length() >= 7 && created.substring(0, 7).compareTo(month) > 0) cents = 0;
      Map<String, Object> value = new LinkedHashMap<>(); value.put("id", id); value.put("cents", cents); out.add(value);
    }
    return out;
  }

  public Map<String, Object> liabilitiesTotalAtMonth(LedgerContext context, String month) {
    long remaining = liabilitiesAtMonth(context, month).stream().mapToLong(v -> Row.lng(v, "cents")).sum();
    long monthly = Db.queryLong(db, "SELECT COALESCE(SUM(monthly_payment_cents), 0) FROM liability "
        + "WHERE ledger_id = ? AND archived = 0", context.ledgerId());
    Map<String, Object> result = new LinkedHashMap<>(); result.put("remainingCents", remaining); result.put("monthlyPaymentCents", monthly); return result;
  }

  private Map<String, Object> fetchLedger(LedgerContext context, long id) {
    List<Map<String, Object>> rows = db.queryForList("SELECT id, name, remaining_cents, monthly_payment_cents, "
        + "payment_day, archived, created_at FROM liability WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
    if (rows.isEmpty()) throw ApiException.notFound("LIABILITY_NOT_FOUND", "负债不存在"); return rows.get(0);
  }

  private Map<String, Object> toLedgerRow(Map<String, Object> row) {
    Map<String, Object> out = new LinkedHashMap<>(); long remaining = Row.lng(row, "remaining_cents"); long monthly = Row.lng(row, "monthly_payment_cents");
    out.put("id", Row.lng(row, "id")); out.put("name", Row.str(row, "name")); out.put("remainingCents", remaining);
    out.put("remaining", Money.toYuanString(remaining)); out.put("monthlyPaymentCents", monthly);
    out.put("monthlyPayment", Money.toYuanString(monthly)); out.put("paymentDay", Row.intOrNull(row, "payment_day"));
    out.put("archived", Row.intOrNull(row, "archived")); return out;
  }

  private static String requiredName(Object value) {
    if (value == null || String.valueOf(value).trim().isEmpty()) throw ApiException.badRequest("VALIDATION_FAILED", "负债名称不能为空");
    return String.valueOf(value).trim();
  }

  private static long parseNonNegative(Object value, String field) {
    long cents = parseCents(value, field); if (cents < 0) throw ApiException.badRequest("VALIDATION_FAILED", field + "不能为负"); return cents;
  }

  private static long parseCents(Object v, String field) {
    try {
      return Money.toCents(v);
    } catch (IllegalArgumentException e) {
      throw ApiException.badRequest("VALIDATION_FAILED", field + "格式非法");
    }
  }

  private static Integer parsePaymentDay(Object v) {
    if (v == null) return null;
    int pd = ((Number) v).intValue();
    if (pd < 1 || pd > 31) throw ApiException.badRequest("VALIDATION_FAILED", "还款日必须在 1–31");
    return pd;
  }

}
