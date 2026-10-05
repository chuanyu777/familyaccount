package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.db.Seeder;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.service.AccountService;
import com.familyledger.service.LedgerService;
import com.familyledger.service.LiabilityService;
import com.familyledger.service.RepaymentService;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class HistoricalCorrectionTest {
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;
  @Autowired LedgerAuthorization authorization;
  @Autowired AccountService accounts;
  @Autowired LedgerService transactions;
  @Autowired LiabilityService liabilities;
  @Autowired RepaymentService repayments;
  AuthPrincipal owner;
  AuthPrincipal member;
  LedgerContext context;
  LedgerContext memberContext;
  long account;
  long liability;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
    long ledger = db.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);
    owner = AuthPrincipal.webLedgerUser(db.queryForObject(
        "SELECT user_id FROM web_credential WHERE username = 'ledger-owner'", Long.class));
    member = AuthPrincipal.webLedgerUser(db.queryForObject(
        "SELECT user_id FROM web_credential WHERE username = 'ledger-member'", Long.class));
    context = authorization.requireMembership(owner, ledger);
    memberContext = authorization.requireMembership(member, ledger);
    account = accounts.defaultAccountId(context);
    liability = ((Number) liabilities.create(context, Map.of(
        "name", "Loan", "remaining", "100.00", "monthlyPayment", "10.00")).get("id")).longValue();
  }

  @Test
  void repaymentDeletionRemovesBothRecordsAndRestoresBalances() {
    Map<String, Object> repayment = createRepayment();
    repayments.delete(member, memberContext, id(repayment));
    assertDeleted(repayment);
  }

  @Test
  void archivedRepaymentCanKeepItsAccountThenMoveToAnActiveAccountAndBeDeleted() {
    Map<String, Object> repayment = createRepayment();
    accounts.archive(context, account);
    repayments.update(member, memberContext, id(repayment), Map.of("amount", "6.00", "accountId", account));
    assertBalance(account, -600);
    assertThat(db.queryForObject("SELECT amount_cents FROM txn WHERE id = ?", Long.class,
        repayment.get("transaction_id"))).isEqualTo(600L);
    long replacement = id(accounts.create(context, "Replacement"));
    repayments.update(owner, context, id(repayment), Map.of("accountId", replacement));
    assertBalance(account, 0);
    assertBalance(replacement, -600);
    accounts.archive(context, replacement);
    repayments.delete(owner, context, id(repayment));
    assertDeleted(repayment);
    assertBalance(replacement, 0);
  }

  @Test
  void archivedTransferCorrectionsAndDeletionRestoreBothSides() {
    long target = id(accounts.create(context, "Target"));
    long txn = transactionId(transactions.createTransaction(member, memberContext,
        Map.of("type", "transfer", "amount", "10.00", "accountId", account, "toAccountId", target)));
    accounts.archive(context, account);
    accounts.archive(context, target);
    transactions.updateTransaction(member, memberContext, txn, Map.of("amount", "6.00"));
    assertBalance(account, -600);
    assertBalance(target, 600);
    long replacement = id(accounts.create(context, "Replacement"));
    transactions.updateTransaction(owner, context, txn, Map.of("accountId", replacement));
    assertBalance(account, 0);
    assertBalance(replacement, -600);
    transactions.deleteTransaction(member, memberContext, txn);
    assertBalance(replacement, 0);
    assertBalance(target, 0);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM txn WHERE id = ?", Integer.class, txn)).isZero();
  }

  @Test
  void newWritesAndReplacementAccountsStillRejectArchivedAccountsWithoutPartialChanges() {
    Map<String, Object> repayment = createRepayment();
    long txn = transactionId(transactions.createTransaction(owner, context,
        Map.of("type", "income", "amount", "20.00", "accountId", account)));
    long archived = id(accounts.create(context, "Archived"));
    accounts.archive(context, archived);
    assertCode(() -> repayments.create(owner, context,
        Map.of("liabilityId", liability, "accountId", archived, "amount", "1.00")), "ACCOUNT_ARCHIVED");
    assertCode(() -> transactions.createTransaction(owner, context,
        Map.of("type", "expense", "amount", "1.00", "accountId", archived)), "ACCOUNT_ARCHIVED");
    assertCode(() -> repayments.update(owner, context, id(repayment), Map.of("accountId", archived)), "ACCOUNT_ARCHIVED");
    assertCode(() -> transactions.updateTransaction(owner, context, txn, Map.of("accountId", archived)), "ACCOUNT_ARCHIVED");
    assertBalance(account, 1000);
    assertBalance(archived, 0);
    assertThat(db.queryForObject("SELECT remaining_cents FROM liability WHERE id = ?", Long.class, liability)).isEqualTo(9000L);
  }

  @Test
  void archivedCorrectionsStillEnforceCreatorAndLedgerScope() {
    long txn = transactionId(transactions.createTransaction(owner, context,
        Map.of("type", "expense", "amount", "2.00", "accountId", account)));
    Map<String, Object> repayment = repayments.create(owner, context,
        Map.of("liabilityId", liability, "accountId", account, "amount", "10.00"));
    accounts.archive(context, account);
    assertCode(() -> transactions.updateTransaction(member, memberContext, txn, Map.of("amount", "3.00")), "RECORD_CREATOR_REQUIRED");
    assertCode(() -> transactions.deleteTransaction(member, memberContext, txn), "RECORD_CREATOR_REQUIRED");
    assertCode(() -> repayments.update(member, memberContext, id(repayment), Map.of("amount", "3.00")), "RECORD_CREATOR_REQUIRED");
    assertCode(() -> repayments.delete(member, memberContext, id(repayment)), "RECORD_CREATOR_REQUIRED");
    LedgerContext other = new LedgerContext(context.ledgerId() + 999, owner.userId(), "OWNER", true);
    assertCode(() -> transactions.deleteTransaction(owner, other, txn), "TXN_NOT_FOUND");
    assertCode(() -> repayments.delete(owner, other, id(repayment)), "REPAYMENT_NOT_FOUND");
    assertBalance(account, -1200);
    transactions.deleteTransaction(owner, context, txn);
    repayments.delete(owner, context, id(repayment));
    assertDeleted(repayment);
  }

  private Map<String, Object> createRepayment() {
    return repayments.create(member, memberContext,
        Map.of("liabilityId", liability, "accountId", account, "amount", "10.00"));
  }

  private void assertDeleted(Map<String, Object> repayment) {
    assertThat(db.queryForObject("SELECT COUNT(*) FROM repayment WHERE id = ?", Integer.class, id(repayment))).isZero();
    assertThat(db.queryForObject("SELECT COUNT(*) FROM txn WHERE id = ?", Integer.class,
        repayment.get("transaction_id"))).isZero();
    assertThat(db.queryForObject("SELECT remaining_cents FROM liability WHERE id = ?", Long.class, liability)).isEqualTo(10000L);
    assertBalance(account, 0);
  }

  private void assertBalance(long id, long expected) {
    assertThat(db.queryForObject("SELECT balance_cents FROM account WHERE id = ? AND ledger_id = ?",
        Long.class, id, context.ledgerId())).isEqualTo(expected);
  }

  private static long id(Map<String, Object> row) { return ((Number) row.get("id")).longValue(); }
  private static long transactionId(Map<String, Object> result) {
    return ((Number) ((Map<?, ?>) result.get("transaction")).get("id")).longValue();
  }
  private static void assertCode(Runnable action, String code) {
    assertThatThrownBy(action::run).isInstanceOf(ApiException.class)
        .satisfies(error -> assertThat(((ApiException) error).getCode()).isEqualTo(code));
  }
}
