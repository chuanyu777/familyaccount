package com.familyledger.controller;

import com.familyledger.common.ApiException;
import com.familyledger.common.Params;
import com.familyledger.service.RepaymentService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/repayments")
public class RepaymentController {
  private final RepaymentService service;

  public RepaymentController(RepaymentService service) {
    this.service = service;
  }

  @GetMapping
  public List<Map<String, Object>> list(@RequestParam(value = "liabilityId", required = false) String liabilityId) {
    Long lid = liabilityId == null || liabilityId.isEmpty() ? null : Params.parseLongPositive(liabilityId, "liabilityId");
    return service.list(lid);
  }

  @PostMapping
  public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
    Object liabilityId = body.get("liabilityId");
    if (liabilityId == null || ((Number) liabilityId).longValue() <= 0) {
      throw ApiException.badRequest("VALIDATION_FAILED", "liabilityId 必须为正整数");
    }
    return ResponseEntity.status(HttpStatus.CREATED).body(service.create(body));
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable("id") Object id) {
    service.delete(Params.parseId(id));
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("ok", true);
    return m;
  }
}
