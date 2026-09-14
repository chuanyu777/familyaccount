package com.familyledger.controller;

import com.familyledger.common.ApiException;
import com.familyledger.service.FamilyService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/family")
public class FamilyController {
  private final FamilyService service;

  public FamilyController(FamilyService service) {
    this.service = service;
  }

  @GetMapping
  public Map<String, Object> get() {
    return service.getFamily();
  }

  @PutMapping
  public Map<String, Object> update(@RequestBody Map<String, Object> body) {
    Object name = body.get("name");
    if (name == null || String.valueOf(name).trim().isEmpty()) {
      throw ApiException.badRequest("VALIDATION_FAILED", "名称不能为空");
    }
    return service.updateName(String.valueOf(name).trim());
  }
}
