package com.familyledger.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 健康检查：供容器编排与反向代理探活，不属于 /api 前缀，因此不受访问守卫保护。 */
@RestController
public class HealthController {

  @GetMapping("/healthz")
  public ResponseEntity<Void> health() {
    return ResponseEntity.noContent().build();
  }
}
