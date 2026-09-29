package com.familyledger.auth;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.stereotype.Component;

/** 生产 WeChat code2Session 交换；测试通过 MockBean 注入确定性的 fake。 */
@Component
public class ConfiguredWeChatClient implements WeChatClient {
  private final AuthConfig config;
  private final ObjectMapper json;
  private final HttpClient http = HttpClient.newHttpClient();

  public ConfiguredWeChatClient(AuthConfig config, ObjectMapper json) {
    this.config = config;
    this.json = json;
  }

  @Override
  public WeChatIdentity exchangeLoginCode(String code) {
    if (code == null || code.isBlank() || config.getWechatAppId().isEmpty()
        || config.getWechatAppSecret().isEmpty()) {
      throw new IllegalStateException("微信登录配置不完整");
    }
    try {
      String query = "appid=" + encode(config.getWechatAppId())
          + "&secret=" + encode(config.getWechatAppSecret())
          + "&js_code=" + encode(code) + "&grant_type=authorization_code";
      HttpRequest request = HttpRequest.newBuilder()
          .uri(URI.create(config.getWechatBaseUrl() + "/sns/jscode2session?" + query))
          .GET().build();
      Map<String, Object> body = json.readValue(
          http.send(request, HttpResponse.BodyHandlers.ofString()).body(),
          new TypeReference<>() {});
      Object openid = body.get("openid");
      if (openid == null || String.valueOf(openid).isBlank()) {
        throw new IllegalStateException("微信登录失败");
      }
      return new WeChatIdentity(String.valueOf(openid));
    } catch (Exception e) {
      throw new IllegalStateException("微信登录失败", e);
    }
  }

  private static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }
}
