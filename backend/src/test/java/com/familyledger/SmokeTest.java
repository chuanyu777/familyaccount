package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;

import com.familyledger.db.Seeder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 新多租户 schema 的最小启动冒烟测试；业务 HTTP 合约由后续任务覆盖。 */
@SpringBootTest
@ActiveProfiles("test")
class SmokeTest {
  @Autowired JdbcTemplate jdbc;
  @Autowired Seeder seeder;

  @BeforeEach
  void reset() {
    TestDb.reset(jdbc);
    seeder.ensureSeeded();
  }

  @Test
  void startsWithOneWebLedgerAndDefaultResources() {
    assertThat(jdbc.queryForObject(
        "SELECT COUNT(*) FROM ledger WHERE is_web_enabled = 1", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject(
        "SELECT COUNT(*) FROM ledger_membership", Integer.class)).isEqualTo(2);
    assertThat(jdbc.queryForObject(
        "SELECT COUNT(*) FROM account WHERE is_default = 1", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM category", Integer.class)).isEqualTo(2);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM platform_admin", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM web_credential", Integer.class)).isEqualTo(2);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ledger_membership WHERE web_login_allowed = 1", Integer.class))
        .isEqualTo(2);
  }
}
