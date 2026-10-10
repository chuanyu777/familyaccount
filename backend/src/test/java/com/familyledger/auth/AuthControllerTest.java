package com.familyledger.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import org.springframework.mock.web.MockMultipartFile;

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
  void whitespaceEquivalentUsernamesShareTheFailureLimitOnBothSurfaces() throws Exception {
    for (String surface : new String[] {"web", "platform"}) {
      for (int i = 0; i < AuthAttemptLimiter.MAX_FAILURES; i++) {
        mvc.perform(post("/api/auth/" + surface + "/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + " ".repeat(i) + "spaced-user \",\"password\":\"wrong\"}"))
            .andExpect(status().isUnauthorized());
      }
      mvc.perform(post("/api/auth/" + surface + "/login")
              .contentType(MediaType.APPLICATION_JSON)
              .content("{\"username\":\"spaced-user\",\"password\":\"wrong\"}"))
          .andExpect(status().isTooManyRequests())
          .andExpect(jsonPath("$.error.code").value("AUTH_RATE_LIMITED"));
    }
  }

  @Test
  void whitespaceEquivalentValidCredentialsAuthenticateOnBothSurfaces() throws Exception {
    mvc.perform(post("/api/auth/web/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\" ledger-owner \",\"password\":\"ledger-owner-password\"}"))
        .andExpect(status().isNoContent()).andExpect(cookie().exists("ledger_session"));
    mvc.perform(post("/api/auth/platform/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\" platform-admin \",\"password\":\"platform-admin-password\"}"))
        .andExpect(status().isNoContent()).andExpect(cookie().exists("platform_session"));
  }

  @Test
  void miniProgramSessionCannotDiscoverWebSessionOrContextButKeepsMiniProgramAccess() throws Exception {
    when(weChatClient.exchangeLoginCode("ordinary-code")).thenReturn(new WeChatIdentity("ordinary-openid"));
    Cookie mini = mvc.perform(post("/api/auth/wechat/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"code\":\"ordinary-code\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.webSession").value(false))
        .andReturn().getResponse().getCookie("ledger_session");
    mvc.perform(get("/api/auth/session").param("kind", "ledger").cookie(mini))
        .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("WEB_SESSION_REQUIRED"));
    mvc.perform(get("/api/ledgers").param("surface", "web").cookie(mini))
        .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("WEB_SESSION_REQUIRED"));
    mvc.perform(get("/api/auth/session").cookie(mini))
        .andExpect(status().isOk()).andExpect(jsonPath("$.webSession").value(false));
    mvc.perform(get("/api/ledgers").cookie(mini)).andExpect(status().isOk());
    mvc.perform(post("/api/ledgers").cookie(mini).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Mini ledger\"}"))
        .andExpect(status().isCreated());
  }

  @Test
  void webDiscoveryRechecksMembershipAndExposesSignedWebMarker() throws Exception {
    Cookie web = loginWeb();
    mvc.perform(get("/api/auth/session").param("kind", "ledger").cookie(web))
        .andExpect(status().isOk()).andExpect(jsonPath("$.webSession").value(true));
    mvc.perform(get("/api/ledgers").param("surface", "web").cookie(web)).andExpect(status().isOk());
    db.update("UPDATE ledger_membership SET web_login_allowed = 0");
    mvc.perform(get("/api/auth/session").param("kind", "ledger").cookie(web))
        .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("SPECIAL_LEDGER_REQUIRED"));
    mvc.perform(get("/api/ledgers").param("surface", "web").cookie(web)).andExpect(status().isForbidden());
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
  void bindingCodeCanBindAWebLedgerBeforeOrdinaryWechatLogin() throws Exception {
    when(weChatClient.exchangeLoginCode("bind-code"))
        .thenReturn(new WeChatIdentity("openid-owner"));
    Cookie web = loginWeb();
    String bindingCode = issueBindingCode(web);
    long webUserId = db.queryForObject(
        "SELECT user_id FROM web_credential WHERE username = 'ledger-owner'", Long.class);

    mvc.perform(post("/api/auth/wechat/bind").contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\",\"code\":\"bind-code\"}"))
        .andExpect(status().isOk())
        .andExpect(cookie().exists("ledger_session"))
        .andExpect(jsonPath("$.userId").value(webUserId))
        .andExpect(jsonPath("$.webSession").value(false));
    assertThat(db.queryForObject(
        "SELECT user_id FROM wechat_identity WHERE openid = 'openid-owner'", Long.class))
        .isEqualTo(webUserId);

    mvc.perform(post("/api/auth/wechat/bind").contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\",\"code\":\"bind-code\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("BINDING_CODE_INVALID"));
  }

  @Test
  void profileCanUpdateNicknameAndPersistAChosenAvatar() throws Exception {
    Cookie session = loginWeb();
    mvc.perform(get("/api/profile").cookie(session))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.displayName").value("本人"))
        .andExpect(jsonPath("$.avatarUrl").doesNotExist());

    mvc.perform(patch("/api/profile").cookie(session).contentType(MediaType.APPLICATION_JSON)
            .content("{\"displayName\":\"小周\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.displayName").value("小周"));

    MockMultipartFile avatar = new MockMultipartFile(
        "file", "avatar.png", "image/png", new byte[] {1, 2, 3, 4});
    String avatarUrl = mvc.perform(multipart("/api/profile/avatar").file(avatar).cookie(session))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.avatarUrl").isString())
        .andReturn().getResponse().getContentAsString();
    assertThat(avatarUrl).contains("/api/profile/").contains("/avatar?v=");

    long userId = db.queryForObject(
        "SELECT user_id FROM web_credential WHERE username = 'ledger-owner'", Long.class);
    mvc.perform(get("/api/profile/{userId}/avatar", userId))
        .andExpect(status().isOk())
        .andExpect(result -> assertThat(result.getResponse().getContentAsByteArray())
            .containsExactly(1, 2, 3, 4));
  }

  @Test
  void profileRejectsBlankNicknameAndUnsupportedAvatar() throws Exception {
    Cookie session = loginWeb();
    mvc.perform(patch("/api/profile").cookie(session).contentType(MediaType.APPLICATION_JSON)
            .content("{\"displayName\":\"   \"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    MockMultipartFile avatar = new MockMultipartFile(
        "file", "avatar.gif", "image/gif", new byte[] {1});
    mvc.perform(multipart("/api/profile/avatar").file(avatar).cookie(session))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("INVALID_AVATAR"));
  }

  @Test
  void bindingCodeImportsTheWebLedgerIntoAnExistingWechatUser() throws Exception {
    when(weChatClient.exchangeLoginCode("mini-code"))
        .thenReturn(new WeChatIdentity("openid-mini"));
    Cookie mini = loginWeChat("mini-code");
    Cookie web = loginWeb();
    String bindingCode = issueBindingCode(web);
    long webUserId = db.queryForObject(
        "SELECT user_id FROM web_credential WHERE username = 'ledger-owner'", Long.class);
    long wechatUserId = db.queryForObject(
        "SELECT user_id FROM wechat_identity WHERE openid = 'openid-mini'", Long.class);
    long ledgerId = db.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);

    mvc.perform(post("/api/auth/web-ledger/preview").cookie(mini)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ledgerId").value(ledgerId))
        .andExpect(jsonPath("$.ledgerName").value("测试特殊账本"))
        .andExpect(jsonPath("$.role").value("OWNER"));

    mvc.perform(post("/api/auth/web-ledger/import").cookie(mini)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.ledgerId").value(ledgerId));
    assertThat(db.queryForObject(
        "SELECT user_id FROM ledger_membership WHERE ledger_id = ? AND role = 'OWNER'", Long.class, ledgerId))
        .isEqualTo(wechatUserId);
    assertThat(db.queryForObject(
        "SELECT COUNT(*) FROM web_account_link WHERE ledger_id = ? AND web_user_id = ? AND wechat_user_id = ?",
        Integer.class, ledgerId, webUserId, wechatUserId)).isEqualTo(1);

    mvc.perform(post("/api/auth/web-ledger/import").cookie(mini)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("BINDING_CODE_INVALID"));

    Cookie linkedWeb = loginWeb();
    mvc.perform(get("/api/auth/session").param("kind", "ledger").cookie(linkedWeb))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.userId").value(wechatUserId));
  }

  @Test
  void expiredBindingCodeCannotBeImported() throws Exception {
    when(weChatClient.exchangeLoginCode("mini-code"))
        .thenReturn(new WeChatIdentity("openid-mini"));
    Cookie mini = loginWeChat("mini-code");
    String bindingCode = issueBindingCode(loginWeb());
    db.update("UPDATE web_binding_code SET expires_at = '2000-01-01 00:00:00' WHERE code_hash = ?",
        hashForTest(bindingCode));

    mvc.perform(post("/api/auth/web-ledger/preview").cookie(mini)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("BINDING_CODE_INVALID"));
    assertThat(db.queryForObject("SELECT COUNT(*) FROM web_account_link", Integer.class)).isZero();
  }

  @Test
  void importedWebCreatorCanStillEditHistoricalRecordsFromWechat() throws Exception {
    when(weChatClient.exchangeLoginCode("mini-code"))
        .thenReturn(new WeChatIdentity("openid-mini"));
    Cookie mini = loginWeChat("mini-code");
    String bindingCode = issueBindingCode(loginWeb());
    long ledgerId = db.queryForObject("SELECT id FROM ledger WHERE is_web_enabled = 1", Long.class);
    long webUserId = db.queryForObject(
        "SELECT user_id FROM web_credential WHERE username = 'ledger-owner'", Long.class);
    long accountId = db.queryForObject("SELECT id FROM account WHERE ledger_id = ?", Long.class, ledgerId);
    long txnId = com.familyledger.common.Db.insert(db,
        "INSERT INTO txn (ledger_id, type, amount_cents, occurred_on, account_id, created_by_user_id, source_type, created_at) "
            + "VALUES (?, 'expense', 100, '2026-10-01', ?, ?, 'manual', '2026-10-01 00:00:00')",
        ledgerId, accountId, webUserId);
    mvc.perform(post("/api/auth/web-ledger/import").cookie(mini).contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + bindingCode + "\"}"))
        .andExpect(status().isOk());

    mvc.perform(patch("/api/transactions/{id}", txnId).cookie(mini).header("X-Ledger-Id", ledgerId)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"note\":\"微信继续编辑\"}"))
        .andExpect(status().isOk());
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

  private Cookie loginWeChat(String code) throws Exception {
    return mvc.perform(post("/api/auth/wechat/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"code\":\"" + code + "\"}"))
        .andExpect(status().isOk())
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
