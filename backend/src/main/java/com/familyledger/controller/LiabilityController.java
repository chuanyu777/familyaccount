package com.familyledger.controller;

import com.familyledger.auth.AuthGuard;
import com.familyledger.common.Params;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerRequest;
import com.familyledger.service.LiabilityService;
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
@RequestMapping("/api/liabilities")
public class LiabilityController {
  private final LiabilityService service; private final AuthGuard guard; private final LedgerAuthorization authorization;
  public LiabilityController(LiabilityService service, AuthGuard guard, LedgerAuthorization authorization) {
    this.service = service; this.guard = guard; this.authorization = authorization;
  }
  @GetMapping
  public List<Map<String, Object>> list(HttpServletRequest request) { return service.list(LedgerRequest.context(request, null, guard, authorization)); }
  @PostMapping
  public ResponseEntity<Map<String, Object>> create(HttpServletRequest request, @RequestBody Map<String, Object> body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(LedgerRequest.context(request, body, guard, authorization), body));
  }
  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable Object id, HttpServletRequest request, @RequestBody Map<String, Object> body) {
    return service.update(LedgerRequest.context(request, body, guard, authorization), Params.parseId(id), body);
  }
  @PostMapping("/{id}/archive")
  public void archive(@PathVariable Object id, HttpServletRequest request) {
    service.archive(LedgerRequest.context(request, null, guard, authorization), Params.parseId(id));
  }
  @PostMapping("/{id}/restore")
  public void restore(@PathVariable Object id, HttpServletRequest request) {
    service.restore(LedgerRequest.context(request, null, guard, authorization), Params.parseId(id));
  }
}
