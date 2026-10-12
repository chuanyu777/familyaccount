package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;

import com.familyledger.auth.AuthPrincipal;
import com.familyledger.db.Seeder;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import com.familyledger.ledger.LedgerService;
import com.familyledger.service.CategoryService;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 分类相似归并回归：记账时「交通出行」应归到已有的「交通」，而不是新建近似分类。
 * 手动创建分类（upsertExact）不受归并影响。
 */
@SpringBootTest
@ActiveProfiles("test")
class CategorySimilarMergeTest {
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;
  @Autowired LedgerService ledgers;
  @Autowired CategoryService categories;
  @Autowired LedgerAuthorization authorization;

  private LedgerContext context;

  @BeforeEach
  void setUp() {
    TestDb.reset(db);
    seeder.ensureSeeded();
    long userId = insertUser("分类归并测试");
    long ledgerId = ledgers.createLedger(userId, "归并测试账本").id();
    context = authorization.requireMembership(AuthPrincipal.ledgerUser(userId), ledgerId);
  }

  private long upsert(String kind, String name) {
    return ((Number) categories.upsert(context, kind, name).get("id")).longValue();
  }

  private String nameOf(long id) {
    return (String) db.queryForMap("SELECT name FROM category WHERE id = ?", id).get("name");
  }

  private long categoryCount() {
    return ((Number) db.queryForMap("SELECT COUNT(*) AS c FROM category WHERE ledger_id = ?",
        context.ledgerId()).get("c")).longValue();
  }

  @Test
  void longerNameMergesIntoExistingShorterCategory() {
    long traffic = upsert("expense", "交通");
    long merged = upsert("expense", "交通出行");
    assertThat(merged).isEqualTo(traffic);
    assertThat(nameOf(merged)).isEqualTo("交通");
  }

  @Test
  void keywordMapsIntoUniqueIconCategory() {
    long traffic = upsert("expense", "交通");
    // 「加油」词典命中 transport；账本只有一个 transport 分类 → 归并
    long merged = upsert("expense", "加油");
    assertThat(merged).isEqualTo(traffic);
  }

  @Test
  void multipleCandidatesMergeIntoShortestName() {
    // 同类有多个候选时，归并到名字最短的标准名（「餐饮」），不新建
    categories.upsertExact(context, "expense", "餐饮");
    categories.upsertExact(context, "expense", "买菜做饭");
    long before = categoryCount();
    long merged = upsert("expense", "外卖");
    assertThat(nameOf(merged)).isEqualTo("餐饮");
    assertThat(categoryCount()).isEqualTo(before);
  }

  @Test
  void differentKindDoesNotMerge() {
    upsert("expense", "交通");
    long income = upsert("income", "交通出行");
    assertThat(nameOf(income)).isEqualTo("交通出行");
    assertThat("income".equals(db.queryForMap("SELECT kind FROM category WHERE id = ?", income)
        .get("kind"))).isTrue();
  }

  @Test
  void unrelatedNameStillCreatesNewCategory() {
    upsert("expense", "交通");
    long created = upsert("expense", "学习培训");
    assertThat(nameOf(created)).isEqualTo("学习培训");
  }

  @Test
  void manualCreateDoesNotMerge() {
    upsert("expense", "交通");
    // 手动创建走 upsertExact：明确要建「交通出行」就建出来
    long created = ((Number) categories.upsertExact(context, "expense", "交通出行").get("id"))
        .longValue();
    assertThat(nameOf(created)).isEqualTo("交通出行");
  }

  @Test
  void fallbackIconOtherDoesNotMerge() {
    upsert("expense", "其他");
    // 未识别名称 icon_key 兜底为 other，不应被并进「其他」分类
    long created = upsert("expense", "某个奇怪的东西");
    assertThat(nameOf(created)).isEqualTo("某个奇怪的东西");
  }

  private long insertUser(String name) {
    var keys = new org.springframework.jdbc.support.GeneratedKeyHolder();
    db.update(con -> {
      var ps = con.prepareStatement(
          "INSERT INTO app_user (display_name, created_at) VALUES (?, ?)", new String[] {"id"});
      ps.setString(1, name);
      ps.setString(2, com.familyledger.common.Time.now());
      return ps;
    }, keys);
    return keys.getKey().longValue();
  }
}