package com.familyledger.controller;

import com.familyledger.auth.AuthGuard;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.Params;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerRequest;
import com.familyledger.service.RepaymentService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/repayments")
public class RepaymentController {
  private final RepaymentService service; private final AuthGuard guard; private final LedgerAuthorization authorization;
  public RepaymentController(RepaymentService service, AuthGuard guard, LedgerAuthorization authorization) {
    this.service = service; this.guard = guard; this.authorization = authorization;
  }
  @GetMapping
  public List<Map<String, Object>> list(HttpServletRequest request, @RequestParam(value = "liabilityId", required = false) String liabilityId) {
    return service.list(LedgerRequest.context(request, null, guard, authorization),
        liabilityId == null ? null : Params.parseLongPositive(liabilityId, "liabilityId"));
  }
  @PostMapping
  public ResponseEntity<Map<String, Object>> create(HttpServletRequest request, @RequestBody Map<String, Object> body) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(principal, LedgerRequest.context(request, body, guard, authorization), body));
  }
  @PutMapping("/{id}")
  public Map<String, Object> update(@PathVariable Object id, HttpServletRequest request, @RequestBody Map<String, Object> body) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    return service.update(principal, LedgerRequest.context(request, body, guard, authorization), Params.parseId(id), body);
  }
  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable Object id, HttpServletRequest request) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    service.delete(principal, LedgerRequest.context(request, null, guard, authorization), Params.parseId(id));
    Map<String, Object> out = new LinkedHashMap<>(); out.put("ok", true); return out;
  }
}
