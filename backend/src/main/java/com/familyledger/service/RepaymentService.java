package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 还款：插入 repayment + 生成还款支出 txn + 账户扣减 + 负债本金扣减，四步原子。 */
@Service
public class RepaymentService {
  private final JdbcTemplate db;
  private final AccountService accounts;
  private final LiabilityService liabilities;
  private final CategoryService categories;

  public RepaymentService(JdbcTemplate db, AccountService accounts,
      LiabilityService liabilities, CategoryService categories) {
    this.db = db;
    this.accounts = accounts;
    this.liabilities = liabilities;
    this.categories = categories;
  }

  private Map<String, Object> toRow(Map<String, Object> r) {
    long amountCents = Row.lng(r, "amount_cents");
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", Row.lng(r, "id"));
    m.put("liability_id", Row.lng(r, "liability_id"));
    m.put("amount_cents", amountCents);
    m.put("occurred_on", Row.str(r, "occurred_on"));
    m.put("account_id", Row.lng(r, "account_id"));
    m.put("transaction_id", Row.lngOrNull(r, "transaction_id"));
    m.put("created_at", Row.str(r, "created_at"));
    m.put("amount", Money.toYuanString(amountCents));
    return m;
  }

  public List<Map<String, Object>> list(Long liabilityId) {
    String sql = "SELECT id, liability_id, amount_cents, occurred_on, account_id, transaction_id, created_at "
        + "FROM repayment";
    if (liabilityId == null) {
      return db.queryForList(sql + " ORDER BY id").stream().map(this::toRow).toList();
    }
    return db.queryForList(sql + " WHERE liability_id = ? ORDER BY id", liabilityId)
        .stream().map(this::toRow).toList();
  }

  @Transactional
  public Map<String, Object> create(Map<String, Object> input) {
    long liabilityId = ((Number) input.get("liabilityId")).longValue();
    Map<String, Object> liability = liabilities.get(liabilityId);

    Long accountId = input.get("accountId") == null
        ? accounts.defaultAccountId()
        : ((Number) input.get("accountId")).longValue();
    if (accountId == null) throw ApiException.notFound("ACCOUNT_NOT_FOUND", "缺少默认账户，无法还款");
    accounts.get(accountId);

    long remaining = Row.lng(liability, "remaining_cents");
    long monthly = Row.lng(liability, "monthly_payment_cents");

    long amountCents;
    if (input.get("amount") == null) {
      if (monthly == 0) throw ApiException.badRequest("VALIDATION_FAILED", "负债月供为 0，必须指定还款金额");
      amountCents = monthly;
    } else {
      try {
        amountCents = Money.toCents(input.get("amount"));
      } catch (IllegalArgumentException e) {
        throw ApiException.badRequest("VALIDATION_FAILED", "还款金额格式非法");
      }
    }
    if (amountCents <= 0) throw ApiException.badRequest("VALIDATION_FAILED", "还款金额必须大于 0");
    if (amountCents > remaining) {
      long over = amountCents - remaining;
      throw ApiException.badRequest("VALIDATION_FAILED", "还款金额超过剩余本金 " + Money.toYuanString(over) + "元");
    }

    String occurredOn = input.get("occurredOn") == null ? Time.today()
        : String.valueOf(input.get("occurredOn")).trim();
    if (occurredOn.isEmpty()) occurredOn = Time.today();
    long categoryId = Row.lng(categories.ensureDefault("expense"), "id");
    String note = input.get("note") == null ? "还款 - " + Row.str(liability, "name")
        : String.valueOf(input.get("note"));

    long repaymentId = Db.insert(db,
        "INSERT INTO repayment (liability_id, amount_cents, occurred_on, account_id, created_at) "
            + "VALUES (?, ?, ?, ?, ?)",
        liabilityId, amountCents, occurredOn, accountId, Time.now());

    long transactionId = Db.insert(db,
        "INSERT INTO txn (type, amount_cents, occurred_on, note, account_id, category_id, member_id, "
            + "source_type, source_id, created_at) VALUES ('expense', ?, ?, ?, ?, ?, ?, 'repayment', ?, ?)",
        amountCents, occurredOn, note, accountId, categoryId, input.get("memberId"), repaymentId, Time.now());

    accounts.applyBalanceDelta(accountId, -amountCents);
    db.update("UPDATE liability SET remaining_cents = remaining_cents - ? WHERE id = ?", amountCents, liabilityId);
    db.update("UPDATE repayment SET transaction_id = ? WHERE id = ?", transactionId, repaymentId);

    return toRow(db.queryForMap(
        "SELECT id, liability_id, amount_cents, occurred_on, account_id, transaction_id, created_at "
            + "FROM repayment WHERE id = ?", repaymentId));
  }

  @Transactional
  public void delete(long id) {
    List<Map<String, Object>> r = db.queryForList(
        "SELECT id, liability_id, amount_cents, account_id FROM repayment WHERE id = ?", id);
    if (r.isEmpty()) throw ApiException.notFound("REPAYMENT_NOT_FOUND", "还款 " + id + " 不存在");
    Map<String, Object> rep = r.get(0);
    accounts.applyBalanceDelta(Row.lng(rep, "account_id"), Row.lng(rep, "amount_cents"));
    db.update("UPDATE liability SET remaining_cents = remaining_cents + ? WHERE id = ?",
        Row.lng(rep, "amount_cents"), Row.lng(rep, "liability_id"));
    db.update("DELETE FROM txn WHERE source_type = 'repayment' AND source_id = ?", id);
    db.update("DELETE FROM repayment WHERE id = ?", id);
  }
}
