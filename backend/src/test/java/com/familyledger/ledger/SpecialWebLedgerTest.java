package com.familyledger.ledger;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

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
class SpecialWebLedgerTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
  }

  @Test
  void webUserCanReadOnlyTheFixedSpecialLedgerContext() throws Exception {
    Cookie web = webLogin("ledger-owner", "ledger-owner-password");
    long special = specialLedgerId();
    long other = otherLedgerId();

    mvc.perform(get("/api/ledgers").cookie(web))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", org.hamcrest.Matchers.hasSize(1)))
        .andExpect(jsonPath("$[0].id").value((int) special));
    mvc.perform(get("/api/accounts").header("X-Ledger-Id", special).cookie(web))
        .andExpect(status().isOk());
    mvc.perform(get("/api/accounts").header("X-Ledger-Id", other).cookie(web))
        .andExpect(status().isForbidden());
  }

  @Test
  void disabledMembershipCannotAuthenticateThroughWeb() throws Exception {
    db.update("UPDATE ledger_membership SET web_login_allowed = 0 WHERE user_id = ?",
        ownerId());

    mvc.perform(post("/api/auth/web/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"ledger-owner\",\"password\":\"ledger-owner-password\"}"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void webUserCannotCreateAnotherLedger() throws Exception {
    mvc.perform(post("/api/ledgers").cookie(webLogin("ledger-owner", "ledger-owner-password"))
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"不应创建\"}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void ordinaryUserCredentialAndInactiveMembershipCannotUseSpecialWebLogin() throws Exception {
    long userId = Db.insert(db, "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", "普通用户", Time.now());
    db.update("INSERT INTO web_credential (user_id, username, password_hash, enabled, created_at) VALUES (?, ?, ?, 1, ?)",
        userId, "ordinary-user", "$2a$10$7EqJtq98hPqEX7fNZaFWoOe7Q9M9nZ9Q8M9K8QWQ5jH2o4E6JY0uG", Time.now());
    db.update("INSERT INTO ledger_membership (ledger_id, user_id, role, web_login_allowed, active, joined_at) VALUES (?, ?, 'MEMBER', 1, 0, ?)",
        specialLedgerId(), userId, Time.now());

    mvc.perform(post("/api/auth/web/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"ordinary-user\",\"password\":\"password\"}"))
        .andExpect(status().isUnauthorized());
  }

  private Cookie webLogin(String username, String password) throws Exception {
    MvcResult result = mvc.perform(post("/api/auth/web/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
        .andExpect(status().isNoContent()).andReturn();
    return result.getResponse().getCookie("ledger_session");
  }

  private long specialLedgerId() {
    return db.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);
  }

  private long ownerId() {
    return db.queryForObject("SELECT user_id FROM ledger_membership WHERE ledger_id = ? AND role = 'OWNER'",
        Long.class, specialLedgerId());
  }

  private long otherLedgerId() {
    long userId = ownerId();
    long ledgerId = Db.insert(db, "INSERT INTO ledger (name, is_web_enabled, created_by_user_id, created_at) VALUES ('其他账本', 0, ?, ?)",
        userId, Time.now());
    db.update("INSERT INTO ledger_membership (ledger_id, user_id, role, web_login_allowed, active, joined_at) VALUES (?, ?, 'OWNER', 0, 1, ?)",
        ledgerId, userId, Time.now());
    return ledgerId;
  }
}
