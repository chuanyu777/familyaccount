package com.familyledger.assistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familyledger.TestDb;
import com.familyledger.auth.AuthGuard;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.db.Seeder;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.service.LedgerService;
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

/** 用多分类、多账户数据覆盖助手查询、会话和确认写入的完整 HTTP 链路。 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssistantControllerTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledger;
  @Autowired ObjectMapper json;
  private AuthPrincipal owner;
  private LedgerContext ledgerContext;
  private long ledgerId;

  @BeforeEach
  void reset() {
    TestDb.reset(jdbc);
    seeder.ensureSeeded();
    long ownerId = jdbc.queryForObject("SELECT user_id FROM web_credential WHERE username = 'ledger-owner'", Long.class);
    ledgerId = jdbc.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);
    owner = AuthPrincipal.webLedgerUser(ownerId);
    ledgerContext = new LedgerContext(ledgerId, ownerId, "OWNER", true);
    long walletId = jdbc.queryForObject("SELECT id FROM account WHERE is_default = 1", Long.class);
    ledger.createTransaction(owner, ledgerContext, Map.of("type", "income", "amount", 9000, "accountId", walletId,
        "categoryName", "工资", "occurredOn", "2026-10-01"));
    ledger.createTransaction(owner, ledgerContext, Map.of("type", "expense", "amount", 120.50, "accountId", walletId,
        "categoryName", "餐饮", "occurredOn", "2026-10-02", "note", "周末聚餐"));
    ledger.createTransaction(owner, ledgerContext, Map.of("type", "expense", "amount", 38, "accountId", walletId,
        "categoryName", "交通", "occurredOn", "2026-10-03"));
  }

  private JsonNode call(String method, String url, Object body, int expected) throws Exception {
    MockHttpServletRequestBuilder request = switch (method) {
      case "GET" -> org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url);
      case "POST" -> org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url);
      default -> throw new IllegalArgumentException(method);
    };
    request.requestAttr(AuthGuard.REQUEST_PRINCIPAL, owner).header("X-Ledger-Id", ledgerId);
    if (body != null) request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body));
    String response = mvc.perform(request).andExpect(status().is(expected)).andReturn()
        .getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    return response.isEmpty() ? json.createObjectNode() : json.readTree(response);
  }

  @Test
  void persistsConversationAndAnswersAcrossFinancialQueryShapes() throws Exception {
    long conversationId = call("POST", "/api/assistant/conversations", Map.of("title", "十月账本"), 200)
        .get("id").asLong();

    JsonNode period = call("POST", "/api/assistant/conversations/" + conversationId + "/messages",
        Map.of("content", "本月支出是多少？"), 200);
    assertThat(period.get("role").asText()).isEqualTo("assistant");
    assertThat(period.get("content").asText()).contains("本月收支汇总");
    assertThat(period.get("blocks").get(0).get("type").asText()).isEqualTo("metric");
    assertThat(period.get("blocks").get(0).get("data").get("expenseCents").asLong())
        .isEqualTo(15_850L);

    JsonNode categories = call("POST", "/api/assistant/conversations/" + conversationId + "/messages",
        Map.of("content", "钱都花在哪些分类？"), 200);
    assertThat(categories.get("blocks").get(0).get("type").asText()).isEqualTo("category_breakdown");
    assertThat(categories.get("blocks").get(0).get("data")).hasSize(2);

    JsonNode accounts = call("POST", "/api/assistant/conversations/" + conversationId + "/messages",
        Map.of("content", "看看账户余额"), 200);
    assertThat(accounts.get("blocks").get(0).get("type").asText()).isEqualTo("account_list");
    assertThat(accounts.get("blocks").get(0).get("data")).hasSize(1);

    JsonNode messages = call("GET", "/api/assistant/conversations/" + conversationId + "/messages", null, 200);
    assertThat(messages).hasSize(6);
    assertThat(call("GET", "/api/assistant/conversations", null, 200).get(0).get("title").asText())
        .isEqualTo("十月账本");
  }

  @Test
  void executesDraftedTransactionExactlyOnceAfterConfirmation() throws Exception {
    long conversationId = call("POST", "/api/assistant/conversations", Map.of(), 200).get("id").asLong();
    long accountId = jdbc.queryForObject("SELECT id FROM account WHERE is_default = 1", Long.class);
    JsonNode action = call("POST", "/api/assistant/conversations/" + conversationId + "/actions", Map.of(
        "actionType", "create_transaction",
        "payload", Map.of("type", "expense", "amount", 66.60, "accountId", accountId,
            "categoryName", "日用品", "occurredOn", "2026-10-05", "note", "测试草稿")), 200);
    long actionId = action.get("id").asLong();
    assertThat(action.get("status").asText()).isEqualTo("PROPOSED");

    JsonNode executed = call("POST", "/api/assistant/actions/" + actionId + "/confirm", Map.of(), 200);
    assertThat(executed.get("status").asText()).isEqualTo("EXECUTED");
    assertThat(executed.get("result").get("transaction").get("amountCents").asLong()).isEqualTo(6_660L);

    JsonNode repeated = call("POST", "/api/assistant/actions/" + actionId + "/confirm", Map.of(), 200);
    assertThat(repeated.get("status").asText()).isEqualTo("EXECUTED");
    Long count = jdbc.queryForObject("SELECT COUNT(*) FROM txn WHERE note = '测试草稿'", Long.class);
    assertThat(count).isEqualTo(1L);
  }

  @Test
  void cancelledDraftCannotBeConfirmed() throws Exception {
    long conversationId = call("POST", "/api/assistant/conversations", Map.of(), 200).get("id").asLong();
    long actionId = call("POST", "/api/assistant/conversations/" + conversationId + "/actions", Map.of(
        "actionType", "create_transaction", "payload", Map.of("type", "expense", "amount", 12)), 200)
        .get("id").asLong();
    call("POST", "/api/assistant/actions/" + actionId + "/cancel", Map.of(), 200);
    call("POST", "/api/assistant/actions/" + actionId + "/confirm", Map.of(), 409);
  }
}
