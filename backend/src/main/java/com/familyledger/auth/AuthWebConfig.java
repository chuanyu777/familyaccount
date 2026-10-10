package com.familyledger.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class AuthWebConfig implements WebMvcConfigurer {
  private final AuthGuard guard;

  public AuthWebConfig(AuthGuard guard) { this.guard = guard; }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(new PrincipalInterceptor(guard))
        .addPathPatterns("/api/**")
        .excludePathPatterns("/api/auth/**", "/api/profile/*/avatar", "/api/assistant/internal/**");
  }

  private static final class PrincipalInterceptor implements HandlerInterceptor {
    private final AuthGuard guard;

    private PrincipalInterceptor(AuthGuard guard) { this.guard = guard; }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
        throws Exception {
      var principal = guard.resolve(request);
      boolean platformRoute = request.getRequestURI().startsWith("/api/platform/");
      if (principal.isEmpty()) {
        write(response, 401, "AUTH_REQUIRED", "需要登录");
        return false;
      }
      boolean correctType = platformRoute
          ? principal.get().type() == PrincipalType.PLATFORM_ADMIN
          : principal.get().type() == PrincipalType.LEDGER_USER;
      if (!correctType) {
        write(response, 403,
            platformRoute ? "PLATFORM_SESSION_REQUIRED" : "LEDGER_SESSION_REQUIRED",
            platformRoute ? "需要平台管理员登录" : "需要账本用户登录");
        return false;
      }
      request.setAttribute(AuthGuard.REQUEST_PRINCIPAL, principal.get());
      return true;
    }

    private static void write(HttpServletResponse response, int status, String code, String message)
        throws Exception {
      response.setStatus(status);
      response.setContentType("application/json;charset=UTF-8");
      String body = "{\"error\":{\"code\":\"" + code + "\",\"message\":\"" + message + "\"}}";
      response.getWriter().write(new String(body.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8));
    }
  }
}
