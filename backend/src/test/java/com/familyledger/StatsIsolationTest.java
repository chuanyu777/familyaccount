package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.Db;
import com.familyledger.common.Time;
import com.familyledger.db.Seeder;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerService;
import com.familyledger.service.AccountService;
import com.familyledger.service.AssetService;
import com.familyledger.service.CategoryService;
import com.familyledger.service.LiabilityService;
import com.familyledger.service.StatsService;
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
class StatsIsolationTest {
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledgers;
  @Autowired com.familyledger.service.LedgerService transactions;
  @Autowired LedgerAuthorization authorization;
  @Autowired AccountService accounts;
  @Autowired CategoryService categories;
  @Autowired AssetService assets;
  @Autowired LiabilityService liabilities;
  @Autowired StatsService stats;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
  }

  @Test
  void everyStatisticsViewUsesOnlyTheRequestedLedger() {
    long ownerA = insertUser("统计账本A");
    long ownerB = insertUser("统计账本B");
    long ledgerA = ledgers.createLedger(ownerA, "统计A").id();
    long ledgerB = ledgers.createLedger(ownerB, "统计B").id();
    LedgerContext contextA = authorization.requireMembership(AuthPrincipal.ledgerUser(ownerA), ledgerA);
    LedgerContext contextB = authorization.requireMembership(AuthPrincipal.ledgerUser(ownerB), ledgerB);

    createData(contextA, "100.00", "10.00", "50.00", "30.00");
    createData(contextB, "200.00", "20.00", "900.00", "700.00");

    assertThat(stats.summary(contextA).get("accountsTotalCents")).isEqualTo(9000L);
    assertThat(stats.summary(contextA).get("assetsTotalCents")).isEqualTo(5000L);
    assertThat(stats.summary(contextA).get("totalLiabilitiesCents")).isEqualTo(3000L);
    assertThat(stats.summary(contextB).get("accountsTotalCents")).isEqualTo(18000L);
    assertThat(stats.summary(contextB).get("assetsTotalCents")).isEqualTo(90000L);
    assertThat(stats.summary(contextB).get("totalLiabilitiesCents")).isEqualTo(70000L);

    assertThat(stats.monthlyTrend(contextA, 1, "2026-09").get(0))
        .containsEntry("incomeCents", 10000L)
        .containsEntry("expenseCents", 1000L);
    assertThat(stats.monthlyTrend(contextB, 1, "2026-09").get(0))
        .containsEntry("incomeCents", 20000L)
        .containsEntry("expenseCents", 2000L);

    assertThat(stats.categoryBreakdown(contextA, "2026-09").get(0))
        .containsEntry("cents", 1000L);
    assertThat(stats.categoryBreakdown(contextB, "2026-09").get(0))
        .containsEntry("cents", 2000L);

    assertThat(stats.monthSnapshot(contextA, "2026-09"))
        .containsEntry("totalAssetsCents", 14000L)
        .containsEntry("totalLiabilitiesCents", 3000L);
    assertThat(stats.monthSnapshot(contextB, "2026-09"))
        .containsEntry("totalAssetsCents", 108000L)
        .containsEntry("totalLiabilitiesCents", 70000L);
  }

  private void createData(LedgerContext context, String income, String expense,
      String asset, String liability) {
    long accountId = accounts.defaultAccountId(context);
    long categoryId = ((Number) categories.ensureDefault(context, "expense").get("id")).longValue();
    Map<String, Object> incomeInput = new HashMap<>();
    incomeInput.put("type", "income");
    incomeInput.put("amount", income);
    incomeInput.put("accountId", accountId);
    incomeInput.put("occurredOn", "2026-09-15");
    transactions.createTransaction(AuthPrincipal.ledgerUser(context.userId()), context, incomeInput);

    Map<String, Object> expenseInput = new HashMap<>();
    expenseInput.put("type", "expense");
    expenseInput.put("amount", expense);
    expenseInput.put("accountId", accountId);
    expenseInput.put("categoryId", categoryId);
    expenseInput.put("occurredOn", "2026-09-16");
    transactions.createTransaction(AuthPrincipal.ledgerUser(context.userId()), context, expenseInput);

    Map<String, Object> assetInput = new HashMap<>();
    assetInput.put("name", "资产-" + context.ledgerId());
    assetInput.put("value", asset);
    assets.create(context, assetInput);

    Map<String, Object> liabilityInput = new HashMap<>();
    liabilityInput.put("name", "负债-" + context.ledgerId());
    liabilityInput.put("remaining", liability);
    liabilityInput.put("monthlyPayment", "10.00");
    liabilities.create(context, liabilityInput);
  }

  private long insertUser(String name) {
    return Db.insert(db, "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", name, Time.now());
  }
}
