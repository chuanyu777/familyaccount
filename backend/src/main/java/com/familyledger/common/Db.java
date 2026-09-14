package com.familyledger.common;

import java.sql.PreparedStatement;
import java.sql.Statement;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;

/** JdbcTemplate 辅助：插入并取回自增主键。 */
public final class Db {
  private Db() {}

  public static long insert(JdbcTemplate jdbc, String sql, Object... args) {
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbc.update(con -> {
      PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
      for (int i = 0; i < args.length; i++) {
        ps.setObject(i + 1, args[i]);
      }
      return ps;
    }, keyHolder);
    Number key = keyHolder.getKey();
    if (key == null) {
      throw new IllegalStateException("插入未返回自增主键: " + sql);
    }
    return key.longValue();
  }

  /**
   * 取单个 long（COUNT / SUM 等聚合）。用 rs.getLong 而非 getObject(Long.class)，
   * 避免 MySQL 的 SUM 返回 DECIMAL 时类型转换失败。
   */
  public static long queryLong(JdbcTemplate jdbc, String sql, Object... args) {
    Long v = jdbc.queryForObject(sql, (rs, i) -> rs.getLong(1), args);
    return v == null ? 0 : v;
  }
}
