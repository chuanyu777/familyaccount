package com.familyledger.ledger;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.familyledger.TestDb;
import com.familyledger.auth.AuthConfig;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.auth.AuthSession;
import com.familyledger.db.Seeder;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.http.MediaType;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class InvitationControllerTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;
  @Autowired AuthConfig authConfig;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
  }

  @Test
  void ownerCanCreateInvitationAndAuthenticatedUserCanAcceptIt() throws Exception {
    long ledgerId = db.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);
    long ownerId = db.queryForObject("SELECT user_id FROM ledger_membership WHERE role = 'OWNER'", Long.class);
    long inviteeId = com.familyledger.common.Db.insert(db,
        "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", "小程序用户",
        com.familyledger.common.Time.now());

    Cookie owner = session(AuthPrincipal.ledgerUser(ownerId));
    MvcResult created = mvc.perform(post("/api/ledgers/" + ledgerId + "/invitations").cookie(owner))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.token").isString())
        .andReturn();
    String token = created.getResponse().getContentAsString()
        .replaceAll(".*\\\"token\\\":\\\"([^\\\"]+)\\\".*", "$1");

    mvc.perform(post("/api/invitations/accept")
            .cookie(session(AuthPrincipal.ledgerUser(inviteeId)))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"token\":\"" + token + "\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.role").value("MEMBER"));
  }

  @Test
  void regularMemberCannotCreateInvitation() throws Exception {
    long ledgerId = db.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);
    long memberId = db.queryForObject("SELECT user_id FROM ledger_membership WHERE role = 'MEMBER'", Long.class);

    mvc.perform(post("/api/ledgers/" + ledgerId + "/invitations")
            .cookie(session(AuthPrincipal.ledgerUser(memberId))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code").value("LEDGER_OWNER_REQUIRED"));
  }

  private Cookie session(AuthPrincipal principal) {
    return new Cookie(authConfig.getLedgerCookie(), AuthSession.issue(principal,
        authConfig.getSessionSecret(), System.currentTimeMillis(), authConfig.getSessionTtlMillis()));
  }
}
