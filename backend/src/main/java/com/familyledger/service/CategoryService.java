package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 收支分类。 */
@Service
public class CategoryService {
  private final JdbcTemplate db;

  public CategoryService(JdbcTemplate db) {
    this.db = db;
  }

  private Map<String, Object> toRow(Map<String, Object> r) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", Row.lng(r, "id"));
    m.put("kind", Row.str(r, "kind"));
    m.put("name", Row.str(r, "name"));
    m.put("created_at", Row.str(r, "created_at"));
    return m;
  }

  public List<Map<String, Object>> list(String kind) {
    return db.queryForList(
        "SELECT id, kind, name, created_at FROM category WHERE kind = ? ORDER BY id", kind)
        .stream().map(this::toRow).toList();
  }

  public Map<String, Object> upsert(String kind, String name) {
    String n = name.trim();
    if (n.isEmpty()) throw ApiException.badRequest("VALIDATION_FAILED", "分类名称不能为空");
    List<Map<String, Object>> existing = db.queryForList(
        "SELECT id, kind, name, created_at FROM category WHERE kind = ? AND name = ?", kind, n);
    if (!existing.isEmpty()) return toRow(existing.get(0));
    long id = Db.insert(db, "INSERT INTO category (kind, name, created_at) VALUES (?, ?, ?)",
        kind, n, Time.now());
    return toRow(db.queryForMap("SELECT id, kind, name, created_at FROM category WHERE id = ?", id));
  }

  /** 取（必要时创建）默认分类：支出「其他」、收入「其他收入」。 */
  public Map<String, Object> ensureDefault(String kind) {
    return upsert(kind, "expense".equals(kind) ? "其他" : "其他收入");
  }
}
