package com.familyledger.controller;

import com.familyledger.common.Params;
import com.familyledger.service.AssetService;
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
@RequestMapping("/api/assets")
public class AssetController {
  private final AssetService service;

  public AssetController(AssetService service) {
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

  @GetMapping("/{id}/snapshots")
  public List<Map<String, Object>> snapshots(@PathVariable("id") Object id) {
    return service.listSnapshots(Params.parseId(id));
  }

  @PostMapping("/{id}/snapshots")
  public ResponseEntity<Map<String, Object>> addSnapshot(@PathVariable("id") Object id,
      @RequestBody Map<String, Object> body) {
    String month = Params.parseMonth(body.get("month"), "month");
    Object value = body.get("value");
    String note = body.get("note") == null ? null : String.valueOf(body.get("note"));
    Object updatedByMemberId = body.get("updatedByMemberId");
    Map<String, Object> out = service.upsertSnapshot(Params.parseId(id), month, value, note, updatedByMemberId);
    return ResponseEntity.status(HttpStatus.CREATED).body(out);
  }

  @DeleteMapping("/snapshots/{snapshotId}")
  public Map<String, Object> deleteSnapshot(@PathVariable("snapshotId") Object snapshotId) {
    service.deleteSnapshot(Params.parseId(snapshotId));
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("ok", true);
    return m;
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable("id") Object id) {
    service.delete(Params.parseId(id));
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("ok", true);
    return m;
  }
}
