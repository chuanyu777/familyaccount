package com.familyledger;

import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

/** 测试辅助：重建内存库（先按外键逆序删表，再跑 schema.sql）。 */
public final class TestDb {
  private static final String[] TABLES = {
      "asset_snapshot", "repayment", "liability", "asset", "txn",
      "category", "account", "member", "family"
  };

  private TestDb() {}

  public static void reset(JdbcTemplate jdbc) {
    for (String t : TABLES) {
      jdbc.execute("DROP TABLE IF EXISTS " + t);
    }
    String schema = readClasspath("schema.sql");
    for (String stmt : schema.split(";")) {
      String s = stmt.trim();
      if (!s.isEmpty()) {
        jdbc.execute(s);
      }
    }
  }

  private static String readClasspath(String path) {
    try {
      return new String(new ClassPathResource(path).getInputStream().readAllBytes(),
          StandardCharsets.UTF_8);
    } catch (Exception e) {
      throw new RuntimeException("无法读取 " + path, e);
    }
  }
}
