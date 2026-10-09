package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;

import com.familyledger.db.Seeder;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class SchemaSeedTest {
  private static final List<String> LEDGER_TABLES = List.of(
      "app_user", "ledger", "ledger_membership", "ledger_invitation", "web_credential",
      "platform_admin", "web_binding_code", "web_account_link", "account", "category", "txn", "asset",
      "liability", "repayment", "asset_snapshot");

  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
  }

  @Test
  void createsLedgerScopedTables() {
    for (String table : LEDGER_TABLES) {
      assertThat(tableExists(table)).as("table %s", table).isTrue();
    }
    assertThat(tableExists("family")).isFalse();
    assertThat(tableExists("member")).isFalse();
  }

  @Test
  void seedsOneSpecialLedgerAndTwoWebUsers() {
    seeder.ensureSeeded();

    assertThat(count("ledger")).isEqualTo(1);
    assertThat(count("platform_admin")).isEqualTo(1);
    assertThat(count("web_credential")).isEqualTo(2);
    assertThat(count("app_user")).isEqualTo(2);
    assertThat(count("ledger_membership")).isEqualTo(2);
    assertThat(count("ledger_membership", "role = 'OWNER'")).isEqualTo(1);
    assertThat(count("ledger_membership", "role = 'MEMBER'")).isEqualTo(1);
    assertThat(count("ledger_membership", "web_login_allowed = 1 AND active = 1")).isEqualTo(2);
    assertThat(db.queryForObject("SELECT name FROM ledger WHERE is_web_enabled = 1", String.class))
        .isEqualTo("测试特殊账本");
    assertThat(count("web_credential", "username IN ('ledger-owner', 'ledger-member')"))
        .isEqualTo(2);
    assertThat(count("web_credential", "password_hash LIKE 'pbkdf2-sha256$%$%$%'"))
        .isEqualTo(2);
  }

  @Test
  void seedIsIdempotent() {
    seeder.ensureSeeded();
    seeder.ensureSeeded();

    assertThat(count("platform_admin")).isEqualTo(1);
    assertThat(count("web_credential")).isEqualTo(2);
    assertThat(count("ledger_membership")).isEqualTo(2);
    assertThat(count("ledger_membership", "active = 1")).isEqualTo(2);
    assertThat(count("web_credential", "username IS NOT NULL")).isEqualTo(
        countDistinct("web_credential", "username"));
  }

  private int count(String table) {
    return count(table, "1 = 1");
  }

  private int count(String table, String predicate) {
    return db.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE " + predicate, Integer.class);
  }

  private int countDistinct(String table, String column) {
    return db.queryForObject("SELECT COUNT(DISTINCT " + column + ") FROM " + table, Integer.class);
  }

  private boolean tableExists(String table) {
    Integer n = db.queryForObject(
        "SELECT COUNT(*) FROM information_schema.tables WHERE lower(table_name) = ?",
        Integer.class, table.toLowerCase());
    return n != null && n > 0;
  }
}
