package com.familyledger.assistant;

import com.familyledger.service.AccountService;
import com.familyledger.service.AssetService;
import com.familyledger.service.CategoryService;
import com.familyledger.service.LedgerQueryService;
import com.familyledger.service.LiabilityService;
import com.familyledger.service.StatsService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * LangChain 工具的业务侧门面。
 *
 * <p>Agent Runtime 只应调用这些稳定的工具语义，不应直接拼接数据库 SQL，也不应依赖
 * Spring 业务 Service 的内部返回结构。下一步接入 Python LangChain 时，将通过内部 HTTP
 * tool endpoint 调用本门面；这里先把工具到现有领域服务的映射固定下来。</p>
 */
@Service
public class AssistantToolFacade {
  private final StatsService stats;
  private final LedgerQueryService ledgerQuery;
  private final AccountService accounts;
  private final CategoryService categories;
  private final AssetService assets;
  private final LiabilityService liabilities;

  public AssistantToolFacade(
      StatsService stats,
      LedgerQueryService ledgerQuery,
      AccountService accounts,
      CategoryService categories,
      AssetService assets,
      LiabilityService liabilities) {
    this.stats = stats;
    this.ledgerQuery = ledgerQuery;
    this.accounts = accounts;
    this.categories = categories;
    this.assets = assets;
    this.liabilities = liabilities;
  }

  public Map<String, Object> getLedgerOverview(AssistantContext context) {
    return result("get_ledger_overview", context, stats.summary());
  }

  public Map<String, Object> getPeriodSummary(AssistantContext context, String month) {
    return result("get_period_summary", context, stats.monthSnapshot(month));
  }

  public Map<String, Object> getCategoryBreakdown(AssistantContext context, String month) {
    return result("get_category_breakdown", context, stats.categoryBreakdown(month));
  }

  public Map<String, Object> searchTransactions(
      AssistantContext context, String month, String type, Long accountId, Integer pageSize) {
    return result("search_transactions", context,
        ledgerQuery.list(month, type, accountId, null, 1, pageSize));
  }

  public Map<String, Object> listAccounts(AssistantContext context) {
    return result("list_accounts", context, accounts.list());
  }

  public Map<String, Object> listCategories(AssistantContext context, String kind) {
    return result("list_categories", context, categories.list(kind));
  }

  public Map<String, Object> getAssets(AssistantContext context) {
    return result("get_assets", context, assets.list());
  }

  public Map<String, Object> getLiabilities(AssistantContext context) {
    return result("get_liabilities", context, liabilities.list());
  }

  private Map<String, Object> result(String tool, AssistantContext context, Object data) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("tool", tool);
    out.put("runId", context.runId());
    out.put("ledgerId", context.ledgerId());
    out.put("data", data);
    return out;
  }
}
