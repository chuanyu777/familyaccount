package com.familyledger.platform;

import com.familyledger.auth.AuthGuard;
import com.familyledger.common.Params;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/platform/ledgers")
public class PlatformAdminController {
  private final AuthGuard guard;
  private final PlatformAdminQueryService queries;

  public PlatformAdminController(AuthGuard guard, PlatformAdminQueryService queries) {
    this.guard = guard;
    this.queries = queries;
  }

  @GetMapping
  public List<PlatformLedgerSummary> list(HttpServletRequest request,
      @RequestParam(value = "query", required = false) String query) {
    guard.requirePlatformAdmin(request);
    return queries.listLedgers(query);
  }

  @GetMapping("/{id}")
  public PlatformLedgerView get(@PathVariable Object id, HttpServletRequest request) {
    guard.requirePlatformAdmin(request);
    return queries.readLedger(Params.parseId(id));
  }
}
