package com.familyledger.ledger;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Authorization entry point for the fixed special-ledger Web client. */
@Component
public class WebLedgerAuthorization {
  private final LedgerAuthorization authorization;
  private final JdbcTemplate db;

  public WebLedgerAuthorization(LedgerAuthorization authorization, JdbcTemplate db) {
    this.authorization = authorization;
    this.db = db;
  }

  public LedgerContext requireSpecialLedger(AuthPrincipal principal) {
    return authorization.requireSpecialLedger(principal, specialLedgerId());
  }

  public LedgerContext requireSpecialLedger(AuthPrincipal principal, long requestedLedgerId) {
    return authorization.requireSpecialLedger(principal, requestedLedgerId);
  }

  private long specialLedgerId() {
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id FROM ledger WHERE is_web_enabled = 1 ORDER BY id LIMIT 1");
    if (rows.isEmpty()) throw ApiException.notFound("SPECIAL_LEDGER_NOT_FOUND", "特殊账本不存在");
    return ((Number) rows.get(0).get("id")).longValue();
  }
}
