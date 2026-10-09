package com.familyledger.assistant;

import java.time.ZoneId;

/**
 * 请求级上下文，后续由多租户认证层填充。
 *
 * <p>当前单家庭实现只使用 month/timezone；保留 userId/ledgerId 是为了让工具签名
 * 从第一天就不依赖“默认家庭”这一隐含状态。</p>
 */
public record AssistantContext(
    String runId,
    Long userId,
    Long ledgerId,
    ZoneId timezone,
    String month) {

  public AssistantContext {
    if (timezone == null) timezone = ZoneId.of("Asia/Shanghai");
  }
}
