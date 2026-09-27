package com.familyledger.access;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 解锁失败限流：同一客户端地址滚动 15 分钟内 5 次失败后拒绝继续尝试。
 *
 * <p>进程内内存实现——重启即清零，且多实例部署时各实例独立计数。
 * 与 Node 版行为一致；如需跨实例共享，应换成 Redis 之类的外部存储。
 */
public class FailedAttemptLimiter {
  public static final int MAX_FAILED_ATTEMPTS = 5;
  public static final long WINDOW_MS = 15L * 60 * 1000;

  private final Map<String, List<Long>> attemptsByIp = new ConcurrentHashMap<>();

  public boolean isLimited(String ip, long nowMillis) {
    return activeAttempts(ip, nowMillis).size() >= MAX_FAILED_ATTEMPTS;
  }

  public void recordFailure(String ip, long nowMillis) {
    activeAttempts(ip, nowMillis).add(nowMillis);
  }

  private List<Long> activeAttempts(String ip, long nowMillis) {
    long cutoff = nowMillis - WINDOW_MS;
    List<Long> attempts = attemptsByIp.computeIfAbsent(ip, key -> new ArrayList<>());
    attempts.removeIf(timestamp -> timestamp <= cutoff);
    if (attempts.isEmpty()) {
      attemptsByIp.remove(ip);
      attempts = attemptsByIp.computeIfAbsent(ip, key -> new ArrayList<>());
    }
    return attempts;
  }
}
