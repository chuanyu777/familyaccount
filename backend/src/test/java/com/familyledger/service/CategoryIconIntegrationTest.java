package com.familyledger.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.db.Seeder;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerService;
import com.familyledger.TestDb;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 分类创建、改名与回填时 icon_key 是否正确落库。 */
@SpringBootTest
@ActiveProfiles("test")
class CategoryIconIntegrationTest {
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledgers;
  @Autowired LedgerAuthorization authorization;
  @Autowired CategoryService categories;

  private LedgerContext context;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
    long userId = insertUser("掌柜");
    long ledgerId = ledgers.createLedger(userId, "测试账本").id();
    context = authorization.requireMembership(AuthPrincipal.ledgerUser(userId), ledgerId);
  }

  @Test
  void newCategoryGetsIconFromDictionary() {
    Map<String, Object> food = categories.upsert(context, "expense", "周末餐饮");
    assertThat(food.get("icon_key")).isEqualTo("food");

    Map<String, Object> transport = categories.upsert(context, "expense", "地铁通勤");
    assertThat(transport.get("icon_key")).isEqualTo("transport");
  }

  @Test
  void unknownNameFallsBackToOther() {
    Map<String, Object> other = categories.upsert(context, "expense", "自定义名称");
    assertThat(other.get("icon_key")).isEqualTo("other");
  }

  @Test
  void defaultCategoryGetsOtherIcon() {
    Map<String, Object> def = categories.ensureDefault(context, "expense");
    assertThat(def.get("icon_key")).isEqualTo("other");
    Map<String, Object> income = categories.ensureDefault(context, "income");
    assertThat(income.get("icon_key")).isEqualTo("other");
  }

  @Test
  void renameReEvaluatesIconKey() {
    Map<String, Object> a = categories.upsert(context, "expense", "杂项");
    assertThat(a.get("icon_key")).isEqualTo("other");
    long id = ((Number) a.get("id")).longValue();
    Map<String, Object> renamed = categories.rename(context, id, "餐饮支出");
    assertThat(renamed.get("name")).isEqualTo("餐饮支出");
    assertThat(renamed.get("icon_key")).isEqualTo("food");
  }

  @Test
  void backfillFillsNullRowsAndRespectsExisting() {
    long id = ((Number) categories.upsert(context, "expense", "打车").get("id")).longValue();
    db.update("UPDATE category SET icon_key = NULL WHERE id = ?", id);

    int updated = categories.backfillIconsByName();
    Map<String, Object> row = db.queryForMap(
        "SELECT icon_key FROM category WHERE id = ?", id);
    assertThat(row.get("icon_key")).isEqualTo("transport");
    assertThat(updated).isGreaterThanOrEqualTo(1);
  }

  @Test
  void backfillLeavesAlreadyFilledRowsAlone() {
    long id = ((Number) categories.upsert(context, "expense", "咖啡馆").get("id")).longValue();
    db.update("UPDATE category SET icon_key = 'gift' WHERE id = ?", id);
    categories.backfillIconsByName();
    Map<String, Object> row = db.queryForMap("SELECT icon_key FROM category WHERE id = ?", id);
    assertThat(row.get("icon_key")).isEqualTo("gift"); // 已设置的不被覆盖
  }

  @Test
  void listReturnsIconKey() {
    categories.upsert(context, "expense", "餐饮");
    List<Map<String, Object>> rows = categories.list(context, "expense");
    assertThat(rows).isNotEmpty();
    assertThat(rows.get(0).get("icon_key")).isNotNull();
  }

  private long insertUser(String name) {
    var keys = new org.springframework.jdbc.support.GeneratedKeyHolder();
    db.update(con -> {
      var ps = con.prepareStatement(
          "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)",
          new String[] {"id"});
      ps.setString(1, name);
      ps.setString(2, com.familyledger.common.Time.now());
      return ps;
    }, keys);
    return keys.getKey().longValue();
  }
}