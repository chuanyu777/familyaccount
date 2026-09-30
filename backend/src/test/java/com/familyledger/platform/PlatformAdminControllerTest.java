package com.familyledger.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.familyledger.TestDb;
import com.familyledger.common.Db;
import com.familyledger.common.Time;
import com.familyledger.db.Seeder;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PlatformAdminControllerTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
    addSecondLedgerWithBusinessData();
  }

  @Test
  void platformAdminCanSearchAndReadEveryLedgerAndApprovedBusinessView() throws Exception {
    Cookie platform = platformLogin();

    mvc.perform(get("/api/platform/ledgers").param("query", "第二").cookie(platform))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].name").value("第二账本"));

    long ledgerId = db.queryForObject("SELECT id FROM ledger WHERE name = '第二账本'", Long.class);
    mvc.perform(get("/api/platform/ledgers/{id}", ledgerId).cookie(platform))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ledger.id").value((int) ledgerId))
        .andExpect(jsonPath("$.members[0].userId").isNumber())
        .andExpect(jsonPath("$.transactions[0].amountCents").value(1234))
        .andExpect(jsonPath("$.accounts[0].name").value("第二账户"))
        .andExpect(jsonPath("$.assets").isArray())
        .andExpect(jsonPath("$.liabilities").isArray())
        .andExpect(jsonPath("$.repayments").isArray())
        .andExpect(jsonPath("$.analysis.netCents").value(1234));
  }

  @Test
  void platformSessionCannotMutateOrSatisfyLedgerBusinessEndpoints() throws Exception {
    Cookie platform = platformLogin();
    long before = db.queryForObject("SELECT COUNT(*) FROM txn", Long.class);

    mvc.perform(get("/api/transactions").header("X-Ledger-Id", specialLedgerId()).cookie(platform))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/transactions").cookie(platform).contentType(MediaType.APPLICATION_JSON)
            .content("{\"ledgerId\":" + specialLedgerId() + ",\"type\":\"income\",\"amount\":\"1.00\"}"))
        .andExpect(status().isForbidden());

    assertThat(db.queryForObject("SELECT COUNT(*) FROM txn", Long.class)).isEqualTo(before);
  }

  private Cookie platformLogin() throws Exception {
    MvcResult result = mvc.perform(post("/api/auth/platform/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"platform-admin\",\"password\":\"platform-admin-password\"}"))
        .andExpect(status().isNoContent()).andReturn();
    return result.getResponse().getCookie("platform_session");
  }

  private long specialLedgerId() {
    return db.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);
  }

  private void addSecondLedgerWithBusinessData() {
    long userId = Db.insert(db, "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", "第二用户", Time.now());
    long ledgerId = Db.insert(db, "INSERT INTO ledger (name, is_web_enabled, created_by_user_id, created_at) VALUES (?, 0, ?, ?)",
        "第二账本", userId, Time.now());
    db.update("INSERT INTO ledger_membership (ledger_id, user_id, role, web_login_allowed, active, joined_at) VALUES (?, ?, 'OWNER', 0, 1, ?)",
        ledgerId, userId, Time.now());
    long accountId = Db.insert(db, "INSERT INTO account (ledger_id, name, balance_cents, is_default, archived, created_at) VALUES (?, ?, 1234, 1, 0, ?)",
        ledgerId, "第二账户", Time.now());
    long categoryId = Db.insert(db, "INSERT INTO category (ledger_id, kind, name, archived, created_at) VALUES (?, 'income', '工资', 0, ?)",
        ledgerId, Time.now());
    Db.insert(db, "INSERT INTO txn (ledger_id, type, amount_cents, occurred_on, note, account_id, category_id, created_by_user_id, source_type, created_at) VALUES (?, 'income', 1234, '2026-09-30', '测试', ?, ?, ?, 'manual', ?)",
        ledgerId, accountId, categoryId, userId, Time.now());
  }
}
