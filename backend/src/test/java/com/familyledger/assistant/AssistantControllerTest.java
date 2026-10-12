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
import com.familyledger.service.AccountService;
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
@SpringBootTest(properties = "assistant.internal-token=test-internal-token")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssistantControllerTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledger;
  @Autowired AccountService accounts;
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
    if (url.startsWith("/api/assistant/internal/tools/")) {
      request.header("X-Assistant-Internal-Token", "test-internal-token");
    }
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

  /** 需求 10：草稿未确认前不改变账目；需求 7：确认卡可修改后重新预览。 */
  @Test
  void draftStaysOutOfLedgerUntilConfirmedAndCanBeEdited() throws Exception {
    long conversationId = call("POST", "/api/assistant/conversations", Map.of(), 200).get("id").asLong();
    long accountId = jdbc.queryForObject("SELECT id FROM account WHERE is_default = 1", Long.class);
    long actionId = call("POST", "/api/assistant/conversations/" + conversationId + "/actions", Map.of(
        "actionType", "create_transaction",
        "payload", Map.of("type", "expense", "amount", 10, "accountId", accountId,
            "categoryName", "日用品", "occurredOn", "2026-10-05", "note", "草稿不入账")), 200)
        .get("id").asLong();

    // 只出草稿：账目数量保持 reset() 预置的 3 笔，草稿记录本身不落账
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM txn WHERE ledger_id = ?", Long.class, ledgerId))
        .isEqualTo(3L);

    // 修改草稿：金额 10 → 25.50，version 递增，仍不落账
    JsonNode edited = call("POST", "/api/assistant/actions/" + actionId + "/update",
        Map.of("amount", "25.50", "note", "改过的草稿"), 200);
    assertThat(edited.get("version").asLong()).isEqualTo(1L);
    assertThat(edited.get("payload").get("amount").asText()).isEqualTo("25.50");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM txn WHERE ledger_id = ?", Long.class, ledgerId))
        .isEqualTo(3L);

    // 确认后才写入，且写入的是修改后的金额
    JsonNode executed = call("POST", "/api/assistant/actions/" + actionId + "/confirm", Map.of(), 200);
    assertThat(executed.get("status").asText()).isEqualTo("EXECUTED");
    assertThat(executed.get("result").get("transaction").get("amountCents").asLong()).isEqualTo(2_550L);

    // 已确认的草稿不能再改
    call("POST", "/api/assistant/actions/" + actionId + "/update", Map.of("amount", "1.00"), 409);
  }

  /** 内部工具要挡住非法参数，避免把不可执行的草稿端到用户面前。 */
  @Test
  void proposeToolValidatesDraftPayload() throws Exception {
    long conversationId = call("POST", "/api/assistant/conversations", Map.of(), 200).get("id").asLong();
    long accountId = jdbc.queryForObject("SELECT id FROM account WHERE is_default = 1", Long.class);
    Map<String, Object> context = Map.of("run_id", "run-validate", "user_id", owner.userId(),
        "ledger_id", ledgerId, "conversation_id", conversationId);

    call("POST", "/api/assistant/internal/tools/propose_create_transaction", Map.of(
        "context", context, "params", Map.of("type", "expense", "amount", "0")), 400);
    call("POST", "/api/assistant/internal/tools/propose_create_transaction", Map.of(
        "context", context, "params", Map.of("type", "refund", "amount", "10")), 400);
    // 账户必须属于当前账本：不属于（或不存在）的账户在本账本内查不到，返回 404
    call("POST", "/api/assistant/internal/tools/propose_create_transaction", Map.of(
        "context", context, "params", Map.of("type", "expense", "amount", "10", "accountId", 999_999)), 404);

    JsonNode created = call("POST", "/api/assistant/internal/tools/propose_create_transaction", Map.of(
        "context", context, "params", Map.of("type", "expense", "amount", "36.00",
            "accountId", accountId, "categoryName", "交通")), 200);
    assertThat(created.get("data").get("status").asText()).isEqualTo("PROPOSED");
    assertThat(created.get("data").get("draft").get("accountName").asText()).isNotBlank();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM txn WHERE ledger_id = ?", Long.class, ledgerId))
        .isEqualTo(3L);
  }

  @Test
  void transferDraftCarriesTargetAccountAndExecutes() throws Exception {
    long conversationId = call("POST", "/api/assistant/conversations", Map.of(), 200).get("id").asLong();
    long sourceId = jdbc.queryForObject("SELECT id FROM account WHERE is_default = 1", Long.class);
    long targetId = ((Number) accounts.create(ledgerContext, "银行卡", 1000L).get("id")).longValue();
    Map<String, Object> context = Map.of("run_id", "run-transfer", "user_id", owner.userId(),
        "ledger_id", ledgerId, "conversation_id", conversationId);

    JsonNode proposed = call("POST", "/api/assistant/internal/tools/propose_create_transaction", Map.of(
        "context", context, "params", Map.of("type", "transfer", "amount", "100.00",
            "accountId", sourceId, "toAccountId", targetId)), 200);
    JsonNode draft = proposed.get("data").get("draft");
    assertThat(draft.get("accountId").asLong()).isEqualTo(sourceId);
    assertThat(draft.get("toAccountId").asLong()).isEqualTo(targetId);
    assertThat(draft.get("toAccountName").asText()).isEqualTo("银行卡");

    long actionId = proposed.get("data").get("id").asLong();
    JsonNode executed = call("POST", "/api/assistant/actions/" + actionId + "/confirm", Map.of(), 200);
    assertThat(executed.get("status").asText()).isEqualTo("EXECUTED");
    assertThat(executed.get("result").get("transaction").get("toAccountId").asLong()).isEqualTo(targetId);
  }

  @Test
  void cancelPendingToolCancelsLatestDraft() throws Exception {
    long conversationId = call("POST", "/api/assistant/conversations", Map.of(), 200).get("id").asLong();
    Map<String, Object> context = Map.of("run_id", "run-cancel", "user_id", owner.userId(),
        "ledger_id", ledgerId, "conversation_id", conversationId);
    JsonNode proposed = call("POST", "/api/assistant/internal/tools/propose_create_transaction", Map.of(
        "context", context, "params", Map.of("type", "expense", "amount", "20.00",
            "categoryName", "交通")), 200);
    long actionId = proposed.get("data").get("id").asLong();

    JsonNode cancelled = call("POST", "/api/assistant/internal/tools/cancel_pending_action", Map.of(
        "context", context, "params", Map.of()), 200);
    assertThat(cancelled.get("data").get("id").asLong()).isEqualTo(actionId);
    assertThat(cancelled.get("data").get("status").asText()).isEqualTo("CANCELLED");
    call("POST", "/api/assistant/actions/" + actionId + "/confirm", Map.of(), 409);
  }

  @Test
  void investmentDraftUsesDefaultAccountWhenAccountIdIsMissing() throws Exception {
    long conversationId = call("POST", "/api/assistant/conversations", Map.of(), 200).get("id").asLong();
    long defaultId = jdbc.queryForObject("SELECT id FROM account WHERE is_default = 1", Long.class);
    Map<String, Object> context = Map.of("run_id", "run-investment", "user_id", owner.userId(),
        "ledger_id", ledgerId, "conversation_id", conversationId);

    JsonNode proposed = call("POST", "/api/assistant/internal/tools/propose_investment_buy", Map.of(
        "context", context, "params", Map.of("name", "指数基金", "value", "100.00")), 200);
    JsonNode draft = proposed.get("data").get("draft");
    assertThat(draft.get("accountId").asLong()).isEqualTo(defaultId);
    assertThat(draft.get("accountName").asText()).isEqualTo("默认账户");
  }

  @Test
  void internalToolReturns401ForWrongToken() throws Exception {
    MockHttpServletRequestBuilder request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders
        .post("/api/assistant/internal/tools/list_accounts")
        .header("X-Assistant-Internal-Token", "wrong-token")
        .contentType(MediaType.APPLICATION_JSON)
        .content(json.writeValueAsBytes(Map.of("context", Map.of(), "params", Map.of())));
    String response = mvc.perform(request).andExpect(status().isUnauthorized()).andReturn()
        .getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    assertThat(json.readTree(response).get("error").get("code").asText())
        .isEqualTo("ASSISTANT_INTERNAL_UNAUTHORIZED");
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
