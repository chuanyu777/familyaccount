package com.familyledger.controller;

import com.familyledger.common.ApiException;
import com.familyledger.common.Money;
import com.familyledger.common.Params;
import com.familyledger.service.AccountService;
import java.util.LinkedHashMap;
import java.util.List;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/accounts")
public class AccountController {
  private final AccountService service;

  public AccountController(AccountService service) {
    this.service = service;
  }

  @GetMapping
  public List<Map<String, Object>> list() {
    return service.list();
  }

  @PostMapping
  public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
    String name = requireName(body);
    Long memberId = body.get("memberId") == null ? null
        : ((Number) body.get("memberId")).longValue();
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(name, memberId));
  }

  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable("id") Object id, @RequestBody Map<String, Object> body) {
    Map<String, Object> patch = new LinkedHashMap<>();
    if (body.containsKey("name")) patch.put("name", body.get("name"));
    if (body.containsKey("memberId")) patch.put("memberId", body.get("memberId"));
    return service.update(Params.parseId(id), patch);
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable("id") Object id) {
    service.delete(Params.parseId(id));
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("ok", true);
    return m;
  }

  @PostMapping("/{id}/set-default")
  public Map<String, Object> setDefault(@PathVariable("id") Object id) {
    long parsed = Params.parseId(id);
    service.setDefault(parsed);
    return service.get(parsed);
  }

  @PatchMapping("/{id}/calibrate")
  public Map<String, Object> calibrate(@PathVariable("id") Object id, @RequestBody Map<String, Object> body) {
    long cents;
    try {
      cents = Money.toCents(body.get("balance"));
    } catch (IllegalArgumentException e) {
      throw ApiException.badRequest("VALIDATION_FAILED", "金额格式非法");
    }
    return service.calibrate(Params.parseId(id), cents);
  }

  private String requireName(Map<String, Object> body) {
    Object name = body.get("name");
    if (name == null || String.valueOf(name).trim().isEmpty()) {
      throw ApiException.badRequest("VALIDATION_FAILED", "名称不能为空");
    }
    return String.valueOf(name).trim();
  }
}
