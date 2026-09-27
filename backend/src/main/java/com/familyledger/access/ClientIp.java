package com.familyledger.access;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 客户端地址解析。
 *
 * <p>trustProxyHops = 0 时只信任直连地址（无法伪造，适合没有反向代理的场景）；
 * 大于 0 时从 X-Forwarded-For 由右往左取第 N 跳——部署在单层 Nginx 后必须配 1，
 * 否则所有请求都会被算成网关地址，限流会「一人生效、全体被限」。
 */
public final class ClientIp {

  private ClientIp() {}

  public static String resolve(HttpServletRequest request, int trustProxyHops) {
    if (trustProxyHops <= 0) {
      return fallback(request);
    }
    String forwarded = request.getHeader("X-Forwarded-For");
    if (forwarded == null || forwarded.isBlank()) {
      return fallback(request);
    }
    String[] hops = forwarded.split(",");
    int index = hops.length - trustProxyHops;
    if (index < 0) {
      index = 0;
    }
    String candidate = hops[index].trim();
    return candidate.isEmpty() ? fallback(request) : candidate;
  }

  private static String fallback(HttpServletRequest request) {
    String remote = request.getRemoteAddr();
    return remote == null || remote.isEmpty() ? "unknown" : remote;
  }
}
