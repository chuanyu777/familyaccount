package com.familyledger.access;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * /api 统一守卫：除 /api/access/** 外的所有接口都必须带有效可信设备会话。
 *
 * <p>未通过时直接写 401 JSON（与 Node 版一致），不重定向——页面跳转由前端 401 处理负责。
 */
public class AccessGuard implements HandlerInterceptor {
  private static final String DENIED_BODY =
      "{\"error\":{\"code\":\"ACCESS_REQUIRED\",\"message\":\"需要家庭访问口令\"}}";

  private final AccessConfig config;

  public AccessGuard(AccessConfig config) {
    this.config = config;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
      throws Exception {
    if (!config.isEnabled()) {
      return true;
    }
    if (AccessSession.hasValidSession(request, config, System.currentTimeMillis())) {
      return true;
    }
    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
    response.setContentType("application/json;charset=UTF-8");
    response.getWriter().write(new String(DENIED_BODY.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8));
    return false;
  }
}
