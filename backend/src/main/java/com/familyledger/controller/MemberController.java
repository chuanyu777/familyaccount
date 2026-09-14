package com.familyledger.controller;

import com.familyledger.common.ApiException;
import com.familyledger.common.Params;
import com.familyledger.service.MemberService;
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
@RequestMapping("/api/members")
public class MemberController {
  private final MemberService service;

  public MemberController(MemberService service) {
    this.service = service;
  }

  @GetMapping
  public List<Map<String, Object>> list() {
    return service.list();
  }

  @PostMapping
  public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
    String name = requireName(body);
    String color = body.get("color") == null ? null : String.valueOf(body.get("color"));
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(name, color));
  }

  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable("id") Object id, @RequestBody Map<String, Object> body) {
    Map<String, Object> patch = new LinkedHashMap<>();
    if (body.containsKey("name")) patch.put("name", body.get("name"));
    if (body.containsKey("color")) patch.put("color", body.get("color"));
    return service.update(Params.parseId(id), patch);
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable("id") Object id) {
    service.delete(Params.parseId(id));
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("ok", true);
    return m;
  }

  private String requireName(Map<String, Object> body) {
    Object name = body.get("name");
    if (name == null || String.valueOf(name).trim().isEmpty()) {
      throw ApiException.badRequest("VALIDATION_FAILED", "名称不能为空");
    }
    return String.valueOf(name).trim();
  }
}
