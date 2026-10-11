package com.familyledger.assistant;

import com.familyledger.service.AccountService;
import com.familyledger.service.AssetService;
import com.familyledger.service.CategoryService;
import com.familyledger.service.LedgerQueryService;
import com.familyledger.service.LiabilityService;
import com.familyledger.service.RepaymentService;
import com.familyledger.service.StatsService;
import com.familyledger.common.ApiException;
import com.familyledger.common.Money;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import org.springframework.jdbc.core.JdbcTemplate;
import com.familyledger.ledger.LedgerContext;
import java.util.LinkedHashMap;
import java.util.List;
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
  private final RepaymentService repayments;
  private final AssistantActionService actions;
  private final JdbcTemplate db;

  public AssistantToolFacade(
      StatsService stats,
      LedgerQueryService ledgerQuery,
      AccountService accounts,
      CategoryService categories,
      AssetService assets,
      LiabilityService liabilities,
      RepaymentService repayments,
      AssistantActionService actions,
      JdbcTemplate db) {
    this.stats = stats;
    this.ledgerQuery = ledgerQuery;
    this.accounts = accounts;
    this.categories = categories;
    this.assets = assets;
    this.liabilities = liabilities;
    this.repayments = repayments;
    this.actions = actions;
    this.db = db;
  }

  public Map<String, Object> getLedgerOverview(AssistantContext context) {
    return result("get_ledger_overview", context, stats.summary(ledger(context)));
  }

  public Map<String, Object> getPeriodSummary(AssistantContext context, String month) {
    return result("get_period_summary", context, stats.monthSnapshot(ledger(context), month));
  }

  public Map<String, Object> getCategoryBreakdown(AssistantContext context, String month) {
    return result("get_category_breakdown", context, stats.categoryBreakdown(ledger(context), month));
  }

  public Map<String, Object> searchTransactions(
      AssistantContext context, String month, String type, Long accountId, Integer pageSize) {
    return result("search_transactions", context,
        ledgerQuery.list(ledger(context), month, type, accountId, 1, pageSize));
  }

  public Map<String, Object> listAccounts(AssistantContext context) {
    return result("list_accounts", context, accounts.list(ledger(context)));
  }

  public Map<String, Object> listCategories(AssistantContext context, String kind) {
    return result("list_categories", context, categories.list(ledger(context), kind));
  }

  public Map<String, Object> getAssets(AssistantContext context) {
    return result("get_assets", context, assets.list(ledger(context)));
  }

  public Map<String, Object> getLiabilities(AssistantContext context) {
    return result("get_liabilities", context, liabilities.list(ledger(context)));
  }

  /**
   * 需求 4.1：自然语言记账只产出待确认草稿，不写入账本。
   *
   * <p>草稿阶段就校验金额、账户归属和转账规则，让确认卡上展示的内容是可执行的；
   * 真正的写入发生在用户点确认之后（{@link AssistantActionService#confirm}）。</p>
   */
  public Map<String, Object> proposeCreateTransaction(AssistantContext context,
      Map<String, Object> params) {
    if (context.conversationId() == null) {
      throw ApiException.badRequest("ASSISTANT_CONTEXT_REQUIRED", "助手请求缺少会话上下文");
    }
    LedgerContext ledger = ledger(context);
    String type = String.valueOf(params.get("type"));
    if (!List.of("expense", "income", "transfer").contains(type)) {
      throw ApiException.badRequest("VALIDATION_FAILED", "记账类型只能是支出、收入或转账");
    }
    long amountCents;
    try {
      amountCents = Money.toCents(params.get("amount"));
    } catch (RuntimeException e) {
      throw ApiException.badRequest("VALIDATION_FAILED", "金额格式不正确");
    }
    if (amountCents <= 0) {
      throw ApiException.badRequest("VALIDATION_FAILED", "金额必须大于 0");
    }

    Map<String, Object> draft = new LinkedHashMap<>();
    draft.put("type", type);
    draft.put("amount", String.valueOf(params.get("amount")).trim());
    draft.put("occurredOn", textOr(params.get("occurredOn"), Time.today()));
    draft.put("note", params.get("note") == null ? null : String.valueOf(params.get("note")).trim());
    Map<String, Object> account = resolveAccount(ledger, params.get("accountId"));
    long accountId = ((Number) account.get("id")).longValue();
    draft.put("accountId", accountId);
    draft.put("accountName", account.get("name"));
    if ("transfer".equals(type)) {
      Map<String, Object> target = resolveAccount(ledger, params.get("toAccountId"));
      long toAccountId = ((Number) target.get("id")).longValue();
      if (toAccountId == accountId) {
        throw ApiException.badRequest("VALIDATION_FAILED", "转入账户不能与转出账户相同");
      }
      draft.put("toAccountId", toAccountId);
      draft.put("toAccountName", target.get("name"));
    } else if (params.get("categoryName") != null && !String.valueOf(params.get("categoryName")).isBlank()) {
      draft.put("categoryName", String.valueOf(params.get("categoryName")).trim());
    }

    Map<String, Object> action = actions.propose(context.conversationId(), "create_transaction",
        draft, context.userId(), context.ledgerId());
    Map<String, Object> data = new LinkedHashMap<>(action);
    data.put("draft", draft);
    return result("propose_create_transaction", context, data);
  }

  /** 账户缺省时回退到账本默认账户；无论如何都校验它属于当前账本，并带回账户名供确认卡展示。 */
  private Map<String, Object> resolveAccount(LedgerContext ledger, Object raw) {
    if (raw == null || String.valueOf(raw).isBlank()) {
      return accounts.getForEntry(ledger, accounts.defaultAccountId(ledger));
    }
    long id;
    try {
      id = Long.parseLong(String.valueOf(raw).trim());
    } catch (NumberFormatException e) {
      throw ApiException.badRequest("VALIDATION_FAILED", "账户标识格式不正确");
    }
    return accounts.getForEntry(ledger, id);
  }

  private static String textOr(Object value, String fallback) {
    if (value == null) return fallback;
    String text = String.valueOf(value).trim();
    return text.isEmpty() ? fallback : text;
  }

  private LedgerContext ledger(AssistantContext context) {
    if (context.ledgerId() == null || context.userId() == null) {
      throw ApiException.badRequest("ASSISTANT_CONTEXT_REQUIRED", "助手请求缺少账本上下文");
    }
    // 具体成员资格已由 Web controller 或内部工具网关验证；只读工具无需 owner 权限。
    return new LedgerContext(context.ledgerId(), context.userId(), "MEMBER", true);
  }

  private Map<String, Object> result(String tool, AssistantContext context, Object data) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("tool", tool);
    out.put("runId", context.runId());
    out.put("ledgerId", context.ledgerId());
    out.put("data", data);
    return out;
  }

  // ---------- 草稿类写工具（P0/P1）：全部走 assistant_action 落库 + 用户确认 ----------

  /** 通用 propose：校验会话上下文 → 落库 PROPOSED → 带回 draft 供确认卡展示。 */
  private Map<String, Object> proposeAction(AssistantContext context, String actionType,
      Map<String, Object> payload) {
    if (context.conversationId() == null) {
      throw ApiException.badRequest("ASSISTANT_CONTEXT_REQUIRED", "助手请求缺少会话上下文");
    }
    Map<String, Object> action = actions.propose(context.conversationId(), actionType, payload,
        context.userId(), context.ledgerId());
    Map<String, Object> data = new LinkedHashMap<>(action);
    data.put("draft", payload);
    return result(actionType, context, data);
  }

  private static long requireLong(Map<String, Object> params, String key) {
    Object value = params.get(key);
    if (value instanceof Number n) return n.longValue();
    if (value != null) {
      try { return Long.parseLong(String.valueOf(value).trim()); }
      catch (NumberFormatException e) { /* fall through */ }
    }
    throw ApiException.badRequest("VALIDATION_FAILED", "缺少 " + key);
  }

  public Map<String, Object> proposeUpdateTransaction(AssistantContext context,
      Map<String, Object> params) {
    long id = requireLong(params, "id");
    Map<String, Object> patch = new LinkedHashMap<>();
    for (String key : List.of("type", "amount", "occurredOn", "note", "accountId", "toAccountId",
        "categoryName")) {
      if (params.get(key) != null) patch.put(key, params.get(key));
    }
    if (patch.isEmpty()) {
      throw ApiException.badRequest("VALIDATION_FAILED", "没有需要修改的字段");
    }
    return proposeAction(context, "update_transaction", Map.of("id", id, "patch", patch));
  }

  public Map<String, Object> proposeDeleteTransaction(AssistantContext context,
      Map<String, Object> params) {
    return proposeAction(context, "delete_transaction", Map.of("id", requireLong(params, "id")));
  }

  public Map<String, Object> proposeCreateAccount(AssistantContext context,
      Map<String, Object> params) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("name", textOr(params.get("name"), null));
    if (params.get("openingBalance") != null) payload.put("openingBalance", params.get("openingBalance"));
    if (payload.get("name") == null) {
      throw ApiException.badRequest("VALIDATION_FAILED", "缺少账户名称");
    }
    return proposeAction(context, "create_account", payload);
  }

  public Map<String, Object> proposeCalibrateAccount(AssistantContext context,
      Map<String, Object> params) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("accountId", requireLong(params, "accountId"));
    payload.put("actualBalance", String.valueOf(params.get("actualBalance")));
    return proposeAction(context, "calibrate_account", payload);
  }

  public Map<String, Object> proposeCreateLiability(AssistantContext context,
      Map<String, Object> params) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("name", textOr(params.get("name"), null));
    payload.put("remaining", String.valueOf(params.get("remaining")));
    if (params.get("monthlyPayment") != null) payload.put("monthlyPayment", params.get("monthlyPayment"));
    if (params.get("paymentDay") != null) payload.put("paymentDay", params.get("paymentDay"));
    if (payload.get("name") == null) {
      throw ApiException.badRequest("VALIDATION_FAILED", "缺少负债名称");
    }
    return proposeAction(context, "create_liability", payload);
  }

  public Map<String, Object> proposeCreateRepayment(AssistantContext context,
      Map<String, Object> params) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("liabilityId", requireLong(params, "liabilityId"));
    payload.put("amount", String.valueOf(params.get("amount")));
    if (params.get("accountId") != null) payload.put("accountId", requireLong(params, "accountId"));
    payload.put("occurredOn", normalizeDate(params.get("occurredOn")));
    if (params.get("note") != null) payload.put("note", params.get("note"));
    return proposeAction(context, "create_repayment", payload);
  }

  public Map<String, Object> proposeUpsertAsset(AssistantContext context,
      Map<String, Object> params) {
    Map<String, Object> payload = new LinkedHashMap<>();
    if (params.get("assetId") != null) payload.put("assetId", requireLong(params, "assetId"));
    payload.put("name", textOr(params.get("name"), null));
    payload.put("value", String.valueOf(params.get("value")));
    if (params.get("kind") != null) payload.put("kind", params.get("kind"));
    if (payload.get("name") == null) {
      throw ApiException.badRequest("VALIDATION_FAILED", "缺少资产名称");
    }
    return proposeAction(context, "upsert_asset", payload);
  }

  /** 投资买入组合草稿：新建/更新资产条目 + 扣减资金账户余额，一次确认两步执行。 */
  public Map<String, Object> proposeInvestmentBuy(AssistantContext context,
      Map<String, Object> params) {
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("name", textOr(params.get("name"), null));
    payload.put("value", String.valueOf(params.get("value")));
    payload.put("accountId", requireLong(params, "accountId"));
    if (params.get("kind") != null) payload.put("kind", params.get("kind"));
    if (payload.get("name") == null) {
      throw ApiException.badRequest("VALIDATION_FAILED", "缺少投资标的名称");
    }
    return proposeAction(context, "investment_buy", payload);
  }

  /** 会话内待确认草稿清单（Agent 注入上下文，让「确认」二字有据可依）。 */
  public Map<String, Object> listPendingActions(AssistantContext context) {
    if (context.conversationId() == null) {
      throw ApiException.badRequest("ASSISTANT_CONTEXT_REQUIRED", "助手请求缺少会话上下文");
    }
    return result("list_pending_actions", context,
        actions.listPending(context.conversationId(), context.userId(), context.ledgerId()));
  }

  /** 用户在对话里说「确认」时，由 Agent 调用：执行会话内最近一张待确认草稿。 */
  public Map<String, Object> confirmPendingAction(AssistantContext context) {
    if (context.conversationId() == null) {
      throw ApiException.badRequest("ASSISTANT_CONTEXT_REQUIRED", "助手请求缺少会话上下文");
    }
    Map<String, Object> data = actions.confirmLatest(context.conversationId(),
        com.familyledger.auth.AuthPrincipal.ledgerUser(context.userId()), ledger(context));
    return result("confirm_pending_action", context, data);
  }

  // ---------- 聚合查询工具（P2） ----------

  /** 年度收支汇总：按月列出收入/支出/结余，并给出全年合计。 */
  public Map<String, Object> getYearSummary(AssistantContext context, String year) {
    String y = (year == null || !year.matches("\\d{4}")) ? Time.now().substring(0, 4) : year;
    LedgerContext ledger = ledger(context);
    List<Map<String, Object>> months = db.queryForList(
        "SELECT LEFT(occurred_on, 7) AS month, "
            + "COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS income_cents, "
            + "COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expense_cents "
            + "FROM txn WHERE ledger_id = ? AND occurred_on LIKE ? "
            + "GROUP BY LEFT(occurred_on, 7) ORDER BY month", ledger.ledgerId(), y + "%");
    long income = 0;
    long expense = 0;
    for (Map<String, Object> row : months) {
      income += Row.lng(row, "income_cents");
      expense += Row.lng(row, "expense_cents");
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("year", y);
    out.put("months", months);
    out.put("totalIncomeCents", income);
    out.put("totalExpenseCents", expense);
    out.put("totalNetCents", income - expense);
    return result("get_year_summary", context, out);
  }

  /** 净资产走势：按月列出资产估值合计（来自资产快照）与当前负债合计。 */
  public Map<String, Object> getNetWorthTrend(AssistantContext context, String year) {
    String y = (year == null || !year.matches("\\d{4}")) ? Time.now().substring(0, 4) : year;
    LedgerContext ledger = ledger(context);
    List<Map<String, Object>> assetTrend = db.queryForList(
        "SELECT snap_month AS month, COALESCE(SUM(value_cents), 0) AS asset_cents "
            + "FROM asset_snapshot WHERE ledger_id = ? AND snap_month LIKE ? "
            + "GROUP BY snap_month ORDER BY snap_month", ledger.ledgerId(), y + "%");
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("year", y);
    out.put("assetTrend", assetTrend);
    out.put("current", stats.summary(ledger));
    return result("get_net_worth_trend", context, out);
  }

  private String normalizeDate(Object value) {
    if (value == null) return null;
    String text = String.valueOf(value).trim();
    return text.matches("\\d{4}-\\d{2}-\\d{2}") ? text : null;
  }
}