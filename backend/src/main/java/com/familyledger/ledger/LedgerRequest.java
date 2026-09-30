package com.familyledger.ledger;

import com.familyledger.auth.AuthGuard;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.common.Params;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

public final class LedgerRequest {
  private LedgerRequest() {}

  public static LedgerContext context(HttpServletRequest request, Map<String, Object> body,
      AuthGuard guard, LedgerAuthorization authorization) {
    String raw = request.getHeader("X-Ledger-Id");
    if (raw == null || raw.isBlank()) raw = request.getParameter("ledgerId");
    if ((raw == null || raw.isBlank()) && body != null && body.get("ledgerId") != null) raw = String.valueOf(body.get("ledgerId"));
    if (raw == null || raw.isBlank()) throw ApiException.badRequest("LEDGER_REQUIRED", "缺少 ledgerId");
    AuthPrincipal principal = guard.requireLedgerUser(request);
    return authorization.requireMembership(principal, Params.parseId(raw));
  }
}
