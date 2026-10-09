package com.familyledger;

import java.nio.charset.StandardCharsets;
import com.familyledger.db.Migrator;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

/** 测试辅助：重建内存库（先按外键逆序删表，再跑 schema.sql）。 */
public final class TestDb {
  private static final String[] TABLES = {
      "asset_snapshot", "repayment", "txn", "liability", "asset", "category", "account",
      "ledger_invitation", "web_binding_code", "web_account_link", "web_credential", "platform_admin",
      "ledger_membership", "wechat_identity", "ledger", "app_user"
  };

  private TestDb() {}

  public static void reset(JdbcTemplate jdbc) {
    // 助手表由 V3 迁移创建而不是 schema.sql 创建；保留表结构但清空运行数据，
    // 让每个集成测试都从干净的会话/操作状态开始。
    jdbc.execute("DELETE FROM assistant_message");
    jdbc.execute("DELETE FROM assistant_action");
    jdbc.execute("DELETE FROM assistant_run");
    jdbc.execute("DELETE FROM assistant_conversation");
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
    String profileMigration = readClasspath("db/migration/V3__user_profile_avatar.sql");
    for (String stmt : Migrator.splitStatements(profileMigration)) {
      jdbc.execute(stmt);
    }
    String webLinkMigration = readClasspath("db/migration/V4__web_ledger_import_links.sql");
    for (String stmt : Migrator.splitStatements(webLinkMigration)) {
      jdbc.execute(stmt);
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
