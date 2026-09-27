package com.familyledger.access;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** 限流器是进程内单例，多实例部署时各实例独立计数。 */
@Configuration
public class FailedAttemptLimiterBean {

  @Bean
  public FailedAttemptLimiter failedAttemptLimiter() {
    return new FailedAttemptLimiter();
  }
}
