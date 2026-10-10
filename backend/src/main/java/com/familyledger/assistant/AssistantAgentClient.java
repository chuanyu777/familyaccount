package com.familyledger.assistant;

import java.net.http.HttpClient;
import java.util.Map;
import java.util.LinkedHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 可选的 LangChain Runtime 客户端；未配置 URL 时由本地 fallback 接管。 */
@Component
public class AssistantAgentClient {
  private final String baseUrl;
  private final RestClient client;

  public AssistantAgentClient(@Value("${assistant.agent-url:}") String baseUrl) {
    this.baseUrl = baseUrl == null ? "" : baseUrl.trim();
    // JDK HttpClient 对 http:// 默认发起 h2c 明文升级（Upgrade: h2c + Transfer-Encoding: chunked），
    // uvicorn 不支持该升级，会丢弃请求体导致 Agent 侧解析失败。这里固定走 HTTP/1.1。
    this.client = RestClient.builder()
        .requestFactory(new JdkClientHttpRequestFactory(
            HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build()))
        .build();
  }

  public Map<String, Object> run(String message, AssistantContext context) {
    if (baseUrl.isBlank()) return null;
    Map<String, Object> contextBody = new LinkedHashMap<>();
    contextBody.put("run_id", context.runId());
    contextBody.put("user_id", context.userId());
    contextBody.put("ledger_id", context.ledgerId());
    contextBody.put("month", context.month());
    return client.post().uri(baseUrl + "/runs").contentType(MediaType.APPLICATION_JSON)
        .body(Map.of("message", message, "context", contextBody))
        .retrieve().body(Map.class);
  }
}
