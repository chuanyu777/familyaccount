package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familyledger.db.Seeder;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** 全链路冒烟：US-01 → US-09，与 TS 版 smoke.test.ts 对齐。 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SmokeTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired Seeder seeder;
  @Autowired ObjectMapper om;

  @BeforeEach
  void reset() {
    TestDb.reset(jdbc);
    seeder.ensureSeeded();
  }

  private JsonNode call(String method, String url, Object body, int expectStatus) throws Exception {
    MockHttpServletRequestBuilder b = switch (method) {
      case "GET" -> org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url);
      case "POST" -> org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url);
      case "PATCH" -> org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(url);
      case "DELETE" -> org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(url);
      default -> throw new IllegalArgumentException(method);
    };
    if (body != null) {
      b.contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(body));
    }
    String s = mvc.perform(b).andExpect(status().is(expectStatus)).andReturn()
        .getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    return s.isEmpty() ? om.createObjectNode() : om.readTree(s);
  }

  private JsonNode get(String url) throws Exception {
    return call("GET", url, null, 200);
  }

  private JsonNode post(String url, Object body, int status) throws Exception {
    return call("POST", url, body, status);
  }

  private JsonNode findById(JsonNode arr, long id) {
    for (JsonNode e : arr) {
      if (e.get("id").asLong() == id) return e;
    }
    return null;
  }

  @Test
  void fullFlow() throws Exception {
    // US-01 初始化
    JsonNode family = get("/api/family");
    assertThat(family.get("name").asText()).isEqualTo("我的家");

    JsonNode members = get("/api/members");
    assertThat(members).hasSize(1);
    assertThat(members.get(0).get("name").asText()).isEqualTo("我");
    long meId = members.get(0).get("id").asLong();

    JsonNode accounts0 = get("/api/accounts");
    assertThat(accounts0).hasSize(1);
    assertThat(accounts0.get(0).get("name").asText()).isEqualTo("默认账户");
    assertThat(accounts0.get(0).get("is_default").asInt()).isEqualTo(1);
    long defaultAccountId = accounts0.get(0).get("id").asLong();

    // US-02 账户
    long salaryId = post("/api/accounts", Map.of("name", "工资卡"), 201).get("id").asLong();

    // US-03 记账
    post("/api/transactions", Map.of("type", "expense", "amount", 100, "categoryName", "餐饮"), 201);
    post("/api/transactions", Map.of("type", "income", "amount", 5000, "categoryName", "工资"), 201);

    JsonNode cats = get("/api/categories?kind=expense");
    boolean hasFood = false;
    for (JsonNode c : cats) if ("餐饮".equals(c.get("name").asText())) hasFood = true;
    assertThat(hasFood).isTrue();

    post("/api/transactions", Map.of("type", "transfer", "amount", 900, "toAccountId", salaryId), 201);

    JsonNode accounts = get("/api/accounts");
    assertThat(findById(accounts, defaultAccountId).get("balance_cents").asLong()).isEqualTo(400000L);
    assertThat(findById(accounts, salaryId).get("balance_cents").asLong()).isEqualTo(90000L);

    // US-05 统计口径
    JsonNode list = get("/api/transactions");
    assertThat(list.get("total").asLong()).isEqualTo(3L);
    assertThat(list.get("incomeTotalCents").asLong()).isEqualTo(500000L);
    assertThat(list.get("expenseTotalCents").asLong()).isEqualTo(10000L);
    assertThat(list.get("netCents").asLong()).isEqualTo(490000L);

    // US-06 资产
    post("/api/assets", Map.of("name", "自住房", "value", 1000000, "kind", "房产", "memberId", meId), 201);

    // US-07 负债
    long loanId = post("/api/liabilities",
        Map.of("name", "房贷", "remaining", 800000, "monthlyPayment", 5000, "paymentDay", 20), 201)
        .get("id").asLong();

    // US-08 还款
    long repayId = post("/api/repayments", Map.of("liabilityId", loanId, "amount", 5000), 201)
        .get("id").asLong();

    JsonNode liabs = get("/api/liabilities");
    assertThat(findById(liabs, loanId).get("remaining_cents").asLong()).isEqualTo(79500000L);

    accounts = get("/api/accounts");
    assertThat(findById(accounts, defaultAccountId).get("balance_cents").asLong()).isEqualTo(-100000L);

    JsonNode afterRepay = get("/api/transactions");
    JsonNode generated = null;
    for (JsonNode t : afterRepay.get("items")) {
      if ("repayment".equals(t.get("sourceType").asText())) generated = t;
    }
    assertThat(generated).isNotNull();
    assertThat(generated.get("amountCents").asLong()).isEqualTo(500000L);
    assertThat(afterRepay.get("expenseTotalCents").asLong()).isEqualTo(510000L);

    // 还款生成的支出不可直接删
    call("DELETE", "/api/transactions/" + generated.get("id").asLong(), null, 409);

    // US-09 净资产
    JsonNode stats = get("/api/stats/summary");
    long accountsCents = 0;
    for (JsonNode a : accounts) accountsCents += a.get("balance_cents").asLong();
    assertThat(stats.get("accountsTotalCents").asLong()).isEqualTo(accountsCents);
    assertThat(stats.get("assetsTotalCents").asLong()).isEqualTo(100000000L);
    assertThat(stats.get("totalAssetsCents").asLong()).isEqualTo(accountsCents + 100000000L);
    assertThat(stats.get("totalLiabilitiesCents").asLong()).isEqualTo(79500000L);
    assertThat(stats.get("netWorthCents").asLong()).isEqualTo(accountsCents + 100000000L - 79500000L);
    assertThat(stats.get("monthlyPaymentTotalCents").asLong()).isEqualTo(500000L);

    JsonNode trend = get("/api/stats/monthly-trend?months=6");
    assertThat(trend).hasSize(6);
    JsonNode thisMonth = trend.get(trend.size() - 1);
    assertThat(thisMonth.get("incomeCents").asLong()).isEqualTo(500000L);
    assertThat(thisMonth.get("expenseCents").asLong()).isEqualTo(510000L);

    JsonNode breakdown = get("/api/stats/category-breakdown");
    boolean hasOther = false;
    double percentSum = 0;
    for (JsonNode c : breakdown) {
      if ("其他".equals(c.get("name").asText())) hasOther = true;
      percentSum += c.get("percent").asDouble();
    }
    assertThat(hasOther).isTrue();
    assertThat(Math.abs(percentSum - 100)).isLessThan(0.01);

    // 删除还款：完整回滚
    call("DELETE", "/api/repayments/" + repayId, null, 200);
    liabs = get("/api/liabilities");
    assertThat(findById(liabs, loanId).get("remaining_cents").asLong()).isEqualTo(80000000L);
    accounts = get("/api/accounts");
    assertThat(findById(accounts, defaultAccountId).get("balance_cents").asLong()).isEqualTo(400000L);

    JsonNode afterDelete = get("/api/transactions");
    assertThat(afterDelete.get("expenseTotalCents").asLong()).isEqualTo(10000L);

    // 删除负债：级联清理
    post("/api/repayments", Map.of("liabilityId", loanId, "amount", 5000), 201);
    call("DELETE", "/api/liabilities/" + loanId, null, 200);
    stats = get("/api/stats/summary");
    assertThat(stats.get("totalLiabilitiesCents").asLong()).isEqualTo(0L);

    // 有交易的账户不允许删除
    call("DELETE", "/api/accounts/" + defaultAccountId, null, 409);
    long emptyId = post("/api/accounts", Map.of("name", "空账户"), 201).get("id").asLong();
    call("DELETE", "/api/accounts/" + emptyId, null, 200);
  }
}
