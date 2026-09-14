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

/** 家庭成员。update 用 Map 区分「未传」与「传 null」。 */
@Service
public class MemberService {
  private final JdbcTemplate db;

  public MemberService(JdbcTemplate db) {
    this.db = db;
  }

  private Map<String, Object> toRow(Map<String, Object> r) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", Row.lng(r, "id"));
    m.put("name", Row.str(r, "name"));
    m.put("color", Row.strOrNull(r, "color"));
    m.put("created_at", Row.str(r, "created_at"));
    return m;
  }

  public List<Map<String, Object>> list() {
    return db.queryForList("SELECT id, name, color, created_at FROM member ORDER BY id")
        .stream().map(this::toRow).toList();
  }

  public Map<String, Object> create(String name, String color) {
    String n = name.trim();
    if (n.isEmpty()) throw ApiException.badRequest("VALIDATION_FAILED", "成员名称不能为空");
    long id = Db.insert(db, "INSERT INTO member (name, color, created_at) VALUES (?, ?, ?)",
        n, color, Time.now());
    return toRow(db.queryForMap("SELECT id, name, color, created_at FROM member WHERE id = ?", id));
  }

  public Map<String, Object> update(long id, Map<String, Object> patch) {
    if (!exists(id)) throw ApiException.notFound("MEMBER_NOT_FOUND", "成员不存在");
    if (patch.containsKey("name")) {
      String n = String.valueOf(patch.get("name")).trim();
      if (n.isEmpty()) throw ApiException.badRequest("VALIDATION_FAILED", "成员名称不能为空");
      db.update("UPDATE member SET name = ? WHERE id = ?", n, id);
    }
    if (patch.containsKey("color")) {
      db.update("UPDATE member SET color = ? WHERE id = ?", patch.get("color"), id);
    }
    return toRow(db.queryForMap("SELECT id, name, color, created_at FROM member WHERE id = ?", id));
  }

  public void delete(long id) {
    if (!exists(id)) throw ApiException.notFound("MEMBER_NOT_FOUND", "成员不存在");
    db.update("DELETE FROM member WHERE id = ?", id);
  }

  public boolean exists(long id) {
    Long n = db.queryForObject("SELECT COUNT(*) FROM member WHERE id = ?", Long.class, id);
    return n != null && n > 0;
  }
}
