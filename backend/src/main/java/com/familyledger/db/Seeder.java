package com.familyledger.db;

import com.familyledger.common.Time;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** 初始化种子数据：仅当 family 表没有行时插入，保证幂等。 */
@Component
public class Seeder {
  private final JdbcTemplate db;

  public Seeder(JdbcTemplate db) {
    this.db = db;
  }

  public void ensureSeeded() {
    Long n = db.queryForObject("SELECT COUNT(*) FROM family", Long.class);
    if (n != null && n > 0) return;
    String ts = Time.now();
    db.update("INSERT INTO family (id, name, created_at) VALUES (?, ?, ?)", 1L, "我的家", ts);
    db.update("INSERT INTO member (name, created_at) VALUES (?, ?)", "我", ts);
    db.update("INSERT INTO account (name, balance_cents, is_default, created_at) VALUES (?, ?, ?, ?)",
        "默认账户", 0L, 1, ts);
    db.update("INSERT INTO category (kind, name, created_at) VALUES (?, ?, ?)", "expense", "其他", ts);
    db.update("INSERT INTO category (kind, name, created_at) VALUES (?, ?, ?)", "income", "其他收入", ts);
  }
}
