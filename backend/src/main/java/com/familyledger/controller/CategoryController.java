package com.familyledger.controller;

import com.familyledger.common.ApiException;
import com.familyledger.common.Params;
import com.familyledger.service.CategoryService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {
  private final CategoryService service;

  public CategoryController(CategoryService service) {
    this.service = service;
  }

  @GetMapping
  public List<Map<String, Object>> list(@RequestParam("kind") Object kind) {
    String k = Params.parseEnum(kind, "kind", "expense", "income");
    return service.list(k);
  }

  @PostMapping
  public Map<String, Object> create(@RequestBody Map<String, Object> body) {
    String kind = Params.parseEnum(body.get("kind"), "kind", "expense", "income");
    Object name = body.get("name");
    if (name == null || String.valueOf(name).trim().isEmpty()) {
      throw ApiException.badRequest("VALIDATION_FAILED", "分类名称不能为空");
    }
    return service.upsert(kind, String.valueOf(name).trim());
  }
}
