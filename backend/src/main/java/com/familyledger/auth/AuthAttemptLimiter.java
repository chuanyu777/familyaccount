package com.familyledger.auth;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;

/** 进程内登录失败限流；部署多实例时应在网关或共享存储层再加一层。 */
@Component
public class AuthAttemptLimiter {
  public static final int MAX_FAILURES = 5;
  private static final long WINDOW_MILLIS = 15 * 60 * 1000L;
  private final ConcurrentMap<String, Deque<Long>> failures = new ConcurrentHashMap<>();

  public boolean isLimited(String key, long now) {
    Deque<Long> queue = failures.computeIfAbsent(key, ignored -> new ArrayDeque<>());
    synchronized (queue) {
      trim(queue, now);
      return queue.size() >= MAX_FAILURES;
    }
  }

  public void recordFailure(String key, long now) {
    Deque<Long> queue = failures.computeIfAbsent(key, ignored -> new ArrayDeque<>());
    synchronized (queue) {
      trim(queue, now);
      queue.addLast(now);
    }
  }

  private static void trim(Deque<Long> queue, long now) {
    long cutoff = now - WINDOW_MILLIS;
    while (!queue.isEmpty() && queue.peekFirst() <= cutoff) queue.removeFirst();
  }
}
