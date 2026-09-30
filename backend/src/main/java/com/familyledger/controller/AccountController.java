package com.familyledger.controller;

import com.familyledger.auth.AuthGuard;
import com.familyledger.common.Params;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerRequest;
import com.familyledger.service.AccountService;
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
@RequestMapping("/api/accounts")
public class AccountController {
  private final AccountService service;
  private final AuthGuard guard;
  private final LedgerAuthorization authorization;

  public AccountController(AccountService service, AuthGuard guard, LedgerAuthorization authorization) {
    this.service = service; this.guard = guard; this.authorization = authorization;
  }

  @GetMapping
  public List<Map<String, Object>> list(HttpServletRequest request) {
    return service.list(LedgerRequest.context(request, null, guard, authorization));
  }

  @PostMapping
  public ResponseEntity<Map<String, Object>> create(HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    LedgerContext context = LedgerRequest.context(request, body, guard, authorization);
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(context, text(body, "name")));
  }

  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable Object id, HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
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

  private static String text(Map<String, Object> body, String key) {
    Object value = body == null ? null : body.get(key); return value == null ? null : String.valueOf(value);
  }
}
