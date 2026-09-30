package com.familyledger.controller;

import com.familyledger.auth.AuthGuard;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.common.ApiException;
import com.familyledger.common.Params;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerRequest;
import com.familyledger.service.LedgerQueryService;
import com.familyledger.service.LedgerService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/transactions")
public class TransactionController {
  private final LedgerService service;
  private final LedgerQueryService queries;
  private final AuthGuard guard;
  private final LedgerAuthorization authorization;

  public TransactionController(LedgerService service, LedgerQueryService queries, AuthGuard guard,
      LedgerAuthorization authorization) {
    this.service = service; this.queries = queries; this.guard = guard; this.authorization = authorization;
  }

  @GetMapping
  public Map<String, Object> list(HttpServletRequest request,
      @RequestParam(value = "month", required = false) String month,
      @RequestParam(value = "type", required = false) String type,
      @RequestParam(value = "accountId", required = false) String accountId,
      @RequestParam(value = "page", required = false) String page,
      @RequestParam(value = "pageSize", required = false) String pageSize) {
    String m = month == null ? null : Params.parseMonth(month, "month");
    String t = type == null ? null : Params.parseEnum(type, "type", "expense", "income", "transfer");
    LedgerContext context = LedgerRequest.context(request, null, guard, authorization);
    return queries.list(context, m, t, Params.parseLongPositive(accountId, "accountId"),
        Params.parseIntPositive(page, "page"), Params.parseIntPositive(pageSize, "pageSize"));
  }

  @PostMapping
  public ResponseEntity<Map<String, Object>> create(HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    LedgerContext context = LedgerRequest.context(request, body, guard, authorization);
    return ResponseEntity.status(HttpStatus.CREATED).body(service.createTransaction(principal, context, body));
  }

  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable Object id, HttpServletRequest request) {
    return queries.get(LedgerRequest.context(request, null, guard, authorization), Params.parseId(id));
  }

  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable Object id, HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    return service.updateTransaction(principal, LedgerRequest.context(request, body, guard, authorization),
        Params.parseId(id), body);
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable Object id, HttpServletRequest request) {
    AuthPrincipal principal = guard.requireLedgerUser(request);
    service.deleteTransaction(principal, LedgerRequest.context(request, null, guard, authorization), Params.parseId(id));
    Map<String, Object> out = new LinkedHashMap<>(); out.put("ok", true); return out;
  }
}
