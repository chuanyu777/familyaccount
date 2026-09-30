package com.familyledger.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.cookie;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.familyledger.TestDb;
import com.familyledger.db.Seeder;
import com.familyledger.auth.WeChatClient.WeChatIdentity;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthControllerTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;

  @MockBean WeChatClient weChatClient;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
  }

  @Test
  void webLoginIssuesLedgerSessionAndRejectsWrongPasswordGenerically() throws Exception {
    mvc.perform(post("/api/auth/web/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"ledger-owner\",\"password\":\"ledger-owner-password\"}"))
        .andExpect(status().isNoContent())
        .andExpect(cookie().exists("ledger_session"));

    mvc.perform(post("/api/auth/web/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"ledger-owner\",\"password\":\"wrong\"}"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("AUTH_FAILED"))
        .andExpect(jsonPath("$.error.message").value("用户名或密码错误"));
  }

  @Test
  void logoutOnlyClearsTheSessionForTheRequestedSurface() throws Exception {
    mvc.perform(post("/api/auth/logout").param("kind", "platform"))
        .andExpect(status().isNoContent())
        .andExpect(cookie().exists("platform_session"))
        .andExpect(cookie().doesNotExist("ledger_session"));
  }

  @Test
  void repeatedCredentialFailuresAreRateLimited() throws Exception {
    for (int i = 0; i < AuthAttemptLimiter.MAX_FAILURES; i++) {
      mvc.perform(post("/api/auth/web/login")
              .contentType(MediaType.APPLICATION_JSON)
              .content("{\"username\":\"unknown-user\",\"password\":\"wrong\"}"))
          .andExpect(status().isUnauthorized());
    }
    mvc.perform(post("/api/auth/web/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"unknown-user\",\"password\":\"wrong\"}"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.error.code").value("AUTH_RATE_LIMITED"));
  }

  @Test
  void platformSessionCannotSatisfyLedgerEndpoint() throws Exception {
    MvcResult result = mvc.perform(post("/api/auth/platform/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"platform-admin\",\"password\":\"platform-admin-password\"}"))
        .andExpect(status().isNoContent())
        .andExpect(cookie().exists("platform_session"))
        .andReturn();

    mvc.perform(get("/api/transactions").cookie(result.getResponse().getCookie("platform_session")))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code").value("LEDGER_SESSION_REQUIRED"));
  }

  @Test
  void ledgerEndpointUsesLedgerCookieWhenBothSessionsArePresent() throws Exception {
    Cookie ledger = loginWeb();
    Cookie platform = mvc.perform(post("/api/auth/platform/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"platform-admin\",\"password\":\"platform-admin-password\"}"))
        .andExpect(status().isNoContent()).andReturn().getResponse().getCookie("platform_session");
    long ledgerId = db.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);

    mvc.perform(get("/api/transactions").cookie(platform, ledger).header("X-Ledger-Id", ledgerId))
        .andExpect(status().isOk());
  }

  @Test
  void sessionEndpointSelectsTheCookieForTheRequestedSurface() throws Exception {
    Cookie ledger = loginWeb();
    Cookie platform = mvc.perform(post("/api/auth/platform/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"platform-admin\",\"password\":\"platform-admin-password\"}"))
        .andExpect(status().isNoContent()).andReturn().getResponse().getCookie("platform_session");

    mvc.perform(get("/api/auth/session").param("kind", "platform").cookie(ledger, platform))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.type").value("PLATFORM_ADMIN"));

    mvc.perform(get("/api/auth/session").param("kind", "ledger").cookie(platform, ledger))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.type").value("LEDGER_USER"));
  }

  @Test
  void wechatLoginCreatesUserAndIdentityOnlyOnce() throws Exception {
    when(weChatClient.exchangeLoginCode("wx-code"))
        .thenReturn(new WeChatIdentity("openid-1"));

    mvc.perform(post("/api/auth/wechat/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"code\":\"wx-code\"}"))
        .andExpect(status().isOk())
        .andExpect(cookie().exists("ledger_session"))
        .andExpect(jsonPath("$.userId").isNumber());

    assertThat(db.queryForObject("SELECT COUNT(*) FROM wechat_identity", Integer.class)).isEqualTo(1);
    mvc.perform(post("/api/auth/wechat/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"code\":\"wx-code\"}"))
        .andExpect(status().isOk());
    assertThat(db.queryForObject("SELECT COUNT(*) FROM app_user", Integer.class)).isEqualTo(3);
  }

  @Test
  void bindingCodeIsSingleUseAndBindsExistingWebUser() throws Exception {
    when(weChatClient.exchangeLoginCode("bind-code"))
        .thenReturn(new WeChatIdentity("openid-owner"));
    Cookie web = loginWeb();
    String bindingCode = issueBindingCode(web);

    mvc.perform(post("/api/auth/wechat/bind")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\",\"code\":\"bind-code\"}"))
        .andExpect(status().isOk())
        .andExpect(cookie().exists("ledger_session"));
    assertThat(db.queryForObject(
        "SELECT user_id FROM wechat_identity WHERE openid = 'openid-owner'", Long.class))
        .isEqualTo(db.queryForObject(
            "SELECT user_id FROM web_credential WHERE username = 'ledger-owner'", Long.class));

    mvc.perform(post("/api/auth/wechat/bind")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\",\"code\":\"bind-code\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("BINDING_CODE_INVALID"));
  }

  @Test
  void expiredBindingCodeDoesNotCreateIdentity() throws Exception {
    when(weChatClient.exchangeLoginCode("expired-code"))
        .thenReturn(new WeChatIdentity("openid-expired"));
    String bindingCode = issueBindingCode(loginWeb());
    db.update("UPDATE web_binding_code SET expires_at = '2000-01-01 00:00:00' WHERE code_hash = ?",
        hashForTest(bindingCode));

    mvc.perform(post("/api/auth/wechat/bind")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\",\"code\":\"expired-code\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("BINDING_CODE_INVALID"));
    assertThat(db.queryForObject("SELECT COUNT(*) FROM wechat_identity", Integer.class)).isZero();
  }

  @Test
  void bindingRejectsAnOpenidAlreadyOwnedByAnotherUser() throws Exception {
    Long memberId = db.queryForObject(
        "SELECT user_id FROM web_credential WHERE username = 'ledger-member'", Long.class);
    db.update("INSERT INTO wechat_identity (user_id, openid, created_at) VALUES (?, ?, '2026-01-01 00:00:00')",
        memberId, "openid-member");
    when(weChatClient.exchangeLoginCode("existing-code"))
        .thenReturn(new WeChatIdentity("openid-member"));
    String bindingCode = issueBindingCode(loginWeb());

    mvc.perform(post("/api/auth/wechat/bind")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\",\"code\":\"existing-code\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("WECHAT_ALREADY_BOUND"));
    assertThat(db.queryForObject("SELECT COUNT(*) FROM wechat_identity", Integer.class)).isEqualTo(1);
  }

  @Test
  void expiredSessionIsRejected() throws Exception {
    String expired = AuthSession.issue(
        new AuthPrincipal(PrincipalType.LEDGER_USER, 1L, null),
        "test-session-secret-0123456789abcdef", 1000L, -1L);
    mvc.perform(get("/api/transactions").cookie(new Cookie("ledger_session", expired)))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("AUTH_REQUIRED"));
  }

  private Cookie loginWeb() throws Exception {
    return mvc.perform(post("/api/auth/web/login")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"ledger-owner\",\"password\":\"ledger-owner-password\"}"))
        .andExpect(status().isNoContent())
        .andReturn().getResponse().getCookie("ledger_session");
  }

  private String issueBindingCode(Cookie web) throws Exception {
    MvcResult issued = mvc.perform(post("/api/auth/binding-code").cookie(web))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.code").isString())
        .andExpect(jsonPath("$.expiresAt").isString())
        .andReturn();
    return issued.getResponse().getContentAsString()
        .replaceAll(".*\\\"code\\\":\\\"([^\\\"]+)\\\".*", "$1");
  }

  private String hashForTest(String value) throws Exception {
    return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
        java.security.MessageDigest.getInstance("SHA-256")
            .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
  }
}
