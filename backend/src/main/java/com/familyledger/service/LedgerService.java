package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 手动账目（支出/收入/转账）的写操作，含账户余额反向回滚。 */
@Service
public class LedgerService {
  private final JdbcTemplate db;
  private final AccountService accounts;
  private final CategoryService categories;

  public LedgerService(JdbcTemplate db, AccountService accounts, CategoryService categories) {
    this.db = db;
    this.accounts = accounts;
    this.categories = categories;
  }

  // ---------- 行映射 ----------

  private Map<String, Object> txnRow(long id) {
    List<Map<String, Object>> r = db.queryForList(
        "SELECT id, type, amount_cents, occurred_on, note, account_id, to_account_id, "
            + "category_id, member_id, source_type, source_id, created_at FROM txn WHERE id = ?", id);
    if (r.isEmpty()) throw ApiException.notFound("TXN_NOT_FOUND", "交易 " + id + " 不存在");
    return r.get(0);
  }

  private Map<String, Object> toSnake(Map<String, Object> r) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", Row.lng(r, "id"));
    m.put("type", Row.str(r, "type"));
    m.put("amount_cents", Row.lng(r, "amount_cents"));
    m.put("occurred_on", Row.str(r, "occurred_on"));
    m.put("note", Row.strOrNull(r, "note"));
    m.put("account_id", Row.lng(r, "account_id"));
    m.put("to_account_id", Row.lngOrNull(r, "to_account_id"));
    m.put("category_id", Row.lngOrNull(r, "category_id"));
    m.put("member_id", Row.lngOrNull(r, "member_id"));
    m.put("source_type", Row.str(r, "source_type"));
    m.put("source_id", Row.lngOrNull(r, "source_id"));
    m.put("created_at", Row.str(r, "created_at"));
    return m;
  }

  // ---------- 内部辅助 ----------

  private Long resolveMemberId(Object provided) {
    if (provided != null) return ((Number) provided).longValue();
    List<Map<String, Object>> members = db.queryForList("SELECT id, name FROM member ORDER BY id");
    for (Map<String, Object> m : members) {
      if ("我".equals(Row.str(m, "name"))) return Row.lng(m, "id");
    }
    return members.isEmpty() ? null : Row.lng(members.get(0), "id");
  }

  private Long resolveCategoryId(String type, Object categoryId, Object categoryName) {
    if ("transfer".equals(type)) {
      return categoryId == null ? null : ((Number) categoryId).longValue();
    }
    if (categoryName != null && !String.valueOf(categoryName).trim().isEmpty()) {
      Map<String, Object> cat = categories.upsert(type, String.valueOf(categoryName).trim());
      return Row.lng(cat, "id");
    }
    if (categoryId != null) return ((Number) categoryId).longValue();
    return Row.lng(categories.ensureDefault(type), "id");
  }

  private void apply(String type, long amountCents, long accountId, Long toAccountId) {
    switch (type) {
      case "expense" -> accounts.applyBalanceDelta(accountId, -amountCents);
      case "income" -> accounts.applyBalanceDelta(accountId, amountCents);
      default -> {
        accounts.applyBalanceDelta(accountId, -amountCents);
        accounts.applyBalanceDelta(toAccountId, amountCents);
      }
    }
  }

  private void reverse(String type, long amountCents, long accountId, Long toAccountId) {
    switch (type) {
      case "expense" -> accounts.applyBalanceDelta(accountId, amountCents);
      case "income" -> accounts.applyBalanceDelta(accountId, -amountCents);
      default -> {
        accounts.applyBalanceDelta(accountId, amountCents);
        accounts.applyBalanceDelta(toAccountId, -amountCents);
      }
    }
  }

  private List<Map<String, Object>> buildWarnings(List<Long> accountIds) {
    List<Map<String, Object>> warnings = new ArrayList<>();
    for (Long aid : accountIds) {
      Long bal = db.queryForObject("SELECT balance_cents FROM account WHERE id = ?", Long.class, aid);
      long balance = bal == null ? 0 : bal;
      if (balance < 0) {
        Map<String, Object> w = new LinkedHashMap<>();
        w.put("accountId", aid);
        w.put("balanceCents", balance);
        warnings.add(w);
      }
    }
    return warnings;
  }

  private static long parseAmount(Object amount) {
    try {
      return Money.toCents(amount);
    } catch (IllegalArgumentException e) {
      throw ApiException.badRequest("VALIDATION_FAILED", "金额格式非法");
    }
  }

  // ---------- 写操作 ----------

  @Transactional
  public Map<String, Object> createTransaction(Map<String, Object> input) {
    String type = String.valueOf(input.get("type"));

    long amountCents = parseAmount(input.get("amount"));
    if (amountCents <= 0) throw ApiException.badRequest("VALIDATION_FAILED", "金额必须大于 0");

    Long accountId = input.get("accountId") == null
        ? accounts.defaultAccountId()
        : ((Number) input.get("accountId")).longValue();
    if (accountId == null) throw ApiException.badRequest("VALIDATION_FAILED", "缺少默认账户");
    accounts.get(accountId); // 校验存在

    Long toAccountId = null;
    if ("transfer".equals(type)) {
      if (input.get("toAccountId") == null) {
        throw ApiException.badRequest("VALIDATION_FAILED", "转账必须指定转入账户");
      }
      toAccountId = ((Number) input.get("toAccountId")).longValue();
      if (toAccountId.equals(accountId)) {
        throw ApiException.badRequest("VALIDATION_FAILED", "转入账户不能与转出账户相同");
      }
      accounts.get(toAccountId);
    }

    String occurredOn = input.get("occurredOn") == null
        ? Time.today()
        : String.valueOf(input.get("occurredOn")).trim();
    if (occurredOn.isEmpty()) occurredOn = Time.today();

    String note = input.get("note") == null ? null : String.valueOf(input.get("note"));
    Long memberId = resolveMemberId(input.get("memberId"));
    Long categoryId = resolveCategoryId(type, input.get("categoryId"), input.get("categoryName"));

    List<Long> affected = new ArrayList<>();
    affected.add(accountId);
    if (toAccountId != null) affected.add(toAccountId);

    apply(type, amountCents, accountId, toAccountId);
    long id = Db.insert(db,
        "INSERT INTO txn (type, amount_cents, occurred_on, note, account_id, to_account_id, "
            + "category_id, member_id, source_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)",
        type, amountCents, occurredOn, note, accountId, toAccountId, categoryId, memberId, Time.now());

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("transaction", withAmount(toSnake(txnRow(id))));
    out.put("warnings", buildWarnings(affected));
    return out;
  }

  @Transactional
  public Map<String, Object> updateTransaction(long id, Map<String, Object> patch) {
    Map<String, Object> existing = txnRow(id);
    if ("repayment".equals(Row.str(existing, "source_type"))) {
      throw ApiException.conflict("GENERATED_BY_REPAYMENT", "还款生成的记录不可直接修改");
    }

    String oldType = Row.str(existing, "type");
    long oldAmount = Row.lng(existing, "amount_cents");
    long oldAccountId = Row.lng(existing, "account_id");
    Long oldToAccountId = Row.lngOrNull(existing, "to_account_id");

    String newType = patch.containsKey("type") ? String.valueOf(patch.get("type")) : oldType;

    long newAmountCents = patch.containsKey("amount") ? parseAmount(patch.get("amount")) : oldAmount;
    if (patch.containsKey("amount") && newAmountCents <= 0) {
      throw ApiException.badRequest("VALIDATION_FAILED", "金额必须大于 0");
    }

    long newAccountId = patch.get("accountId") == null ? oldAccountId
        : ((Number) patch.get("accountId")).longValue();
    Long newToAccountId = patch.containsKey("toAccountId")
        ? (patch.get("toAccountId") == null ? null : ((Number) patch.get("toAccountId")).longValue())
        : oldToAccountId;

    String newOccurredOn = !patch.containsKey("occurredOn") ? Row.str(existing, "occurred_on")
        : String.valueOf(patch.get("occurredOn")).trim();
    if (newOccurredOn == null || newOccurredOn.isEmpty()) newOccurredOn = Time.today();

    String newNote = patch.containsKey("note") ? (patch.get("note") == null ? null
        : String.valueOf(patch.get("note"))) : Row.strOrNull(existing, "note");

    Long newMemberId = patch.containsKey("memberId") ? resolveMemberId(patch.get("memberId"))
        : Row.lngOrNull(existing, "member_id");

    Long newCategoryId;
    if ("transfer".equals(newType)) {
      newCategoryId = patch.containsKey("categoryId")
          ? (patch.get("categoryId") == null ? null : ((Number) patch.get("categoryId")).longValue())
          : Row.lngOrNull(existing, "category_id");
    } else if (patch.get("categoryName") != null && !String.valueOf(patch.get("categoryName")).trim().isEmpty()) {
      newCategoryId = Row.lng(categories.upsert(newType, String.valueOf(patch.get("categoryName")).trim()), "id");
    } else if (patch.containsKey("categoryId")) {
      newCategoryId = patch.get("categoryId") == null ? null : ((Number) patch.get("categoryId")).longValue();
    } else {
      newCategoryId = Row.lngOrNull(existing, "category_id");
    }

    accounts.get(newAccountId);
    Long effToAccountId = null;
    if ("transfer".equals(newType)) {
      if (newToAccountId == null) {
        throw ApiException.badRequest("VALIDATION_FAILED", "转账必须指定转入账户");
      }
      if (newToAccountId.equals(newAccountId)) {
        throw ApiException.badRequest("VALIDATION_FAILED", "转入账户不能与转出账户相同");
      }
      effToAccountId = newToAccountId;
      accounts.get(effToAccountId);
    }

    reverse(oldType, oldAmount, oldAccountId, oldToAccountId);
    apply(newType, newAmountCents, newAccountId, effToAccountId);
    db.update("UPDATE txn SET type=?, amount_cents=?, occurred_on=?, note=?, account_id=?, "
        + "to_account_id=?, category_id=?, member_id=? WHERE id=?",
        newType, newAmountCents, newOccurredOn, newNote, newAccountId, effToAccountId,
        newCategoryId, newMemberId, id);

    List<Long> affected = new ArrayList<>();
    affected.add(newAccountId);
    if (effToAccountId != null) affected.add(effToAccountId);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("transaction", withAmount(toSnake(txnRow(id))));
    out.put("warnings", buildWarnings(affected));
    return out;
  }

  @Transactional
  public void deleteTransaction(long id) {
    Map<String, Object> existing = txnRow(id);
    if ("repayment".equals(Row.str(existing, "source_type"))) {
      throw ApiException.conflict("GENERATED_BY_REPAYMENT", "还款生成的记录不可直接删除");
    }
    reverse(Row.str(existing, "type"), Row.lng(existing, "amount_cents"),
        Row.lng(existing, "account_id"), Row.lngOrNull(existing, "to_account_id"));
    db.update("DELETE FROM txn WHERE id = ?", id);
  }

  private Map<String, Object> withAmount(Map<String, Object> row) {
    row.put("amount", Money.toYuanString(Row.lng(row, "amount_cents")));
    return row;
  }
}
