package com.familyledger.assistant;

import com.familyledger.service.AccountService;
import com.familyledger.service.AssetService;
import com.familyledger.service.CategoryService;
import com.familyledger.service.LedgerQueryService;
import com.familyledger.service.LiabilityService;
import com.familyledger.service.StatsService;
import com.familyledger.common.ApiException;
import com.familyledger.common.Money;
import com.familyledger.common.Time;
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
  private final AssistantActionService actions;

  public AssistantToolFacade(
      StatsService stats,
      LedgerQueryService ledgerQuery,
      AccountService accounts,
      CategoryService categories,
      AssetService assets,
      LiabilityService liabilities,
      AssistantActionService actions) {
    this.stats = stats;
    this.ledgerQuery = ledgerQuery;
    this.accounts = accounts;
    this.categories = categories;
    this.assets = assets;
    this.liabilities = liabilities;
    this.actions = actions;
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
}
