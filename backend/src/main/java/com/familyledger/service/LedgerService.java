package com.familyledger.service;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.Time;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Ledger-scoped manual transaction mutations. */
@Service
public class LedgerService {
  private final JdbcTemplate db;
  private final AccountService accounts;
  private final CategoryService categories;
  private final LedgerAuthorization authorization;

  public LedgerService(JdbcTemplate db, AccountService accounts, CategoryService categories,
      LedgerAuthorization authorization) {
    this.db = db;
    this.accounts = accounts;
    this.categories = categories;
    this.authorization = authorization;
  }

  @Transactional
  public Map<String, Object> createTransaction(AuthPrincipal principal, LedgerContext context,
      Map<String, Object> input) {
    authorization.requireMembership(principal, context.ledgerId());
    String type = String.valueOf(input.get("type"));
    if (!List.of("expense", "income", "transfer").contains(type)) {
      throw ApiException.badRequest("VALIDATION_FAILED", "交易类型非法");
    }
    long amount = parseAmount(input.get("amount"));
    if (amount <= 0) throw ApiException.badRequest("VALIDATION_FAILED", "金额必须大于 0");
    long accountId = input.get("accountId") == null
        ? requireDefaultAccount(context) : longValue(input.get("accountId"));
    accounts.getForEntry(context, accountId);
    Long toAccountId = null;
    if ("transfer".equals(type)) {
      if (input.get("toAccountId") == null) {
        throw ApiException.badRequest("VALIDATION_FAILED", "转账必须指定转入账户");
      }
      toAccountId = longValue(input.get("toAccountId"));
      if (toAccountId == accountId) throw ApiException.badRequest("VALIDATION_FAILED", "转入账户不能相同");
      accounts.getForEntry(context, toAccountId);
    }
    Long categoryId = resolveLedgerCategory(context, type, input);
    String occurredOn = textOrDefault(input.get("occurredOn"), Time.today());
    String note = input.get("note") == null ? null : String.valueOf(input.get("note"));
    applyLedger(context, type, amount, accountId, toAccountId);
    long id = Db.insert(db, "INSERT INTO txn (ledger_id, type, amount_cents, occurred_on, note, account_id, "
        + "to_account_id, category_id, created_by_user_id, source_type, source_id, created_at) "
        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', NULL, ?)", context.ledgerId(), type, amount,
        occurredOn, note, accountId, toAccountId, categoryId, principal.userId(), Time.now());
    return transactionResult(scopedTxn(context, id));
  }

  @Transactional
  public Map<String, Object> updateTransaction(AuthPrincipal principal, LedgerContext context,
      long id, Map<String, Object> patch) {
    Map<String, Object> existing = scopedTxn(context, id);
    if ("repayment".equals(String.valueOf(existing.get("source_type")))) {
      throw ApiException.conflict("GENERATED_BY_REPAYMENT", "还款生成的记录不可直接修改");
    }
    authorization.requireCreatorOrOwner(principal, context.ledgerId(),
        ((Number) existing.get("created_by_user_id")).longValue());
    String type = patch.containsKey("type") ? String.valueOf(patch.get("type"))
        : String.valueOf(existing.get("type"));
    if (!List.of("expense", "income", "transfer").contains(type)) {
      throw ApiException.badRequest("VALIDATION_FAILED", "交易类型非法");
    }
    long amount = patch.containsKey("amount") ? parseAmount(patch.get("amount"))
        : ((Number) existing.get("amount_cents")).longValue();
    if (amount <= 0) throw ApiException.badRequest("VALIDATION_FAILED", "金额必须大于 0");
    long accountId = patch.containsKey("accountId") ? longValue(patch.get("accountId"))
        : ((Number) existing.get("account_id")).longValue();
    Long toAccountId = patch.containsKey("toAccountId")
        ? (patch.get("toAccountId") == null ? null : longValue(patch.get("toAccountId")))
        : numberOrNull(existing.get("to_account_id"));
    accounts.getForEntry(context, accountId);
    if ("transfer".equals(type)) {
      if (toAccountId == null || toAccountId == accountId) {
        throw ApiException.badRequest("VALIDATION_FAILED", "转账账户非法");
      }
      accounts.getForEntry(context, toAccountId);
    } else {
      toAccountId = null;
    }
    Long categoryId = patch.containsKey("categoryId")
        ? (patch.get("categoryId") == null ? null : longValue(patch.get("categoryId")))
        : numberOrNull(existing.get("category_id"));
    if ("transfer".equals(type)) {
      categoryId = null;
    } else {
      if (patch.containsKey("categoryName")) categoryId = resolveLedgerCategory(context, type, patch);
      if (categoryId == null) {
        categoryId = ((Number) categories.ensureDefault(context, type).get("id")).longValue();
      }
      categories.getForEntry(context, categoryId);
    }
    applyLedger(context, String.valueOf(existing.get("type")),
        ((Number) existing.get("amount_cents")).longValue(),
        ((Number) existing.get("account_id")).longValue(), numberOrNull(existing.get("to_account_id")), true);
    applyLedger(context, type, amount, accountId, toAccountId);
    db.update("UPDATE txn SET type = ?, amount_cents = ?, occurred_on = ?, note = ?, account_id = ?, "
        + "to_account_id = ?, category_id = ? WHERE id = ? AND ledger_id = ?", type, amount,
        textOrDefault(patch.get("occurredOn"), String.valueOf(existing.get("occurred_on"))),
        patch.containsKey("note") ? (patch.get("note") == null ? null : String.valueOf(patch.get("note")))
            : existing.get("note"), accountId, toAccountId, categoryId, id, context.ledgerId());
    return transactionResult(scopedTxn(context, id));
  }

  @Transactional
  public void deleteTransaction(AuthPrincipal principal, LedgerContext context, long id) {
    Map<String, Object> existing = scopedTxn(context, id);
    if ("repayment".equals(String.valueOf(existing.get("source_type")))) {
      throw ApiException.conflict("GENERATED_BY_REPAYMENT", "还款生成的记录不可直接删除");
    }
    authorization.requireCreatorOrOwner(principal, context.ledgerId(),
        ((Number) existing.get("created_by_user_id")).longValue());
    applyLedger(context, String.valueOf(existing.get("type")),
        ((Number) existing.get("amount_cents")).longValue(),
        ((Number) existing.get("account_id")).longValue(), numberOrNull(existing.get("to_account_id")), true);
    db.update("DELETE FROM txn WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
  }

  private Map<String, Object> scopedTxn(LedgerContext context, long id) {
    List<Map<String, Object>> rows = db.queryForList("SELECT id, ledger_id, type, amount_cents, occurred_on, note, "
        + "account_id, to_account_id, category_id, created_by_user_id, source_type, source_id, created_at "
        + "FROM txn WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
    if (rows.isEmpty()) throw ApiException.notFound("TXN_NOT_FOUND", "交易不存在");
    return rows.get(0);
  }

  private Long resolveLedgerCategory(LedgerContext context, String type, Map<String, Object> input) {
    if ("transfer".equals(type)) return null;
    if (input.get("categoryName") != null && !String.valueOf(input.get("categoryName")).trim().isEmpty()) {
      return ((Number) categories.upsert(context, type, String.valueOf(input.get("categoryName")).trim()).get("id"))
          .longValue();
    }
    if (input.get("categoryId") != null) {
      long id = longValue(input.get("categoryId"));
      categories.getForEntry(context, id);
      return id;
    }
    return ((Number) categories.ensureDefault(context, type).get("id")).longValue();
  }

  private void applyLedger(LedgerContext context, String type, long amount, long accountId,
      Long toAccountId) { applyLedger(context, type, amount, accountId, toAccountId, false); }

  private void applyLedger(LedgerContext context, String type, long amount, long accountId,
      Long toAccountId, boolean reverse) {
    long sign = reverse ? -1 : 1;
    if ("expense".equals(type)) accounts.applyBalanceDelta(context, accountId, -amount * sign);
    else if ("income".equals(type)) accounts.applyBalanceDelta(context, accountId, amount * sign);
    else {
      accounts.applyBalanceDelta(context, accountId, -amount * sign);
      accounts.applyBalanceDelta(context, toAccountId, amount * sign);
    }
  }

  private Map<String, Object> transactionResult(Map<String, Object> row) {
    Map<String, Object> transaction = new LinkedHashMap<>();
    transaction.put("id", row.get("id"));
    transaction.put("type", row.get("type"));
    transaction.put("amountCents", row.get("amount_cents"));
    transaction.put("amount", Money.toYuanString(((Number) row.get("amount_cents")).longValue()));
    transaction.put("occurredOn", row.get("occurred_on"));
    transaction.put("note", row.get("note"));
    transaction.put("accountId", row.get("account_id"));
    transaction.put("toAccountId", row.get("to_account_id"));
    transaction.put("categoryId", row.get("category_id"));
    transaction.put("createdByUserId", row.get("created_by_user_id"));
    transaction.put("sourceType", row.get("source_type"));
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("transaction", transaction);
    result.put("warnings", List.of());
    return result;
  }

  private long requireDefaultAccount(LedgerContext context) {
    Long id = accounts.defaultAccountId(context);
    if (id == null) throw ApiException.badRequest("ACCOUNT_NOT_FOUND", "缺少默认账户");
    return id;
  }

  private static long longValue(Object value) {
    if (value instanceof Number n) return n.longValue();
    try { return Long.parseLong(String.valueOf(value)); }
    catch (NumberFormatException e) { throw ApiException.badRequest("VALIDATION_FAILED", "ID格式非法"); }
  }

  private static Long numberOrNull(Object value) { return value == null ? null : longValue(value); }

  private static String textOrDefault(Object value, String fallback) {
    if (value == null) return fallback;
    String text = String.valueOf(value).trim();
    return text.isEmpty() ? fallback : text;
  }

  private static long parseAmount(Object value) {
    try { return Money.toCents(value); }
    catch (IllegalArgumentException e) { throw ApiException.badRequest("VALIDATION_FAILED", "金额格式非法"); }
  }

}
