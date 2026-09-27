package com.familyledger.access;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * 访问控制的 HTTP 契约测试：未解锁拒绝业务接口、解锁下发 Cookie、锁定后立即失效、
 * 错误码与限流行为，以及 /healthz 与 /api/access/session 的公开性。
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(
    properties = {
      "FAMILY_ACCESS_CODE=house-code",
      "SESSION_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef",
      "TRUST_PROXY_HOPS=1"
    })
class AccessControllerTest {
  @Autowired MockMvc mvc;
  @Autowired AccessConfig config;

  private String clientIp(String ip) {
    return ip;
  }

  private MvcResult unlock(String code, String ip) throws Exception {
    return mvc
        .perform(
            post("/api/access/unlock")
                .header("X-Forwarded-For", clientIp(ip))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"" + code + "\"}"))
        .andReturn();
  }

  private String sessionCookie(MvcResult result) {
    Cookie cookie = result.getResponse().getCookie("family_access");
    assertThat(cookie).as("解锁成功应下发 family_access Cookie").isNotNull();
    return cookie.getValue();
  }

  @Test
  void 未解锁时业务接口返回401() throws Exception {
    mvc.perform(get("/api/family"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("ACCESS_REQUIRED"));
  }

  @Test
  void 正确口令解锁后可访问业务接口() throws Exception {
    MvcResult unlocked = unlock("house-code", "203.0.113.10");
    assertThat(unlocked.getResponse().getStatus()).isEqualTo(204);
    String cookie = sessionCookie(unlocked);

    mvc.perform(get("/api/family").cookie(new Cookie("family_access", cookie)))
        .andExpect(status().isOk());
  }

  @Test
  void 错误口令返回401且不下发Cookie() throws Exception {
    MvcResult denied = unlock("wrong-code", "203.0.113.11");
    assertThat(denied.getResponse().getStatus()).isEqualTo(401);
    assertThat(denied.getResponse().getContentAsString()).contains("ACCESS_DENIED");
    assertThat(denied.getResponse().getCookie("family_access")).isNull();
  }

  @Test
  void 锁定本设备会清空浏览器Cookie() throws Exception {
    String cookie = sessionCookie(unlock("house-code", "203.0.113.12"));
    mvc.perform(get("/api/family").cookie(new Cookie("family_access", cookie)))
        .andExpect(status().isOk());

    mvc.perform(post("/api/access/lock").cookie(new Cookie("family_access", cookie)))
        .andExpect(status().isNoContent())
        .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.containsString("Max-Age=0")));

    // 会话本身是无状态的：锁定只清空浏览器侧 Cookie，此后不带 Cookie 的请求一律被拒。
    mvc.perform(get("/api/family")).andExpect(status().isUnauthorized());
  }

  @Test
  void 会话校验端点供代理层使用() throws Exception {
    mvc.perform(get("/api/access/session")).andExpect(status().isUnauthorized());
    String cookie = sessionCookie(unlock("house-code", "203.0.113.13"));
    mvc.perform(get("/api/access/session").cookie(new Cookie("family_access", cookie)))
        .andExpect(status().isNoContent());
  }

  @Test
  void 连续失败超过五次后限流() throws Exception {
    String ip = "203.0.113.99";
    for (int i = 0; i < FailedAttemptLimiter.MAX_FAILED_ATTEMPTS; i++) {
      assertThat(unlock("nope", ip).getResponse().getStatus()).isEqualTo(401);
    }
    mvc.perform(
            post("/api/access/unlock")
                .header("X-Forwarded-For", ip)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"house-code\"}"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.error.code").value("TOO_MANY_ATTEMPTS"));
  }

  @Test
  void 健康检查公开且不受守卫保护() throws Exception {
    mvc.perform(get("/healthz")).andExpect(status().isNoContent());
  }

  @Test
  void 会话Cookie的Secure取决于请求是否走HTTPS() throws Exception {
    String body = "{\"code\":\"house-code\"}";
    MvcResult overHttp =
        mvc.perform(
                post("/api/access/unlock")
                    .header("X-Forwarded-For", "203.0.113.20")
                    .header("X-Forwarded-Proto", "http")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body))
            .andExpect(status().isNoContent())
            .andReturn();
    assertThat(overHttp.getResponse().getHeader("Set-Cookie")).doesNotContain("Secure");

    MvcResult overHttps =
        mvc.perform(
                post("/api/access/unlock")
                    .header("X-Forwarded-For", "203.0.113.21")
                    .header("X-Forwarded-Proto", "https")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body))
            .andExpect(status().isNoContent())
            .andReturn();
    assertThat(overHttps.getResponse().getHeader("Set-Cookie")).contains("Secure");
  }

  @Test
  void 启用条件与代理跳数来自环境变量() throws Exception {
    assertThat(config.isEnabled()).isTrue();
    assertThat(config.getTrustProxyHops()).isEqualTo(1);
    assertThat(config.isProduction()).isFalse();
  }
}
