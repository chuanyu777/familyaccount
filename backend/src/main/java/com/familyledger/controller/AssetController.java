package com.familyledger.controller;

import com.familyledger.auth.AuthGuard;
import com.familyledger.common.Params;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerRequest;
import com.familyledger.service.AssetService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
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
@RequestMapping("/api/assets")
public class AssetController {
  private final AssetService service; private final AuthGuard guard; private final LedgerAuthorization authorization;
  public AssetController(AssetService service, AuthGuard guard, LedgerAuthorization authorization) {
    this.service = service; this.guard = guard; this.authorization = authorization;
  }
  @GetMapping
  public List<Map<String, Object>> list(HttpServletRequest request) { return service.list(ctx(request, null)); }
  @PostMapping
  public ResponseEntity<Map<String, Object>> create(HttpServletRequest request, @RequestBody Map<String, Object> body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(ctx(request, body), body));
  }
  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable Object id, HttpServletRequest request, @RequestBody Map<String, Object> body) {
    return service.update(ctx(request, body), Params.parseId(id), body);
  }
  @PostMapping("/{id}/archive")
  public void archive(@PathVariable Object id, HttpServletRequest request) { service.archive(ctx(request, null), Params.parseId(id)); }
  @PostMapping("/{id}/restore")
  public void restore(@PathVariable Object id, HttpServletRequest request) { service.restore(ctx(request, null), Params.parseId(id)); }
  @GetMapping("/{id}/snapshots")
  public List<Map<String, Object>> snapshots(@PathVariable Object id, HttpServletRequest request) {
    return service.listSnapshots(ctx(request, null), Params.parseId(id));
  }
  @PostMapping("/{id}/snapshots")
  public ResponseEntity<Map<String, Object>> snapshot(@PathVariable Object id, HttpServletRequest request,
      @RequestBody Map<String, Object> body) {
    LedgerContext context = ctx(request, body);
    return ResponseEntity.status(HttpStatus.CREATED).body(service.upsertSnapshot(context, Params.parseId(id),
        Params.parseMonth(body.get("month"), "month"), body.get("value"),
        body.get("note") == null ? null : String.valueOf(body.get("note"))));
  }
  private LedgerContext ctx(HttpServletRequest request, Map<String, Object> body) {
    return LedgerRequest.context(request, body, guard, authorization);
  }
}
