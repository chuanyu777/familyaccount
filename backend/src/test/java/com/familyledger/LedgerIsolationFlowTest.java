package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.db.Seeder;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerService;
import com.familyledger.service.AccountService;
import com.familyledger.service.CategoryService;
import com.familyledger.service.LedgerQueryService;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class LedgerIsolationFlowTest {
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledgers;
  @Autowired com.familyledger.service.LedgerService transactionLedgers;
  @Autowired LedgerAuthorization authorization;
  @Autowired AccountService accounts;
  @Autowired CategoryService categories;
  @Autowired LedgerQueryService queries;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
  }

  @Test
  void transactionListsAndIdsAreScopedToTheCurrentLedger() {
    long ownerA = insertUser("账本A用户");
    long ownerB = insertUser("账本B用户");
    long ledgerA = ledgers.createLedger(ownerA, "账本A").id();
    long ledgerB = ledgers.createLedger(ownerB, "账本B").id();
    LedgerContext contextA = authorization.requireMembership(AuthPrincipal.ledgerUser(ownerA), ledgerA);
    LedgerContext contextB = authorization.requireMembership(AuthPrincipal.ledgerUser(ownerB), ledgerB);
    long accountA = accounts.defaultAccountId(contextA);
    long categoryA = ((Number) categories.ensureDefault(contextA, "expense").get("id")).longValue();

    Map<String, Object> input = new HashMap<>();
    input.put("type", "expense");
    input.put("amount", "12.00");
    input.put("accountId", accountA);
    input.put("categoryId", categoryA);
    input.put("occurredOn", "2026-09-29");
    long transactionId = ((Number) ((Map<?, ?>) transactionLedgers
        .createTransaction(AuthPrincipal.ledgerUser(ownerA), contextA, input).get("transaction")).get("id"))
        .longValue();

    assertThat(queries.list(contextA, "2026-09", null, null, null, null).get("total")).isEqualTo(1L);
    assertThat(queries.list(contextB, "2026-09", null, null, null, null).get("total")).isEqualTo(0L);
    assertThatThrownBy(() -> queries.get(contextB, transactionId))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).getStatus()).isEqualTo(404));
  }

  @Test
  void transferMovesBalanceFromSourceToTargetWithinTheLedger() {
    long owner = insertUser("转账用户");
    long ledgerId = ledgers.createLedger(owner, "转账账本").id();
    LedgerContext context = authorization.requireMembership(AuthPrincipal.ledgerUser(owner), ledgerId);
    long sourceAccount = accounts.defaultAccountId(context);
    long targetAccount = ((Number) accounts.create(context, "目标账户").get("id")).longValue();

    Map<String, Object> income = new HashMap<>();
    income.put("type", "income");
    income.put("amount", "100.00");
    income.put("accountId", sourceAccount);
    income.put("occurredOn", "2026-09-29");
    transactionLedgers.createTransaction(AuthPrincipal.ledgerUser(owner), context, income);

    Map<String, Object> transfer = new HashMap<>();
    transfer.put("type", "transfer");
    transfer.put("amount", "20.00");
    transfer.put("accountId", sourceAccount);
    transfer.put("toAccountId", targetAccount);
    transfer.put("occurredOn", "2026-09-29");
    transactionLedgers.createTransaction(AuthPrincipal.ledgerUser(owner), context, transfer);

    assertThat(db.queryForObject("SELECT balance_cents FROM account WHERE id = ? AND ledger_id = ?", Long.class,
        sourceAccount, ledgerId)).isEqualTo(8000L);
    assertThat(db.queryForObject("SELECT balance_cents FROM account WHERE id = ? AND ledger_id = ?", Long.class,
        targetAccount, ledgerId)).isEqualTo(2000L);
  }

  private long insertUser(String name) {
    return com.familyledger.common.Db.insert(db,
        "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", name,
        com.familyledger.common.Time.now());
  }
}
