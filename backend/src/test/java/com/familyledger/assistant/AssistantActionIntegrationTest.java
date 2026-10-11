package com.familyledger.assistant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.familyledger.TestDb;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.common.Time;
import com.familyledger.db.Seeder;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 助手草稿全类型端到端：propose → confirmLatest → 领域数据真实变化。
 * 覆盖 P0（确认链路）与 P1（各写操作草稿）的核心回归。
 */
@SpringBootTest
@ActiveProfiles("test")
class AssistantActionIntegrationTest {
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledgers;
  @Autowired com.familyledger.service.LedgerService transactions;
  @Autowired LedgerAuthorization authorization;
  @Autowired AssistantActionService actions;

  private LedgerContext context;
  private AuthPrincipal principal;
  private long conversationId;
  private long accountId;

  @BeforeEach
  void setUp() {
    TestDb.reset(db);
    seeder.ensureSeeded();
    long userId = insertUser("助手测试用户");
    long ledgerId = ledgers.createLedger(userId, "助手测试账本").id();
    db.update("UPDATE account SET balance_cents = 100000000 WHERE ledger_id = ?", ledgerId);
    accountId = ((Number) db.queryForMap("SELECT MIN(id) AS id FROM account WHERE ledger_id = ?",
        ledgerId).get("id")).longValue();
    context = authorization.requireMembership(AuthPrincipal.ledgerUser(userId), ledgerId);
    principal = AuthPrincipal.ledgerUser(userId);
    db.update("INSERT INTO assistant_conversation (user_id, ledger_id, created_at, updated_at) "
        + "VALUES (?, ?, ?, ?)", userId, ledgerId, Time.now(), Time.now());
    conversationId = latestConversation();
  }

  private long latestConversation() {
    return ((Number) db.queryForMap("SELECT MAX(id) AS id FROM assistant_conversation").get("id")).longValue();
  }

  private Map<String, Object> propose(String type, Map<String, Object> payload) {
    return actions.propose(conversationId, type, payload, context.userId(), context.ledgerId());
  }

  private Map<String, Object> confirmLatest() {
    return actions.confirmLatest(conversationId, principal, context);
  }

  private double accountBalance(long accountId) {
    return ((Number) db.queryForMap("SELECT balance_cents FROM account WHERE id = ?",
        accountId).get("balance_cents")).doubleValue() / 100;
  }

  @Test
  void calibrateAccountDraftChangesBalance() {
    propose("calibrate_account", Map.of("accountId", accountId, "actualBalance", "1234.56"));
    Map<String, Object> action = confirmLatest();
    assertThat(action.get("status")).isEqualTo("EXECUTED");
    assertThat(accountBalance(accountId)).isEqualTo(1234.56);
  }

  @Test
  void createAccountDraftCreatesAccount() {
    propose("create_account", Map.of("name", "微信零钱", "openingBalance", "500"));
    confirmLatest();
    Map<String, Object> row = db.queryForMap(
        "SELECT balance_cents FROM account WHERE ledger_id = ? AND name = '微信零钱'",
        context.ledgerId());
    assertThat(((Number) row.get("balance_cents")).doubleValue()).isEqualTo(50000.00);
  }

  @Test
  void upsertAssetDraftCreatesAssetWithSnapshot() {
    propose("upsert_asset", Map.of("name", "某股票", "value", "100000", "kind", "投资"));
    confirmLatest();
    Map<String, Object> asset = db.queryForMap(
        "SELECT value_cents, kind FROM asset WHERE ledger_id = ? AND name = '某股票'",
        context.ledgerId());
    assertThat(((Number) asset.get("value_cents")).doubleValue()).isEqualTo(10000000.00);
    assertThat(db.queryForList("SELECT id FROM asset_snapshot WHERE ledger_id = ?",
        context.ledgerId())).isNotEmpty();
  }

  @Test
  void investmentBuyDraftCreatesAssetAndDeductsAccount() {
    double balanceBefore = accountBalance(accountId);
    propose("investment_buy", Map.of("name", "贵州茅台", "value", "100000", "accountId", accountId));
    confirmLatest();
    // 资产 +100000
    assertThat(db.queryForList("SELECT id FROM asset WHERE ledger_id = ? AND name = '贵州茅台'",
        context.ledgerId())).isNotEmpty();
    // 账户 -100000
    assertThat(accountBalance(accountId)).isEqualTo(balanceBefore - 100000);
  }

  @Test
  void investmentBuyDraftFailsWhenBalanceInsufficient() {
    long accountId = ((Number) db.queryForMap(
        "SELECT MIN(id) AS id FROM account WHERE ledger_id = ?",
        context.ledgerId()).get("id")).longValue();
    propose("investment_buy", Map.of("name", "特斯拉", "value", "9999999", "accountId", accountId));
    assertThatThrownBy(this::confirmLatest)
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("余额不足");
    // 失败后草稿应仍为 PROPOSED（事务回滚）
    Map<String, Object> action = db.queryForMap(
        "SELECT status FROM assistant_action WHERE conversation_id = ? ORDER BY id DESC LIMIT 1",
        conversationId);
    assertThat(action.get("status")).isEqualTo("PROPOSED");
  }

  @Test
  void updateAndDeleteTransactionDraftsWork() {
    Map<String, Object> input = new HashMap<>();
    input.put("type", "expense");
    input.put("amount", "100.00");
    input.put("accountId", accountId);
    input.put("categoryName", "餐饮");
    long txnId = ((Number) ((Map<?, ?>) transactions.createTransaction(principal, context, input)
        .get("transaction")).get("id")).longValue();

    Map<String, Object> patch = new HashMap<>();
    patch.put("amount", "200.00");
    propose("update_transaction", Map.of("id", txnId, "patch", patch));
    confirmLatest();
    assertThat(((Number) db.queryForMap("SELECT amount_cents FROM txn WHERE id = ?", txnId)
        .get("amount_cents")).doubleValue()).isEqualTo(20000.00);

    propose("delete_transaction", Map.of("id", txnId));
    confirmLatest();
    assertThat(db.queryForList("SELECT id FROM txn WHERE id = ?", txnId)).isEmpty();
  }

  @Test
  void confirmLatestPicksNewestDraftAndExecutesInOrder() {
    long accountId = ((Number) db.queryForMap(
        "SELECT MIN(id) AS id FROM account WHERE ledger_id = ?",
        context.ledgerId()).get("id")).longValue();
    propose("create_account", Map.of("name", "第一张"));
    propose("create_account", Map.of("name", "第二张"));
    confirmLatest(); // 只确认最近一张
    assertThat(db.queryForList("SELECT id FROM account WHERE name = '第二张'")).isNotEmpty();
    assertThat(db.queryForList("SELECT id FROM account WHERE name = '第一张'")).isEmpty();
    // 再确认一次 → 执行第一张
    confirmLatest();
    assertThat(db.queryForList("SELECT id FROM account WHERE name = '第一张'")).isNotEmpty();
    // 没有更多待确认 → 报错
    assertThatThrownBy(this::confirmLatest)
        .isInstanceOf(ApiException.class)
        .hasMessageContaining("没有待确认");
  }

  @Test
  void pendingListOnlyShowsProposed() {
    propose("create_account", Map.of("name", "待确认"));
    propose("calibrate_account", Map.of("accountId", accountId, "actualBalance", "1.00"));
    confirmLatest();
    List<Map<String, Object>> pending = actions.listPending(
        conversationId, context.userId(), context.ledgerId());
    assertThat(pending).hasSize(1);
    assertThat(pending.get(0).get("action_type")).isEqualTo("create_account");
  }

  private long insertUser(String name) {
    var keys = new org.springframework.jdbc.support.GeneratedKeyHolder();
    db.update(con -> {
      var ps = con.prepareStatement(
          "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", new String[] {"id"});
      ps.setString(1, name);
      ps.setString(2, Time.now());
      return ps;
    }, keys);
    return keys.getKey().longValue();
  }
}