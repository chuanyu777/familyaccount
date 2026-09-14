package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Money;
import com.familyledger.common.MonthUtil;
import com.familyledger.common.Row;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 账目查询与筛选（纯读）。动态拼装 WHERE，值一律走参数绑定。 */
@Service
public class LedgerQueryService {
  private final JdbcTemplate db;

  public LedgerQueryService(JdbcTemplate db) {
    this.db = db;
  }

  private Map<String, Object> toItem(Map<String, Object> r) {
    long amountCents = Row.lng(r, "amount_cents");
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", Row.lng(r, "id"));
    m.put("type", Row.str(r, "type"));
    m.put("amountCents", amountCents);
    m.put("amount", Money.toYuanString(amountCents));
    m.put("occurredOn", Row.str(r, "occurred_on"));
    m.put("note", Row.strOrNull(r, "note"));
    m.put("accountId", Row.lng(r, "account_id"));
    m.put("accountName", Row.strOrNull(r, "account_name"));
    m.put("toAccountId", Row.lngOrNull(r, "to_account_id"));
    m.put("toAccountName", Row.strOrNull(r, "to_account_name"));
    m.put("categoryId", Row.lngOrNull(r, "category_id"));
    m.put("categoryName", Row.strOrNull(r, "category_name"));
    m.put("memberId", Row.lngOrNull(r, "member_id"));
    m.put("memberName", Row.strOrNull(r, "member_name"));
    m.put("sourceType", Row.str(r, "source_type"));
    return m;
  }

  public Map<String, Object> list(String month, String type, Long accountId, Long memberId,
      Integer page, Integer pageSize) {
    int p = page == null ? 1 : page;
    int size = pageSize == null ? 20 : pageSize;
    if (p < 1) throw ApiException.badRequest("VALIDATION_FAILED", "page 必须是不小于 1 的整数");
    if (size < 1) throw ApiException.badRequest("VALIDATION_FAILED", "pageSize 必须是不小于 1 的整数");

    String m = month == null ? MonthUtil.currentMonth() : month;

    List<String> where = new ArrayList<>();
    List<Object> params = new ArrayList<>();
    where.add("t.occurred_on LIKE ?");
    params.add(m + "%");
    if (type != null) {
      where.add("t.type = ?");
      params.add(type);
    }
    if (accountId != null) {
      where.add("(t.account_id = ? OR t.to_account_id = ?)");
      params.add(accountId);
      params.add(accountId);
    }
    if (memberId != null) {
      where.add("t.member_id = ?");
      params.add(memberId);
    }
    String whereClause = "WHERE " + String.join(" AND ", where);

    Long total = db.queryForObject("SELECT COUNT(*) FROM txn t " + whereClause, Long.class,
        params.toArray());

    Map<String, Object> totals = db.queryForList(
        "SELECT "
            + "COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END), 0) AS income, "
            + "COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense "
            + "FROM txn t " + whereClause,
        params.toArray()).get(0);
    long income = Row.lng(totals, "income");
    long expense = Row.lng(totals, "expense");

    int offset = (p - 1) * size;
    List<Object> pageParams = new ArrayList<>(params);
    pageParams.add(size);
    pageParams.add(offset);
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT t.id, t.type, t.amount_cents, t.occurred_on, t.note, t.account_id, "
            + "t.to_account_id, t.category_id, t.member_id, t.source_type, "
            + "a.name AS account_name, ta.name AS to_account_name, "
            + "c.name AS category_name, mm.name AS member_name "
            + "FROM txn t "
            + "LEFT JOIN account a ON a.id = t.account_id "
            + "LEFT JOIN account ta ON ta.id = t.to_account_id "
            + "LEFT JOIN category c ON c.id = t.category_id "
            + "LEFT JOIN member mm ON mm.id = t.member_id "
            + whereClause + " ORDER BY t.occurred_on DESC, t.id DESC LIMIT ? OFFSET ?",
        pageParams.toArray());

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("items", rows.stream().map(this::toItem).toList());
    out.put("page", p);
    out.put("pageSize", size);
    out.put("total", total == null ? 0 : total);
    out.put("incomeTotalCents", income);
    out.put("expenseTotalCents", expense);
    out.put("netCents", income - expense);
    return out;
  }

  public Map<String, Object> get(long id) {
    List<Map<String, Object>> r = db.queryForList(
        "SELECT t.id, t.type, t.amount_cents, t.occurred_on, t.note, t.account_id, "
            + "t.to_account_id, t.category_id, t.member_id, t.source_type, "
            + "a.name AS account_name, ta.name AS to_account_name, "
            + "c.name AS category_name, mm.name AS member_name "
            + "FROM txn t "
            + "LEFT JOIN account a ON a.id = t.account_id "
            + "LEFT JOIN account ta ON ta.id = t.to_account_id "
            + "LEFT JOIN category c ON c.id = t.category_id "
            + "LEFT JOIN member mm ON mm.id = t.member_id "
            + "WHERE t.id = ?", id);
    if (r.isEmpty()) throw ApiException.notFound("TXN_NOT_FOUND", "交易 " + id + " 不存在");
    return toItem(r.get(0));
  }
}
