package com.familyledger.ledger;

import com.familyledger.auth.AuthGuard;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.common.Params;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ledgers")
public class LedgerController {
  private final AuthGuard guard;
  private final LedgerService service;

  public LedgerController(AuthGuard guard, LedgerService service) {
    this.guard = guard;
    this.service = service;
  }

  @GetMapping
  public List<LedgerSummary> list(HttpServletRequest request) {
    return service.listForUser(guard.requireLedgerUser(request).userId());
  }

  @PostMapping
  public ResponseEntity<LedgerSummary> create(HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(service.createLedger(principal.userId(), text(body, "name")));
  }

  @GetMapping("/{id}")
  public LedgerSummary get(@PathVariable Object id, HttpServletRequest request) {
    return service.getForUser(guard.requireLedgerUser(request), Params.parseId(id));
  }

  @PatchMapping("/{id}")
  public LedgerSummary rename(@PathVariable Object id, HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    return service.rename(guard.requireLedgerUser(request), Params.parseId(id), text(body, "name"));
  }

  private static String text(Map<String, Object> body, String key) {
    Object value = body == null ? null : body.get(key);
    return value == null ? null : String.valueOf(value);
  }
}
