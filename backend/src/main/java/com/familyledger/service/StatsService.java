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

/** 统计：净资产、收支趋势、分类占比、月度截面。 */
@Service
public class StatsService {
  private final JdbcTemplate db;
  private final AssetService assets;
  private final LiabilityService liabilities;

  public StatsService(JdbcTemplate db, AssetService assets, LiabilityService liabilities) {
    this.db = db;
    this.assets = assets;
    this.liabilities = liabilities;
  }

  private long sum(String sql, Object... args) {
    return com.familyledger.common.Db.queryLong(db, sql, args);
  }

  public Map<String, Object> summary() {
    long accountsTotalCents = sum("SELECT COALESCE(SUM(balance_cents), 0) FROM account");
    long assetsTotalCents = sum("SELECT COALESCE(SUM(value_cents), 0) FROM asset");
    long totalLiabilitiesCents = sum("SELECT COALESCE(SUM(remaining_cents), 0) FROM liability");
    long monthlyPaymentTotalCents = sum("SELECT COALESCE(SUM(monthly_payment_cents), 0) FROM liability");
    long totalAssetsCents = accountsTotalCents + assetsTotalCents;
    long netWorthCents = totalAssetsCents - totalLiabilitiesCents;

    Map<String, Object> m = new LinkedHashMap<>();
    m.put("totalAssetsCents", totalAssetsCents);
    m.put("totalAssets", Money.toYuanString(totalAssetsCents));
    m.put("totalLiabilitiesCents", totalLiabilitiesCents);
    m.put("totalLiabilities", Money.toYuanString(totalLiabilitiesCents));
    m.put("netWorthCents", netWorthCents);
    m.put("netWorth", Money.toYuanString(netWorthCents));
    m.put("monthlyPaymentTotalCents", monthlyPaymentTotalCents);
    m.put("monthlyPaymentTotal", Money.toYuanString(monthlyPaymentTotalCents));
    m.put("accountsTotalCents", accountsTotalCents);
    m.put("accountsTotal", Money.toYuanString(accountsTotalCents));
    m.put("assetsTotalCents", assetsTotalCents);
    m.put("assetsTotal", Money.toYuanString(assetsTotalCents));
    return m;
  }

  public List<Map<String, Object>> monthlyTrend(int months, String endMonth) {
    if (endMonth != null && !MonthUtil.isValidMonth(endMonth)) {
      throw ApiException.badRequest("VALIDATION_FAILED", "end 需为 YYYY-MM");
    }
    String end = endMonth == null ? MonthUtil.currentMonth() : endMonth;
    List<Map<String, Object>> out = new ArrayList<>();
    for (String month : MonthUtil.monthRange(end, months)) {
      Map<String, Object> r = db.queryForList(
          "SELECT "
              + "COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income, "
              + "COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense "
              + "FROM txn WHERE occurred_on LIKE ?", month + "%").get(0);
      long income = Row.lng(r, "income");
      long expense = Row.lng(r, "expense");
      Map<String, Object> p = new LinkedHashMap<>();
      p.put("month", month);
      p.put("incomeCents", income);
      p.put("expenseCents", expense);
      p.put("netCents", income - expense);
      out.add(p);
    }
    return out;
  }

  public List<Map<String, Object>> categoryBreakdown(String month) {
    String m = month == null ? MonthUtil.currentMonth() : month;
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT c.id AS categoryId, c.name AS name, COALESCE(SUM(t.amount_cents), 0) AS cents "
            + "FROM txn t JOIN category c ON c.id = t.category_id "
            + "WHERE t.type = 'expense' AND t.occurred_on LIKE ? "
            + "GROUP BY c.id, c.name ORDER BY cents DESC", m + "%");
    long total = 0;
    for (Map<String, Object> r : rows) total += Row.lng(r, "cents");
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : rows) {
      long cents = Row.lng(r, "cents");
      double percent = total > 0 ? Math.round(((double) cents / total) * 100 * 100) / 100.0 : 0;
      Map<String, Object> p = new LinkedHashMap<>();
      p.put("categoryId", Row.lng(r, "categoryId"));
      p.put("name", Row.str(r, "name"));
      p.put("cents", cents);
      p.put("percent", percent);
      out.add(p);
    }
    return out;
  }

  public long accountsTotalAtMonth(String month) {
    long now = sum("SELECT COALESCE(SUM(balance_cents), 0) FROM account");
    long after = sum(
        "SELECT COALESCE(SUM(CASE "
            + "WHEN type = 'income' THEN amount_cents "
            + "WHEN type = 'expense' THEN -amount_cents "
            + "ELSE 0 END), 0) FROM txn WHERE occurred_on > ?",
        MonthUtil.lastDayOf(month));
    return now - after;
  }

  public Map<String, Object> monthSnapshot(String month) {
    String m = month == null ? MonthUtil.currentMonth() : month;
    if (!MonthUtil.isValidMonth(m)) {
      throw ApiException.badRequest("VALIDATION_FAILED", "month 需为 YYYY-MM");
    }
    Map<String, Object> r = db.queryForList(
        "SELECT "
            + "COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income, "
            + "COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense "
            + "FROM txn WHERE occurred_on LIKE ?", m + "%").get(0);
    long income = Row.lng(r, "income");
    long expense = Row.lng(r, "expense");

    long accountsTotal = accountsTotalAtMonth(m);
    long assetsTotal = assets.assetsTotalAtMonth(m);
    boolean assetsEstimated = assets.assetValuesAtMonth(m).stream()
        .anyMatch(v -> "current".equals(Row.str(v, "source")));
    Map<String, Object> liab = liabilities.liabilitiesTotalAtMonth(m);
    long remaining = Row.lng(liab, "remainingCents");
    long monthlyPayment = Row.lng(liab, "monthlyPaymentCents");
    long totalAssets = accountsTotal + assetsTotal;
    long netWorth = totalAssets - remaining;

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("month", m);
    out.put("incomeCents", income);
    out.put("income", Money.toYuanString(income));
    out.put("expenseCents", expense);
    out.put("expense", Money.toYuanString(expense));
    out.put("netCents", income - expense);
    out.put("net", Money.toYuanString(income - expense));
    out.put("accountsTotalCents", accountsTotal);
    out.put("accountsTotal", Money.toYuanString(accountsTotal));
    out.put("assetsTotalCents", assetsTotal);
    out.put("assetsTotal", Money.toYuanString(assetsTotal));
    out.put("totalAssetsCents", totalAssets);
    out.put("totalAssets", Money.toYuanString(totalAssets));
    out.put("totalLiabilitiesCents", remaining);
    out.put("totalLiabilities", Money.toYuanString(remaining));
    out.put("netWorthCents", netWorth);
    out.put("netWorth", Money.toYuanString(netWorth));
    out.put("monthlyPaymentTotalCents", monthlyPayment);
    out.put("monthlyPaymentTotal", Money.toYuanString(monthlyPayment));
    out.put("assetsEstimated", assetsEstimated);
    out.put("breakdown", categoryBreakdown(m));
    return out;
  }
}
