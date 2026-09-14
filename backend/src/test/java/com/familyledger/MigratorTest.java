package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.familyledger.db.Migrator;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class MigratorTest {

  @Autowired Migrator migrator;
  @Autowired JdbcTemplate db;

  @Test
  void 首次运行登记基线且可重复执行() {
    migrator.migrate();
    migrator.migrate();

    Integer n = db.queryForObject("SELECT COUNT(*) FROM schema_migration", Integer.class);
    assertThat(n).isNotNull().isGreaterThanOrEqualTo(1);
    String name =
        db.queryForObject("SELECT name FROM schema_migration WHERE version = 1", String.class);
    assertThat(name).isEqualTo("baseline");
  }

  @Test
  void 应用新脚本后记录版本且不会重复执行() {
    migrator.migrate();
    migrator.applyScript(2, "probe", "CREATE TABLE IF NOT EXISTS migration_probe (id BIGINT)");

    assertThat(tableExists("migration_probe")).isTrue();
    Integer n =
        db.queryForObject("SELECT COUNT(*) FROM schema_migration WHERE version = 2", Integer.class);
    assertThat(n).isEqualTo(1);

    // 再跑一次不应重复插入记录
    migrator.migrate();
    n = db.queryForObject("SELECT COUNT(*) FROM schema_migration WHERE version = 2", Integer.class);
    assertThat(n).isEqualTo(1);
  }

  @Test
  void 已应用的脚本被修改后拒绝启动() {
    migrator.migrate();
    String original =
        db.queryForObject("SELECT checksum FROM schema_migration WHERE version = 1", String.class);
    db.update("UPDATE schema_migration SET checksum = 'tampered' WHERE version = 1");
    try {
      assertThatThrownBy(() -> migrator.migrate())
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("已被修改");
    } finally {
      db.update("UPDATE schema_migration SET checksum = ? WHERE version = 1", original);
    }
  }

  @Test
  void 语句切分能跳过注释与字符串中的分号() {
    String sql =
        "-- 建表\n"
            + "CREATE TABLE a (id BIGINT);\n"
            + "INSERT INTO a (id) VALUES (1); -- 尾部注释; 不是分隔符\n"
            + "SELECT 'a;b' FROM a;";
    List<String> stmts = Migrator.splitStatements(sql);
    assertThat(stmts).hasSize(3);
    assertThat(stmts.get(2)).contains("'a;b'");
    assertThat(stmts.get(1)).doesNotContain("尾部注释");
  }

  private boolean tableExists(String name) {
    Integer n =
        db.queryForObject(
            "SELECT COUNT(*) FROM information_schema.tables WHERE lower(table_name) = ?",
            Integer.class, name.toLowerCase());
    return n != null && n > 0;
  }
}
