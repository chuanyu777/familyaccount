package com.familyledger.controller;

import com.familyledger.auth.AuthGuard;
import com.familyledger.common.Params;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerRequest;
import com.familyledger.service.CategoryService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {
  private final CategoryService service; private final AuthGuard guard; private final LedgerAuthorization authorization;
  public CategoryController(CategoryService service, AuthGuard guard, LedgerAuthorization authorization) {
    this.service = service; this.guard = guard; this.authorization = authorization;
  }
  @GetMapping
  public List<Map<String, Object>> list(HttpServletRequest request, @RequestParam("kind") String kind) {
    return service.list(LedgerRequest.context(request, null, guard, authorization), Params.parseEnum(kind, "kind", "expense", "income"));
  }
  @PostMapping
  public Map<String, Object> create(HttpServletRequest request, @RequestBody Map<String, Object> body) {
    LedgerContext context = LedgerRequest.context(request, body, guard, authorization);
    String name = body.get("name") == null ? null : String.valueOf(body.get("name"));
    return service.upsert(context, Params.parseEnum(body.get("kind"), "kind", "expense", "income"), name);
  }
  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable Object id, HttpServletRequest request,
      @RequestBody(required = false) Map<String, Object> body) {
    LedgerContext context = LedgerRequest.context(request, body, guard, authorization);
    String name = body == null || body.get("name") == null ? null : String.valueOf(body.get("name"));
    return service.rename(context, Params.parseId(id), name);
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
