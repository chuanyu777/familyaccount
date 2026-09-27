package com.familyledger.access;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** 注册访问守卫：保护 /api/**，放行 /api/access/**。 */
@Configuration
public class AccessWebConfig implements WebMvcConfigurer {
  private final AccessConfig config;

  public AccessWebConfig(AccessConfig config) {
    this.config = config;
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry
        .addInterceptor(new AccessGuard(config))
        .addPathPatterns("/api/**")
        .excludePathPatterns("/api/access/**");
  }
}
