package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.auth.AuthSession;
import com.familyledger.common.Db;
import com.familyledger.common.Time;
import com.familyledger.db.Seeder;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerService;
import com.familyledger.service.AccountService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AccountCalibrationTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledgers;
  @Autowired LedgerAuthorization authorization;
  @Autowired AccountService accounts;
  long userId, ledgerId, accountId, otherLedgerId, otherAccountId;
  Cookie session;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
    userId = Db.insert(db, "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", "校准成员", Time.now());
    ledgerId = ledgers.createLedger(userId, "校准账本").id();
    LedgerContext context = authorization.requireMembership(AuthPrincipal.ledgerUser(userId), ledgerId);
    accountId = accounts.defaultAccountId(context);
    // Calibration is shared-resource editing, so an active member can use it.
    db.update("UPDATE ledger_membership SET role = 'MEMBER' WHERE user_id = ? AND ledger_id = ?", userId, ledgerId);
    long otherUser = Db.insert(db, "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", "其他用户", Time.now());
    otherLedgerId = ledgers.createLedger(otherUser, "其他账本").id();
    otherAccountId = accounts.defaultAccountId(authorization.requireMembership(AuthPrincipal.ledgerUser(otherUser), otherLedgerId));
    session = new Cookie("ledger_session", AuthSession.issue(AuthPrincipal.ledgerUser(userId),
        "test-session-secret-0123456789abcdef", System.currentTimeMillis(), 3600L));
  }

  @Test
  void createAcceptsOptionalInitialBalance() throws Exception {
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
            .post("/api/accounts").cookie(session)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"初始余额账户\",\"balance\":\"88.5\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.balanceCents").value(8850))
        .andExpect(jsonPath("$.balance").value("88.50"));
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
            .post("/api/accounts").cookie(session)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"无余额账户\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.balanceCents").value(0));
    mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
            .post("/api/accounts").cookie(session)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"非法金额\",\"balance\":\"abc\"}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void memberCalibratesToSignedBalanceWithoutCreatingTransactions() throws Exception {
    mvc.perform(patch("/api/accounts/" + accountId + "/calibrate").cookie(session)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON).content("{\"balance\":\"-12.34\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.balanceCents").value(-1234))
        .andExpect(jsonPath("$.balance").value("-12.34"));
    assertThat(db.queryForObject("SELECT balance_cents FROM account WHERE id = ?", Long.class, accountId)).isEqualTo(-1234L);
    assertThat(db.queryForObject("SELECT COUNT(*) FROM txn WHERE ledger_id = ?", Long.class, ledgerId)).isZero();
    mvc.perform(patch("/api/accounts/" + accountId + "/calibrate").cookie(session)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON).content("{\"balance\":0}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.balanceCents").value(0));
  }

  @Test
  void calibrationRejectsForeignAccountsAndNonmemberLedgerContext() throws Exception {
    mvc.perform(patch("/api/accounts/" + otherAccountId + "/calibrate").cookie(session)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON).content("{\"balance\":99}"))
        .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("ACCOUNT_NOT_FOUND"));
    mvc.perform(patch("/api/accounts/" + otherAccountId + "/calibrate").cookie(session)
            .header("X-Ledger-Id", otherLedgerId).contentType(MediaType.APPLICATION_JSON).content("{\"balance\":99}"))
        .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("LEDGER_MEMBERSHIP_REQUIRED"));
    assertThat(db.queryForObject("SELECT balance_cents FROM account WHERE id = ?", Long.class, otherAccountId)).isZero();
  }

  @Test
  void calibrationRejectsArchivedAccountsInvalidAmountsAndMissingSession() throws Exception {
    mvc.perform(patch("/api/accounts/" + accountId + "/calibrate").header("X-Ledger-Id", ledgerId)
            .contentType(MediaType.APPLICATION_JSON).content("{\"balance\":1}"))
        .andExpect(status().isUnauthorized());
    for (String body : new String[] {"{}", "{\"balance\":\"abc\"}"}) {
      mvc.perform(patch("/api/accounts/" + accountId + "/calibrate").cookie(session)
              .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON).content(body))
          .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    }
    db.update("UPDATE account SET archived = 1 WHERE id = ?", accountId);
    mvc.perform(patch("/api/accounts/" + accountId + "/calibrate").cookie(session)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON).content("{\"balance\":1}"))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("ACCOUNT_ARCHIVED"));
  }
}
