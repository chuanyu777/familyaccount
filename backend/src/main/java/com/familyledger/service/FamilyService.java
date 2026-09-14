package com.familyledger.service;

import com.familyledger.common.Row;
import com.familyledger.db.Seeder;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 单家庭读写。 */
@Service
public class FamilyService {
  private final JdbcTemplate db;
  private final Seeder seeder;

  public FamilyService(JdbcTemplate db, Seeder seeder) {
    this.db = db;
    this.seeder = seeder;
  }

  private Map<String, Object> get() {
    seeder.ensureSeeded();
    Map<String, Object> r = db.queryForMap("SELECT id, name FROM family WHERE id = 1");
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", Row.lng(r, "id"));
    m.put("name", Row.str(r, "name"));
    return m;
  }

  public Map<String, Object> getFamily() {
    return get();
  }

  public Map<String, Object> updateName(String name) {
    seeder.ensureSeeded();
    db.update("UPDATE family SET name = ? WHERE id = 1", name);
    return get();
  }
}
