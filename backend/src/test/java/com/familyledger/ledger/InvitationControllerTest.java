package com.familyledger.ledger;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

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
  @Autowired com.fasterxml.jackson.databind.ObjectMapper json;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
  }

  @Test
  void webOwnerCanRevokeInvitationButMemberCannotAndRevokedTokenCannotBeAccepted() throws Exception {
    long ledgerId = db.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);
    long ownerId = db.queryForObject("SELECT user_id FROM ledger_membership WHERE role = 'OWNER'", Long.class);
    long memberId = db.queryForObject("SELECT user_id FROM ledger_membership WHERE role = 'MEMBER'", Long.class);
    Cookie owner = session(AuthPrincipal.webLedgerUser(ownerId));
    MvcResult created = mvc.perform(post("/api/ledgers/" + ledgerId + "/invitations").cookie(owner))
        .andExpect(status().isCreated()).andExpect(jsonPath("$.id").isNumber())
        .andExpect(jsonPath("$.expiresAt").isString()).andReturn();
    var invitation = json.readTree(created.getResponse().getContentAsString());
    long id = invitation.get("id").asLong();
    mvc.perform(post("/api/invitations/" + id + "/revoke").cookie(session(AuthPrincipal.webLedgerUser(memberId))))
        .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("LEDGER_OWNER_REQUIRED"));
    assertThat(db.queryForObject("SELECT revoked_at FROM ledger_invitation WHERE id = ?", String.class, id)).isNull();
    mvc.perform(post("/api/invitations/" + id + "/revoke").cookie(owner)).andExpect(status().isNoContent());
    long invitee = com.familyledger.common.Db.insert(db,
        "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", "Invitee", com.familyledger.common.Time.now());
    mvc.perform(post("/api/invitations/accept").cookie(session(AuthPrincipal.ledgerUser(invitee)))
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(
                java.util.Map.of("token", invitation.get("token").asText()))))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("INVITATION_INVALID"));
    assertThat(db.queryForObject("SELECT COUNT(*) FROM ledger_membership WHERE user_id = ?", Integer.class, invitee)).isZero();
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

    mvc.perform(get("/api/invitations/preview").param("token", token)
            .cookie(session(AuthPrincipal.ledgerUser(inviteeId))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ledgerId").value(ledgerId))
        .andExpect(jsonPath("$.ledgerName").isString())
        .andExpect(jsonPath("$.inviterName").isString())
        .andExpect(jsonPath("$.expiresAt").isString());

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
