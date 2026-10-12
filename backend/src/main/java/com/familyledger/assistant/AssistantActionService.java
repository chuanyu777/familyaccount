package com.familyledger.assistant;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.service.AccountService;
import com.familyledger.service.AssetService;
import com.familyledger.service.LedgerService;
import com.familyledger.service.LiabilityService;
import com.familyledger.service.RepaymentService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 写操作的 application-level HITL：先提议，用户明确确认后才调用领域写服务。 */
@Service
public class AssistantActionService {
  private final JdbcTemplate db;
  private final ObjectMapper json;
  private final LedgerService ledger;
  private final AccountService accounts;
  private final AssetService assets;
  private final LiabilityService liabilities;
  private final RepaymentService repayments;

  public AssistantActionService(JdbcTemplate db, ObjectMapper json, LedgerService ledger,
      AccountService accounts, AssetService assets, LiabilityService liabilities,
      RepaymentService repayments) {
    this.db = db;
    this.json = json;
    this.ledger = ledger;
    this.accounts = accounts;
    this.assets = assets;
    this.liabilities = liabilities;
    this.repayments = repayments;
  }

  @Transactional
  public Map<String, Object> propose(long conversationId, String actionType, Map<String, Object> payload,
      Long userId, Long ledgerId) {
    requireOwnedConversation(conversationId, userId, ledgerId);
    String now = Time.now();
    long id = Db.insert(db,
        "INSERT INTO assistant_action (conversation_id, action_type, status, payload_json, created_at) "
            + "VALUES (?, ?, 'PROPOSED', ?, ?)", conversationId, actionType, stringify(payload), now);
    return get(id, userId, ledgerId);
  }

  /** 仅当操作所属会话属于当前用户与当前账本时才可见，避免跨账本读取。 */
  public Map<String, Object> get(long id, Long userId, Long ledgerId) {
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT a.id, a.conversation_id, a.run_id, a.action_type, a.status, a.payload_json, "
            + "a.result_json, a.version, a.created_at, a.expires_at, a.confirmed_at "
            + "FROM assistant_action a JOIN assistant_conversation c ON c.id = a.conversation_id "
            + "WHERE a.id = ? AND c.user_id = ? AND c.ledger_id = ?", id, userId, ledgerId);
    if (rows.isEmpty()) throw ApiException.notFound("ASSISTANT_ACTION_NOT_FOUND", "助手操作不存在");
    Map<String, Object> out = new LinkedHashMap<>(rows.get(0));
    out.put("payload", parse(Row.str(out, "payload_json")));
    String result = Row.strOrNull(out, "result_json");
    if (result != null) out.put("result", parse(result));
    return out;
  }

  /** 会话内待确认的草稿（按时间倒序），供 Agent 在对话里引用与确认。 */
  public List<Map<String, Object>> listPending(long conversationId, Long userId, Long ledgerId) {
    requireOwnedConversation(conversationId, userId, ledgerId);
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT a.id, a.action_type, a.status, a.payload_json, a.created_at "
            + "FROM assistant_action a WHERE a.conversation_id = ? AND a.status = 'PROPOSED' "
            + "ORDER BY a.id DESC", conversationId);
    return rows.stream().map(row -> {
      Map<String, Object> out = new LinkedHashMap<>(row);
      out.put("payload", parse(Row.str(out, "payload_json")));
      out.remove("payload_json");
      return out;
    }).toList();
  }

  /** 确认会话内最近一张待确认草稿（用户在对话里说「确认」时走这里）。 */
  @Transactional
  public Map<String, Object> confirmLatest(long conversationId, AuthPrincipal principal,
      LedgerContext context) {
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id FROM assistant_action WHERE conversation_id = ? AND status = 'PROPOSED' "
            + "ORDER BY id DESC LIMIT 1", conversationId);
    if (rows.isEmpty()) {
      throw ApiException.notFound("ASSISTANT_NO_PENDING_ACTION", "当前没有待确认的草稿");
    }
    return confirm(Row.lng(rows.get(0), "id"), principal, context);
  }

  @Transactional
  public Map<String, Object> confirm(long id, AuthPrincipal principal, LedgerContext context) {
    Map<String, Object> action = get(id, context.userId(), context.ledgerId());
    String status = Row.str(action, "status");
    if ("CONFIRMED".equals(status) || "EXECUTED".equals(status)) return action;
    if (!"PROPOSED".equals(status)) {
      throw ApiException.conflict("ASSISTANT_ACTION_NOT_CONFIRMABLE", "该助手操作当前不能确认");
    }
    Map<String, Object> result = execute(actionType(action), payload(action), principal, context);
    String now = Time.now();
    int changed = db.update("UPDATE assistant_action SET status='EXECUTED', result_json=?, "
        + "version=version+1, confirmed_at=? WHERE id=? AND status='PROPOSED'",
        stringify(result), now, id);
    if (changed != 1) return get(id, context.userId(), context.ledgerId());
    return get(id, context.userId(), context.ledgerId());
  }

  /** 按 action_type 分发到对应领域服务；新增草稿类型必须在这里补执行分支。 */
  private Map<String, Object> execute(String actionType, Map<String, Object> payload,
      AuthPrincipal principal, LedgerContext context) {
    return switch (actionType) {
      case "create_transaction" -> ledger.createTransaction(principal, context, payload);
      case "update_transaction" -> ledger.updateTransaction(principal, context,
          requiredId(payload, "id"), patchOf(payload));
      case "delete_transaction" -> {
        ledger.deleteTransaction(principal, context, requiredId(payload, "id"));
        yield Map.of("ok", true);
      }
      case "create_account" -> accounts.create(context, String.valueOf(payload.get("name")),
          payload.get("openingBalance") == null ? null
              : Money.toCents(payload.get("openingBalance")));
      case "calibrate_account" -> accounts.calibrate(context, requiredId(payload, "accountId"),
          Money.toCents(payload.get("actualBalance")));
      case "create_liability" -> liabilities.create(context, payload);
      case "create_repayment" -> repayments.create(principal, context, payload);
      case "upsert_asset" -> upsertAsset(payload, context);
      case "investment_buy" -> investmentBuy(payload, context);
      default -> throw ApiException.badRequest("ASSISTANT_ACTION_UNSUPPORTED", "暂不支持该操作类型");
    };
  }

  /** 新建或更新家庭资产条目：指定 assetId 或账本内已有同名未归档资产时更新市值，否则新建。 */
  private Map<String, Object> upsertAsset(Map<String, Object> payload, LedgerContext context) {
    Map<String, Object> patch = new LinkedHashMap<>();
    if (payload.get("value") != null) patch.put("value", String.valueOf(payload.get("value")));
    if (payload.get("kind") != null) patch.put("kind", String.valueOf(payload.get("kind")));
    if (payload.get("name") != null) patch.put("name", String.valueOf(payload.get("name")));
    Long targetId = payload.get("assetId") == null ? null : Row.lng(payload, "assetId");
    if (targetId == null && payload.get("name") != null) {
      List<Map<String, Object>> existing = db.queryForList(
          "SELECT id FROM asset WHERE ledger_id = ? AND name = ? AND archived = 0",
          context.ledgerId(), payload.get("name"));
      if (!existing.isEmpty()) targetId = Row.lng(existing.get(0), "id");
    }
    if (targetId != null) return assets.update(context, targetId, patch);
    return assets.create(context, new LinkedHashMap<>(patch));
  }

  /**
   * 投资买入组合操作：现金 → 证券（资产条目），账户余额同步扣减。
   * 一次确认两个动作在同一个事务里完成，净资产不变、收支不受影响。
   */
  private Map<String, Object> investmentBuy(Map<String, Object> payload, LedgerContext context) {
    long accountId = requiredId(payload, "accountId");
    Map<String, Object> account = accounts.get(context, accountId);
    long balanceCents = Row.lng(account, "balanceCents");
    long costCents = Money.toCents(payload.get("value"));
    if (costCents > balanceCents) {
      throw ApiException.badRequest("VALIDATION_FAILED", "账户余额不足，无法完成该笔投资买入");
    }
    Map<String, Object> assetPayload = new LinkedHashMap<>(payload);
    Map<String, Object> assetResult;
    List<Map<String, Object>> existing = db.queryForList(
        "SELECT id, value_cents FROM asset WHERE ledger_id = ? AND name = ? AND archived = 0",
        context.ledgerId(), payload.get("name"));
    if (existing.isEmpty()) {
      Map<String, Object> input = new LinkedHashMap<>();
      input.put("name", payload.get("name"));
      input.put("value", payload.get("value"));
      if (payload.get("kind") != null) input.put("kind", payload.get("kind"));
      assetResult = assets.create(context, input);
    } else {
      long updatedValueCents;
      try {
        updatedValueCents = Math.addExact(Row.lng(existing.get(0), "value_cents"), costCents);
      } catch (ArithmeticException exception) {
        throw ApiException.badRequest("VALIDATION_FAILED", "投资买入后资产市值超出支持范围");
      }
      assetResult = assets.update(context, Row.lng(existing.get(0), "id"),
          Map.of("value", Money.toYuanString(updatedValueCents)));
    }
    Map<String, Object> calib = accounts.calibrate(context, accountId, balanceCents - costCents);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("asset", assetResult);
    out.put("account", calib);
    return out;
  }

  private static long requiredId(Map<String, Object> payload, String key) {
    Object value = payload.get(key);
    if (value instanceof Number n) return n.longValue();
    if (value != null) {
      try { return Long.parseLong(String.valueOf(value)); }
      catch (NumberFormatException e) { /* fall through */ }
    }
    throw ApiException.badRequest("VALIDATION_FAILED", "缺少 " + key);
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> patchOf(Map<String, Object> payload) {
    Object patch = payload.get("patch");
    return patch instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
  }

  private static String actionType(Map<String, Object> action) {
    return String.valueOf(action.get("action_type"));
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> payload(Map<String, Object> action) {
    return action.get("payload") instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
  }

  @Transactional
  public void cancel(long id, Long userId, Long ledgerId) {
    get(id, userId, ledgerId);
    int changed = db.update("UPDATE assistant_action SET status='CANCELLED', version=version+1 "
        + "WHERE id=? AND status='PROPOSED'", id);
    if (changed == 0) throw ApiException.conflict("ASSISTANT_ACTION_NOT_CANCELABLE", "该助手操作当前不能取消");
  }

  /** 取消会话内最近一张待确认草稿（用户在对话里说「取消」时走这里）。 */
  @Transactional
  public Map<String, Object> cancelLatest(long conversationId, Long userId, Long ledgerId) {
    requireOwnedConversation(conversationId, userId, ledgerId);
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id FROM assistant_action WHERE conversation_id = ? AND status = 'PROPOSED' "
            + "ORDER BY id DESC LIMIT 1", conversationId);
    if (rows.isEmpty()) {
      throw ApiException.notFound("ASSISTANT_NO_PENDING_ACTION", "当前没有待确认的草稿");
    }
    long id = Row.lng(rows.get(0), "id");
    cancel(id, userId, ledgerId);
    return get(id, userId, ledgerId);
  }

  /** 需求第 7 节：确认卡提供「修改」，改完重新展示最新预览（version 递增）。 */
  @Transactional
  public Map<String, Object> update(long id, Map<String, Object> patch, Long userId, Long ledgerId) {
    Map<String, Object> action = get(id, userId, ledgerId);
    if (!"PROPOSED".equals(Row.str(action, "status"))) {
      throw ApiException.conflict("ASSISTANT_ACTION_NOT_EDITABLE", "该助手操作当前不能修改");
    }
    Map<String, Object> merged = new LinkedHashMap<>();
    if (action.get("payload") instanceof Map<?, ?> existing) {
      existing.forEach((key, value) -> merged.put(String.valueOf(key), value));
    }
    if (patch != null) merged.putAll(patch);
    db.update("UPDATE assistant_action SET payload_json=?, version=version+1 "
        + "WHERE id=? AND status='PROPOSED'", stringify(merged), id);
    return get(id, userId, ledgerId);
  }

  private void requireOwnedConversation(long conversationId, Long userId, Long ledgerId) {
    Long owned = db.queryForObject(
        "SELECT COUNT(*) FROM assistant_conversation WHERE id = ? AND user_id = ? AND ledger_id = ?",
        Long.class, conversationId, userId, ledgerId);
    if (owned == null || owned == 0) {
      throw ApiException.notFound("ASSISTANT_CONVERSATION_NOT_FOUND", "助手会话不存在");
    }
  }

  private String stringify(Object value) {
    try { return json.writeValueAsString(value); }
    catch (JsonProcessingException e) { throw new IllegalArgumentException("助手操作无法序列化", e); }
  }

  private Object parse(String value) {
    try { return json.readValue(value, new TypeReference<Object>() {}); }
    catch (JsonProcessingException e) { throw new IllegalStateException("助手操作数据损坏", e); }
  }
}
