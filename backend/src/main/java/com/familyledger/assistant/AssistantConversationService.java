package com.familyledger.assistant;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 助手会话与消息持久化；Agent Runtime 不直接访问数据库。 */
@Service
public class AssistantConversationService {
  private final JdbcTemplate db;
  private final ObjectMapper json;

  public AssistantConversationService(JdbcTemplate db, ObjectMapper json) {
    this.db = db;
    this.json = json;
  }

  @Transactional
  public Map<String, Object> create(Long userId, Long ledgerId, String title) {
    String now = Time.now();
    long id = Db.insert(db,
        "INSERT INTO assistant_conversation (user_id, ledger_id, title, created_at, updated_at) "
            + "VALUES (?, ?, ?, ?, ?)", userId, ledgerId,
        title == null || title.isBlank() ? "家庭财务助手" : title.trim(), now, now);
    return get(id, userId, ledgerId);
  }

  /** 仅返回当前用户在当前账本下的会话；跨账本、跨用户的会话一律不可见。 */
  public List<Map<String, Object>> list(Long userId, Long ledgerId) {
    return db.queryForList("SELECT id, user_id, ledger_id, title, created_at, updated_at "
        + "FROM assistant_conversation WHERE user_id = ? AND ledger_id = ? "
        + "ORDER BY updated_at DESC, id DESC", userId, ledgerId);
  }

  public Map<String, Object> get(long id, Long userId, Long ledgerId) {
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id, user_id, ledger_id, title, created_at, updated_at "
            + "FROM assistant_conversation WHERE id = ? AND user_id = ? AND ledger_id = ?",
        id, userId, ledgerId);
    if (rows.isEmpty()) throw ApiException.notFound("ASSISTANT_CONVERSATION_NOT_FOUND", "助手会话不存在");
    return rows.get(0);
  }

  public List<Map<String, Object>> messages(long conversationId, Long userId, Long ledgerId) {
    get(conversationId, userId, ledgerId);
    return db.queryForList("SELECT id, conversation_id, role, content, blocks_json, created_at "
        + "FROM assistant_message WHERE conversation_id = ? ORDER BY id", conversationId);
  }

  @Transactional
  public Map<String, Object> appendUserMessage(long conversationId, Long userId, Long ledgerId,
      String content) {
    get(conversationId, userId, ledgerId);
    if (content == null || content.isBlank()) {
      throw ApiException.badRequest("VALIDATION_FAILED", "消息内容不能为空");
    }
    String now = Time.now();
    long messageId = Db.insert(db,
        "INSERT INTO assistant_message (conversation_id, role, content, created_at) "
            + "VALUES (?, 'user', ?, ?)", conversationId, content.trim(), now);
    db.update("UPDATE assistant_conversation SET updated_at = ? WHERE id = ?", now, conversationId);
    return message(conversationId, messageId);
  }

  @Transactional
  public Map<String, Object> appendAssistantMessage(long conversationId, Long userId, Long ledgerId,
      String content, Object blocks) {
    get(conversationId, userId, ledgerId);
    String now = Time.now();
    String blocksJson = blocks == null ? null : stringify(blocks);
    long messageId = Db.insert(db,
        "INSERT INTO assistant_message (conversation_id, role, content, blocks_json, created_at) "
            + "VALUES (?, 'assistant', ?, ?, ?)", conversationId, content, blocksJson, now);
    db.update("UPDATE assistant_conversation SET updated_at = ? WHERE id = ?", now, conversationId);
    return message(conversationId, messageId);
  }

  public Map<String, Object> message(long conversationId, long messageId) {
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id, conversation_id, role, content, blocks_json, created_at "
            + "FROM assistant_message WHERE conversation_id = ? AND id = ?",
        conversationId, messageId);
    if (rows.isEmpty()) throw ApiException.notFound("ASSISTANT_MESSAGE_NOT_FOUND", "助手消息不存在");
    Map<String, Object> row = new LinkedHashMap<>(rows.get(0));
    String blocks = Row.strOrNull(row, "blocks_json");
    if (blocks != null) {
      try {
        row.put("blocks", json.readValue(blocks, Object.class));
      } catch (JsonProcessingException e) {
        throw new IllegalStateException("助手消息 blocks_json 损坏", e);
      }
    }
    return row;
  }

  private String stringify(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (JsonProcessingException e) {
      throw new IllegalArgumentException("助手响应无法序列化", e);
    }
  }
}
