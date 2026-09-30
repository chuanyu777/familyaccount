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
import com.familyledger.service.LiabilityService;
import com.familyledger.service.RepaymentService;
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
class RecordPermissionTest {
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledgers;
  @Autowired com.familyledger.service.LedgerService transactionLedgers;
  @Autowired LedgerAuthorization authorization;
  @Autowired AccountService accounts;
  @Autowired CategoryService categories;
  @Autowired LiabilityService liabilities;
  @Autowired RepaymentService repayments;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
  }

  @Test
  void memberCannotEditAnotherUsersTransactionButOwnerCan() {
    long owner = insertUser("所有者");
    long member = insertUser("成员");
    long ledgerId = ledgers.createLedger(owner, "共享账本").id();
    db.update("INSERT INTO ledger_membership "
        + "(ledger_id, user_id, role, web_login_allowed, active, joined_at) VALUES (?, ?, 'MEMBER', 0, 1, ?)",
        ledgerId, member, com.familyledger.common.Time.now());
    LedgerContext ownerContext = authorization.requireMembership(AuthPrincipal.ledgerUser(owner), ledgerId);
    LedgerContext memberContext = authorization.requireMembership(AuthPrincipal.ledgerUser(member), ledgerId);
    long accountId = accounts.defaultAccountId(ownerContext);
    long categoryId = ((Number) categories.ensureDefault(ownerContext, "expense").get("id")).longValue();
    Map<String, Object> input = new HashMap<>();
    input.put("type", "expense");
    input.put("amount", "5.00");
    input.put("accountId", accountId);
    input.put("categoryId", categoryId);
    Map<String, Object> created = transactionLedgers.createTransaction(AuthPrincipal.ledgerUser(owner), ownerContext, input);
    long transactionId = ((Number) ((Map<?, ?>) created.get("transaction")).get("id")).longValue();

    assertThatThrownBy(() -> transactionLedgers.updateTransaction(AuthPrincipal.ledgerUser(member), memberContext,
        transactionId, Map.of("amount", "9.00")))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("RECORD_CREATOR_REQUIRED"));
    transactionLedgers.updateTransaction(AuthPrincipal.ledgerUser(owner), ownerContext, transactionId,
        Map.of("amount", "9.00"));
    assertThat(db.queryForObject("SELECT amount_cents FROM txn WHERE id = ? AND ledger_id = ?", Long.class,
        transactionId, ledgerId)).isEqualTo(900L);
  }

  @Test
  void archivedAccountCannotBeUsedAndOnlyOwnerCanArchiveIt() {
    long owner = insertUser("所有者");
    long member = insertUser("成员");
    long ledgerId = ledgers.createLedger(owner, "归档账本").id();
    db.update("INSERT INTO ledger_membership "
        + "(ledger_id, user_id, role, web_login_allowed, active, joined_at) VALUES (?, ?, 'MEMBER', 0, 1, ?)",
        ledgerId, member, com.familyledger.common.Time.now());
    LedgerContext ownerContext = authorization.requireMembership(AuthPrincipal.ledgerUser(owner), ledgerId);
    LedgerContext memberContext = authorization.requireMembership(AuthPrincipal.ledgerUser(member), ledgerId);
    long accountId = accounts.defaultAccountId(ownerContext);

    assertThatThrownBy(() -> accounts.archive(memberContext, accountId))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).getStatus()).isEqualTo(403));
    accounts.archive(ownerContext, accountId);
    assertThatThrownBy(() -> accounts.getForEntry(ownerContext, accountId))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("ACCOUNT_ARCHIVED"));
    accounts.restore(ownerContext, accountId);
    assertThat(accounts.getForEntry(ownerContext, accountId).get("id")).isEqualTo(accountId);
  }

  @Test
  void ownerRepaymentUpdatePreservesCreatorAndGeneratedTransactionIsProtected() {
    long owner = insertUser("还款所有者");
    long member = insertUser("还款成员");
    long ledgerId = ledgers.createLedger(owner, "还款账本").id();
    db.update("INSERT INTO ledger_membership "
        + "(ledger_id, user_id, role, web_login_allowed, active, joined_at) VALUES (?, ?, 'MEMBER', 0, 1, ?)",
        ledgerId, member, com.familyledger.common.Time.now());
    LedgerContext ownerContext = authorization.requireMembership(AuthPrincipal.ledgerUser(owner), ledgerId);
    LedgerContext memberContext = authorization.requireMembership(AuthPrincipal.ledgerUser(member), ledgerId);
    long liabilityId = ((Number) liabilities.create(ownerContext, Map.of(
        "name", "房贷", "remaining", "20.00", "monthlyPayment", "5.00")).get("id")).longValue();
    long accountId = accounts.defaultAccountId(memberContext);

    Map<String, Object> input = new HashMap<>();
    input.put("liabilityId", liabilityId);
    input.put("accountId", accountId);
    input.put("amount", "5.00");
    Map<String, Object> created = repayments.create(AuthPrincipal.ledgerUser(member), memberContext, input);
    long repaymentId = ((Number) created.get("id")).longValue();
    long transactionId = ((Number) created.get("transaction_id")).longValue();
    assertThat(created.get("created_by_user_id")).isEqualTo(member);

    Map<String, Object> updated = repayments.update(AuthPrincipal.ledgerUser(owner), ownerContext,
        repaymentId, Map.of("amount", "3.00"));
    assertThat(updated.get("created_by_user_id")).isEqualTo(member);
    assertThat(db.queryForObject("SELECT remaining_cents FROM liability WHERE id = ? AND ledger_id = ?", Long.class,
        liabilityId, ledgerId)).isEqualTo(1700L);
    assertThat(db.queryForObject("SELECT balance_cents FROM account WHERE id = ? AND ledger_id = ?", Long.class,
        accountId, ledgerId)).isEqualTo(-300L);

    assertThatThrownBy(() -> transactionLedgers.updateTransaction(AuthPrincipal.ledgerUser(owner), ownerContext,
        transactionId, Map.of("amount", "1.00")))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("GENERATED_BY_REPAYMENT"));
  }

  @Test
  void archivedCategoryCannotBeSelectedForNewTransactionOrOverpaymentChangesNothing() {
    long owner = insertUser("分类所有者");
    long ledgerId = ledgers.createLedger(owner, "分类账本").id();
    LedgerContext context = authorization.requireMembership(AuthPrincipal.ledgerUser(owner), ledgerId);
    long accountId = accounts.defaultAccountId(context);
    long categoryId = ((Number) categories.upsert(context, "expense", "已归档分类").get("id")).longValue();
    categories.archive(context, categoryId);

    Map<String, Object> transaction = new HashMap<>();
    transaction.put("type", "expense");
    transaction.put("amount", "1.00");
    transaction.put("accountId", accountId);
    transaction.put("categoryName", "已归档分类");
    assertThatThrownBy(() -> transactionLedgers.createTransaction(AuthPrincipal.ledgerUser(owner), context, transaction))
        .isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo("CATEGORY_ARCHIVED"));

    long liabilityId = ((Number) liabilities.create(context, Map.of(
        "name", "小额负债", "remaining", "5.00", "monthlyPayment", "5.00")).get("id")).longValue();
    assertThatThrownBy(() -> repayments.create(AuthPrincipal.ledgerUser(owner), context, Map.of(
        "liabilityId", liabilityId, "amount", "6.00", "accountId", accountId)))
        .isInstanceOf(ApiException.class);
    assertThat(db.queryForObject("SELECT balance_cents FROM account WHERE id = ? AND ledger_id = ?", Long.class,
        accountId, ledgerId)).isEqualTo(0L);
    assertThat(db.queryForObject("SELECT remaining_cents FROM liability WHERE id = ? AND ledger_id = ?", Long.class,
        liabilityId, ledgerId)).isEqualTo(500L);
  }

  private long insertUser(String name) {
    return com.familyledger.common.Db.insert(db,
        "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", name,
        com.familyledger.common.Time.now());
  }
}
