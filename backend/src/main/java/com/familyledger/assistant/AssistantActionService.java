package com.familyledger.assistant;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.service.LedgerService;
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

  public AssistantActionService(JdbcTemplate db, ObjectMapper json, LedgerService ledger) {
    this.db = db;
    this.json = json;
    this.ledger = ledger;
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

  @Transactional
  public Map<String, Object> confirm(long id, AuthPrincipal principal, LedgerContext context) {
    Map<String, Object> action = get(id, context.userId(), context.ledgerId());
    String status = Row.str(action, "status");
    if ("CONFIRMED".equals(status) || "EXECUTED".equals(status)) return action;
    if (!"PROPOSED".equals(status)) {
      throw ApiException.conflict("ASSISTANT_ACTION_NOT_CONFIRMABLE", "该助手操作当前不能确认");
    }
    if (!"create_transaction".equals(Row.str(action, "action_type"))) {
      throw ApiException.badRequest("ASSISTANT_ACTION_UNSUPPORTED", "暂不支持该操作类型");
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) action.get("payload");
    Map<String, Object> result = ledger.createTransaction(principal, context, payload);
    String now = Time.now();
    int changed = db.update("UPDATE assistant_action SET status='EXECUTED', result_json=?, "
        + "version=version+1, confirmed_at=? WHERE id=? AND status='PROPOSED'",
        stringify(result), now, id);
    if (changed != 1) return get(id, context.userId(), context.ledgerId());
    return get(id, context.userId(), context.ledgerId());
  }

  @Transactional
  public void cancel(long id, Long userId, Long ledgerId) {
    get(id, userId, ledgerId);
    int changed = db.update("UPDATE assistant_action SET status='CANCELLED', version=version+1 "
        + "WHERE id=? AND status='PROPOSED'", id);
    if (changed == 0) throw ApiException.conflict("ASSISTANT_ACTION_NOT_CANCELABLE", "该助手操作当前不能取消");
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
