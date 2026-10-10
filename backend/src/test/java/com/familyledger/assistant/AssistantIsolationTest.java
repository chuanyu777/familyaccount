package com.familyledger.assistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familyledger.TestDb;
import com.familyledger.auth.AuthGuard;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.Db;
import com.familyledger.common.Time;
import com.familyledger.db.Seeder;
import com.familyledger.ledger.LedgerService;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * 助手会话与操作的租户隔离回归测试。
 *
 * <p>背景：{@code AssistantConversationService.list()} 曾完全没有过滤，任何登录用户都能看到
 * 全库会话；小程序端又直接取 {@code conversations[0]}，于是新建账本打开助手时会读到别的账本
 * 的既有会话。{@code get/messages/append*} 与 {@code AssistantActionService} 的
 * {@code get/confirm/cancel} 同样缺少归属校验。本测试锁定两个越界面：
 *
 * <ul>
 *   <li>同一用户的另一个账本（用户报告的「新建账本却有历史数据」）</li>
 *   <li>同一账本的另一个用户</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssistantIsolationTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledgers;
  @Autowired ObjectMapper json;

  private long userAId;
  private long userBId;
  private long ledgerA;
  private long ledgerB;
  private AuthPrincipal userA;
  private AuthPrincipal userB;

  @BeforeEach
  void reset() {
    TestDb.reset(jdbc);
    seeder.ensureSeeded();
    userAId = insertUser("隔离测试甲");
    userBId = insertUser("隔离测试乙");
    ledgerA = ledgers.createLedger(userAId, "隔离账本A").id();
    ledgerB = ledgers.createLedger(userBId, "隔离账本B").id();
    // 交叉加入成员：甲也在账本B，乙也在账本A，才能分别覆盖「同用户跨账本」与「同账本跨用户」。
    addMembership(ledgerB, userAId);
    addMembership(ledgerA, userBId);
    userA = AuthPrincipal.ledgerUser(userAId);
    userB = AuthPrincipal.ledgerUser(userBId);
  }

  @Test
  void conversationListIsScopedToCurrentUserAndLedger() throws Exception {
    createConversation(userA, ledgerA, "甲的会话");

    assertThat(call(userA, ledgerA, "GET", "/api/assistant/conversations", null, 200))
        .hasSize(1);
    // 回归点：同一用户的另一个账本必须是空的（修复前这里会返回甲在账本A的会话）
    assertThat(call(userA, ledgerB, "GET", "/api/assistant/conversations", null, 200))
        .isEmpty();
    // 同一账本的另一个用户也看不到
    assertThat(call(userB, ledgerA, "GET", "/api/assistant/conversations", null, 200))
        .isEmpty();
  }

  @Test
  void foreignConversationCannotBeReadOrAppended() throws Exception {
    long conversationId = createConversation(userA, ledgerA, "甲的会话");

    // 同账本的其他用户
    call(userB, ledgerA, "GET", "/api/assistant/conversations/" + conversationId, null, 404);
    call(userB, ledgerA, "GET", "/api/assistant/conversations/" + conversationId + "/messages", null, 404);
    call(userB, ledgerA, "POST", "/api/assistant/conversations/" + conversationId + "/messages",
        Map.of("content", "试探"), 404);
    // 同用户的其它账本
    call(userA, ledgerB, "GET", "/api/assistant/conversations/" + conversationId, null, 404);
    call(userA, ledgerB, "POST", "/api/assistant/conversations/" + conversationId + "/messages",
        Map.of("content", "试探"), 404);

    // 归属方仍可正常读取
    assertThat(call(userA, ledgerA, "GET", "/api/assistant/conversations/" + conversationId, null, 200)
        .get("id").asLong()).isEqualTo(conversationId);
    assertThat(call(userA, ledgerA, "GET", "/api/assistant/conversations/" + conversationId + "/messages",
        null, 200)).isEmpty();
  }

  @Test
  void eachUserKeepsAnIndependentConversationInTheSameLedger() throws Exception {
    long conversationA = createConversation(userA, ledgerA, "甲的会话");
    long conversationB = createConversation(userB, ledgerA, "乙的会话");

    assertThat(conversationA).isNotEqualTo(conversationB);
    assertThat(call(userA, ledgerA, "GET", "/api/assistant/conversations", null, 200))
        .hasSize(1)
        .allSatisfy(node -> assertThat(node.get("id").asLong()).isEqualTo(conversationA));
    assertThat(call(userB, ledgerA, "GET", "/api/assistant/conversations", null, 200))
        .hasSize(1)
        .allSatisfy(node -> assertThat(node.get("id").asLong()).isEqualTo(conversationB));
    // 各自的会话归属写入正确
    assertThat(jdbc.queryForObject(
        "SELECT user_id FROM assistant_conversation WHERE id = ?", Long.class, conversationA))
        .isEqualTo(userAId);
    assertThat(jdbc.queryForObject(
        "SELECT ledger_id FROM assistant_conversation WHERE id = ?", Long.class, conversationA))
        .isEqualTo(ledgerA);
  }

  @Test
  void assistantActionsAreScopedToTheirConversationLedger() throws Exception {
    long conversationId = createConversation(userA, ledgerA, "甲的会话");
    long actionId = call(userA, ledgerA, "POST",
        "/api/assistant/conversations/" + conversationId + "/actions",
        Map.of("actionType", "create_transaction",
            "payload", Map.of("type", "expense", "amount", 12)),
        200).get("id").asLong();

    // 归属方可见、可确认
    assertThat(call(userA, ledgerA, "GET", "/api/assistant/actions/" + actionId, null, 200)
        .get("status").asText()).isEqualTo("PROPOSED");

    // 跨用户 / 跨账本一律 404，且不能触发确认
    call(userB, ledgerA, "GET", "/api/assistant/actions/" + actionId, null, 404);
    call(userB, ledgerA, "POST", "/api/assistant/actions/" + actionId + "/confirm", Map.of(), 404);
    call(userA, ledgerB, "GET", "/api/assistant/actions/" + actionId, null, 404);
    call(userA, ledgerB, "POST", "/api/assistant/actions/" + actionId + "/cancel", Map.of(), 404);

    // 越权尝试后操作仍是 PROPOSED，没有被任何一方改动
    assertThat(call(userA, ledgerA, "GET", "/api/assistant/actions/" + actionId, null, 200)
        .get("status").asText()).isEqualTo("PROPOSED");
  }

  private long createConversation(AuthPrincipal principal, long ledgerId, String title)
      throws Exception {
    return call(principal, ledgerId, "POST", "/api/assistant/conversations", Map.of("title", title), 200)
        .get("id").asLong();
  }

  private JsonNode call(AuthPrincipal principal, long ledgerId, String method, String url,
      Object body, int expected) throws Exception {
    MockHttpServletRequestBuilder request = switch (method) {
      case "GET" -> MockMvcRequestBuilders.get(url);
      case "POST" -> MockMvcRequestBuilders.post(url);
      default -> throw new IllegalArgumentException(method);
    };
    request.requestAttr(AuthGuard.REQUEST_PRINCIPAL, principal).header("X-Ledger-Id", ledgerId);
    if (body != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body));
    }
    String response = mvc.perform(request).andExpect(status().is(expected)).andReturn()
        .getResponse().getContentAsString(StandardCharsets.UTF_8);
    return response.isEmpty() ? json.createObjectNode() : json.readTree(response);
  }

  private long insertUser(String displayName) {
    return Db.insert(jdbc, "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)",
        displayName, Time.now());
  }

  private void addMembership(long ledgerId, long userId) {
    jdbc.update("INSERT INTO ledger_membership "
        + "(ledger_id, user_id, role, web_login_allowed, active, joined_at) "
        + "VALUES (?, ?, 'MEMBER', 0, 1, ?)", ledgerId, userId, Time.now());
  }
}
