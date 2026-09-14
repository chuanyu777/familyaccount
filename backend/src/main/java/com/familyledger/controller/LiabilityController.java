package com.familyledger.controller;

import com.familyledger.common.Params;
import com.familyledger.service.LiabilityService;
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
@RequestMapping("/api/liabilities")
public class LiabilityController {
  private final LiabilityService service;

  public LiabilityController(LiabilityService service) {
    this.service = service;
  }

  @GetMapping
  public List<Map<String, Object>> list() {
    return service.list();
  }

  @PostMapping
  public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(body));
  }

  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable("id") Object id, @RequestBody Map<String, Object> body) {
    return service.update(Params.parseId(id), body);
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable("id") Object id) {
    service.delete(Params.parseId(id));
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("ok", true);
    return m;
  }
}
