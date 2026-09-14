package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.MonthUtil;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
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
  private final MemberService members;

  public LiabilityService(JdbcTemplate db, AccountService accounts, MemberService members) {
    this.db = db;
    this.accounts = accounts;
    this.members = members;
  }

  private Map<String, Object> toRow(Map<String, Object> r) {
    long remaining = Row.lng(r, "remaining_cents");
    long monthly = Row.lng(r, "monthly_payment_cents");
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", Row.lng(r, "id"));
    m.put("name", Row.str(r, "name"));
    m.put("remaining_cents", remaining);
    m.put("monthly_payment_cents", monthly);
    m.put("payment_day", Row.intOrNull(r, "payment_day"));
    m.put("member_id", Row.lngOrNull(r, "member_id"));
    m.put("remaining", Money.toYuanString(remaining));
    m.put("monthlyPayment", Money.toYuanString(monthly));
    return m;
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

  private Long resolveMemberId(Object v) {
    if (v == null) return null;
    long mid = ((Number) v).longValue();
    if (!members.exists(mid)) throw ApiException.notFound("MEMBER_NOT_FOUND", "成员 " + mid + " 不存在");
    return mid;
  }

  public List<Map<String, Object>> list() {
    return db.queryForList(
        "SELECT id, name, remaining_cents, monthly_payment_cents, payment_day, member_id "
            + "FROM liability ORDER BY id")
        .stream().map(this::toRow).toList();
  }

  public Map<String, Object> get(long id) {
    List<Map<String, Object>> r = db.queryForList(
        "SELECT id, name, remaining_cents, monthly_payment_cents, payment_day, member_id "
            + "FROM liability WHERE id = ?", id);
    if (r.isEmpty()) throw ApiException.notFound("LIABILITY_NOT_FOUND", "负债 " + id + " 不存在");
    return toRow(r.get(0));
  }

  public Map<String, Object> create(Map<String, Object> input) {
    if (input.get("name") == null) throw ApiException.badRequest("VALIDATION_FAILED", "负债名称不能为空");
    String name = String.valueOf(input.get("name")).trim();
    if (name.isEmpty()) throw ApiException.badRequest("VALIDATION_FAILED", "负债名称不能为空");

    long remaining = parseCents(input.get("remaining"), "本金");
    if (remaining < 0) throw ApiException.badRequest("VALIDATION_FAILED", "本金不能为负");
    long monthly = input.get("monthlyPayment") == null ? 0 : parseCents(input.get("monthlyPayment"), "月供");
    if (monthly < 0) throw ApiException.badRequest("VALIDATION_FAILED", "月供不能为负");
    Integer paymentDay = input.containsKey("paymentDay") ? parsePaymentDay(input.get("paymentDay")) : null;
    Long memberId = input.containsKey("memberId") ? resolveMemberId(input.get("memberId")) : null;

    long id = Db.insert(db,
        "INSERT INTO liability (name, remaining_cents, monthly_payment_cents, payment_day, member_id, created_at) "
            + "VALUES (?, ?, ?, ?, ?, ?)",
        name, remaining, monthly, paymentDay, memberId, Time.now());
    return get(id);
  }

  public Map<String, Object> update(long id, Map<String, Object> patch) {
    if (!exists(id)) throw ApiException.notFound("LIABILITY_NOT_FOUND", "负债 " + id + " 不存在");
    if (patch.containsKey("name")) {
      String n = String.valueOf(patch.get("name")).trim();
      if (n.isEmpty()) throw ApiException.badRequest("VALIDATION_FAILED", "负债名称不能为空");
      db.update("UPDATE liability SET name = ? WHERE id = ?", n, id);
    }
    if (patch.containsKey("remaining")) {
      long cents = parseCents(patch.get("remaining"), "本金");
      if (cents < 0) throw ApiException.badRequest("VALIDATION_FAILED", "本金不能为负");
      db.update("UPDATE liability SET remaining_cents = ? WHERE id = ?", cents, id);
    }
    if (patch.containsKey("monthlyPayment")) {
      long cents = parseCents(patch.get("monthlyPayment"), "月供");
      if (cents < 0) throw ApiException.badRequest("VALIDATION_FAILED", "月供不能为负");
      db.update("UPDATE liability SET monthly_payment_cents = ? WHERE id = ?", cents, id);
    }
    if (patch.containsKey("paymentDay")) {
      db.update("UPDATE liability SET payment_day = ? WHERE id = ?", parsePaymentDay(patch.get("paymentDay")), id);
    }
    if (patch.containsKey("memberId")) {
      db.update("UPDATE liability SET member_id = ? WHERE id = ?", resolveMemberId(patch.get("memberId")), id);
    }
    return get(id);
  }

  @Transactional
  public Map<String, Object> delete(long id) {
    if (!exists(id)) throw ApiException.notFound("LIABILITY_NOT_FOUND", "负债 " + id + " 不存在");
    List<Map<String, Object>> repayments = db.queryForList(
        "SELECT id, amount_cents, account_id FROM repayment WHERE liability_id = ?", id);
    for (Map<String, Object> r : repayments) {
      long repId = Row.lng(r, "id");
      long amount = Row.lng(r, "amount_cents");
      long accountId = Row.lng(r, "account_id");
      accounts.applyBalanceDelta(accountId, amount);
      db.update("DELETE FROM txn WHERE source_type = 'repayment' AND source_id = ?", repId);
      db.update("DELETE FROM repayment WHERE id = ?", repId);
    }
    db.update("DELETE FROM liability WHERE id = ?", id);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("deletedRepayments", repayments.size());
    return out;
  }

  private boolean exists(long id) {
    Long n = db.queryForObject("SELECT COUNT(*) FROM liability WHERE id = ?", Long.class, id);
    return n != null && n > 0;
  }

  // ---------- 历史月份反推 ----------

  public List<Map<String, Object>> liabilitiesAtMonth(String month) {
    if (!MonthUtil.isValidMonth(month)) {
      throw ApiException.badRequest("VALIDATION_FAILED", "月份需为 YYYY-MM");
    }
    String cutoff = MonthUtil.lastDayOf(month);
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id, remaining_cents, created_at FROM liability ORDER BY id");
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : rows) {
      long id = Row.lng(r, "id");
      String createdMonth = Row.str(r, "created_at");
      createdMonth = createdMonth == null || createdMonth.length() < 7 ? "" : createdMonth.substring(0, 7);
      if (!createdMonth.isEmpty() && createdMonth.compareTo(month) > 0) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", id);
        m.put("cents", 0L);
        out.add(m);
        continue;
      }
      long paidAfter = Db.queryLong(db,
          "SELECT COALESCE(SUM(amount_cents), 0) FROM repayment WHERE liability_id = ? AND occurred_on > ?",
          id, cutoff);
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("id", id);
      m.put("cents", Row.lng(r, "remaining_cents") + paidAfter);
      out.add(m);
    }
    return out;
  }

  public Map<String, Object> liabilitiesTotalAtMonth(String month) {
    List<Map<String, Object>> values = liabilitiesAtMonth(month);
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id, monthly_payment_cents, created_at FROM liability");
    long remaining = 0;
    long monthly = 0;
    for (Map<String, Object> v : values) {
      long id = Row.lng(v, "id");
      remaining += Row.lng(v, "cents");
      for (Map<String, Object> r : rows) {
        if (Row.lng(r, "id") == id) {
          String cm = Row.str(r, "created_at");
          cm = cm == null || cm.length() < 7 ? "" : cm.substring(0, 7);
          if (cm.isEmpty() || cm.compareTo(month) <= 0) {
            monthly += Row.lng(r, "monthly_payment_cents");
          }
        }
      }
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("remainingCents", remaining);
    out.put("monthlyPaymentCents", monthly);
    return out;
  }
}
