package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Money;
import com.familyledger.common.MonthUtil;
import com.familyledger.common.Row;
import com.familyledger.ledger.LedgerContext;
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

  public Map<String, Object> list(LedgerContext context, String month, String type,
      Long accountId, Integer page, Integer pageSize) {
    int p = page == null ? 1 : page;
    int size = pageSize == null ? 20 : pageSize;
    if (p < 1 || size < 1) throw ApiException.badRequest("VALIDATION_FAILED", "分页参数非法");
    String m = month == null ? MonthUtil.currentMonth() : month;
    List<String> where = new ArrayList<>();
    List<Object> params = new ArrayList<>();
    where.add("t.ledger_id = ?"); params.add(context.ledgerId());
    where.add("t.occurred_on LIKE ?"); params.add(m + "%");
    if (type != null) { where.add("t.type = ?"); params.add(type); }
    if (accountId != null) { where.add("(t.account_id = ? OR t.to_account_id = ?)"); params.add(accountId); params.add(accountId); }
    String clause = "WHERE " + String.join(" AND ", where);
    Long total = db.queryForObject("SELECT COUNT(*) FROM txn t " + clause, Long.class, params.toArray());
    Map<String, Object> totals = db.queryForList("SELECT "
        + "COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END), 0) AS income, "
        + "COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END), 0) AS expense "
        + "FROM txn t " + clause, params.toArray()).get(0);
    List<Object> pageParams = new ArrayList<>(params); pageParams.add(size); pageParams.add((p - 1) * size);
    List<Map<String, Object>> rows = db.queryForList("SELECT t.id, t.type, t.amount_cents, t.occurred_on, t.note, "
        + "t.account_id, t.to_account_id, t.category_id, t.created_by_user_id, t.source_type, "
        + "a.name AS account_name, ta.name AS to_account_name, c.name AS category_name "
        + "FROM txn t LEFT JOIN account a ON a.id = t.account_id AND a.ledger_id = t.ledger_id "
        + "LEFT JOIN account ta ON ta.id = t.to_account_id AND ta.ledger_id = t.ledger_id "
        + "LEFT JOIN category c ON c.id = t.category_id AND c.ledger_id = t.ledger_id "
        + clause + " ORDER BY t.occurred_on DESC, t.id DESC LIMIT ? OFFSET ?", pageParams.toArray());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("items", rows.stream().map(this::toLedgerItem).toList()); out.put("page", p); out.put("pageSize", size);
    out.put("total", total == null ? 0 : total); out.put("incomeTotalCents", Row.lng(totals, "income"));
    out.put("expenseTotalCents", Row.lng(totals, "expense"));
    out.put("netCents", Row.lng(totals, "income") - Row.lng(totals, "expense"));
    return out;
  }

  public Map<String, Object> get(LedgerContext context, long id) {
    List<Map<String, Object>> rows = db.queryForList("SELECT t.id, t.type, t.amount_cents, t.occurred_on, t.note, "
        + "t.account_id, t.to_account_id, t.category_id, t.created_by_user_id, t.source_type, "
        + "a.name AS account_name, ta.name AS to_account_name, c.name AS category_name "
        + "FROM txn t LEFT JOIN account a ON a.id = t.account_id AND a.ledger_id = t.ledger_id "
        + "LEFT JOIN account ta ON ta.id = t.to_account_id AND ta.ledger_id = t.ledger_id "
        + "LEFT JOIN category c ON c.id = t.category_id AND c.ledger_id = t.ledger_id "
        + "WHERE t.id = ? AND t.ledger_id = ?", id, context.ledgerId());
    if (rows.isEmpty()) throw ApiException.notFound("TXN_NOT_FOUND", "交易不存在");
    return toLedgerItem(rows.get(0));
  }

  private Map<String, Object> toLedgerItem(Map<String, Object> r) {
    Map<String, Object> out = new LinkedHashMap<>();
    long amount = Row.lng(r, "amount_cents");
    out.put("id", Row.lng(r, "id")); out.put("type", Row.str(r, "type"));
    out.put("amountCents", amount); out.put("amount", Money.toYuanString(amount));
    out.put("occurredOn", Row.str(r, "occurred_on")); out.put("note", Row.strOrNull(r, "note"));
    out.put("accountId", Row.lng(r, "account_id")); out.put("accountName", Row.strOrNull(r, "account_name"));
    out.put("toAccountId", Row.lngOrNull(r, "to_account_id")); out.put("toAccountName", Row.strOrNull(r, "to_account_name"));
    out.put("categoryId", Row.lngOrNull(r, "category_id")); out.put("categoryName", Row.strOrNull(r, "category_name"));
    out.put("createdByUserId", Row.lng(r, "created_by_user_id")); out.put("sourceType", Row.str(r, "source_type"));
    return out;
  }

}
