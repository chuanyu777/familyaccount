package com.familyledger;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.familyledger.auth.WeChatClient;
import com.familyledger.db.Seeder;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.mockito.Mockito.when;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ContractFlowTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate db;
  @Autowired Seeder seeder;

  @MockBean WeChatClient wechat;

  @BeforeEach
  void reset() {
    TestDb.reset(db);
    seeder.ensureSeeded();
  }

  @Test
  void normalWechatUserCanCreateJoinAndUseAnIsolatedLedger() throws Exception {
    when(wechat.exchangeLoginCode("owner-code"))
        .thenReturn(new WeChatClient.WeChatIdentity("contract-owner"));
    Cookie owner = wechatLogin("owner-code");
    long ledgerId = jsonLong(mvc.perform(post("/api/ledgers").cookie(owner)
        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"合同账本\"}"))
        .andExpect(status().isCreated()).andReturn(), "$.id");
    long accountId = jsonLong(mvc.perform(get("/api/accounts").cookie(owner)
        .header("X-Ledger-Id", ledgerId)).andExpect(status().isOk()).andReturn(), "$[0].id");
    long categoryId = jsonLong(mvc.perform(get("/api/categories").cookie(owner)
        .header("X-Ledger-Id", ledgerId)
        .param("kind", "expense")).andExpect(status().isOk()).andReturn(), "$[0].id");

    MvcResult inviteResult = mvc.perform(post("/api/ledgers/" + ledgerId + "/invitations").cookie(owner))
        .andExpect(status().isCreated()).andReturn();
    String token = JsonPath.read(inviteResult.getResponse().getContentAsString(), "$.token");

    when(wechat.exchangeLoginCode("member-code"))
        .thenReturn(new WeChatClient.WeChatIdentity("contract-member"));
    Cookie member = wechatLogin("member-code");
    mvc.perform(post("/api/invitations/accept").cookie(member).contentType(MediaType.APPLICATION_JSON)
            .content("{\"token\":\"" + token + "\"}"))
        .andExpect(status().isOk());

    MvcResult tx = mvc.perform(post("/api/transactions").cookie(member)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"type\":\"expense\",\"amount\":\"5.00\",\"accountId\":"
                + accountId + ",\"categoryId\":" + categoryId + "}"))
        .andExpect(status().isCreated()).andReturn();
    long transactionId = jsonLong(tx, "$.transaction.id");

    mvc.perform(patch("/api/transactions/" + transactionId).cookie(owner)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"amount\":\"6.00\"}"))
        .andExpect(status().isOk());
    mvc.perform(post("/api/ledgers").cookie(owner).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"第二账本\"}"))
        .andExpect(status().isCreated());
    mvc.perform(get("/api/transactions").cookie(owner).header("X-Ledger-Id", ledgerId))
        .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(1));

    mvc.perform(post("/api/accounts/" + accountId + "/archive").cookie(owner)
            .header("X-Ledger-Id", ledgerId)).andExpect(status().isOk());
    mvc.perform(post("/api/transactions").cookie(owner).header("X-Ledger-Id", ledgerId)
            .contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"expense\",\"amount\":\"1.00\",\"accountId\":"
                + accountId + ",\"categoryId\":" + categoryId + "}"))
        .andExpect(status().isConflict());
  }

  @Test
  void categoryRenameIsLedgerScopedAndRejectsInvalidOrArchivedNames() throws Exception {
    Cookie owner = mvc.perform(post("/api/auth/web/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"ledger-owner\",\"password\":\"ledger-owner-password\"}"))
        .andExpect(status().isNoContent()).andReturn().getResponse().getCookie("ledger_session");
    long ledgerId = jsonLong(mvc.perform(get("/api/ledgers").cookie(owner))
        .andExpect(status().isOk()).andReturn(), "$[0].id");
    long categoryId = jsonLong(mvc.perform(post("/api/categories").cookie(owner)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"kind\":\"expense\",\"name\":\"原分类\"}"))
        .andExpect(status().isOk()).andReturn(), "$.id");
    Cookie member = mvc.perform(post("/api/auth/web/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"ledger-member\",\"password\":\"ledger-member-password\"}"))
        .andExpect(status().isNoContent()).andReturn().getResponse().getCookie("ledger_session");
    mvc.perform(patch("/api/categories/" + categoryId).cookie(member)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\" 新分类 \"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("新分类"))
        .andExpect(jsonPath("$.kind").value("expense"));
    mvc.perform(get("/api/categories").cookie(owner).header("X-Ledger-Id", ledgerId)
            .param("kind", "expense"))
        .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == " + categoryId + ")].name").value("新分类"));
    mvc.perform(patch("/api/categories/" + categoryId)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"未登录改名\"}"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("AUTH_REQUIRED"));
    mvc.perform(patch("/api/categories/" + categoryId).cookie(owner)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    mvc.perform(patch("/api/categories/" + categoryId).cookie(owner)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"   \"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));
    mvc.perform(patch("/api/categories/" + categoryId).cookie(owner)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"其他\"}"))
        .andExpect(status().isConflict());
    mvc.perform(post("/api/categories/" + categoryId + "/archive").cookie(owner)
            .header("X-Ledger-Id", ledgerId)).andExpect(status().isOk());
    mvc.perform(patch("/api/categories/" + categoryId).cookie(owner)
            .header("X-Ledger-Id", ledgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"归档后改名\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("CATEGORY_ARCHIVED"));
    mvc.perform(patch("/api/categories/" + categoryId).cookie(owner)
            .header("X-Ledger-Id", ledgerId + 1).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"越界改名\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code").value("SPECIAL_LEDGER_REQUIRED"));
  }

  @Test
  void categoryRenameDoesNotFindCategoryInAnotherLedger() throws Exception {
    when(wechat.exchangeLoginCode("category-owner"))
        .thenReturn(new WeChatClient.WeChatIdentity("category-owner-openid"));
    Cookie owner = wechatLogin("category-owner");
    long firstLedgerId = jsonLong(mvc.perform(post("/api/ledgers").cookie(owner)
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"第一账本\"}"))
        .andExpect(status().isCreated()).andReturn(), "$.id");
    long secondLedgerId = jsonLong(mvc.perform(post("/api/ledgers").cookie(owner)
            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"第二账本\"}"))
        .andExpect(status().isCreated()).andReturn(), "$.id");
    long categoryId = jsonLong(mvc.perform(post("/api/categories").cookie(owner)
            .header("X-Ledger-Id", firstLedgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"kind\":\"expense\",\"name\":\"仅属于第一账本\"}"))
        .andExpect(status().isOk()).andReturn(), "$.id");
    mvc.perform(patch("/api/categories/" + categoryId).cookie(owner)
            .header("X-Ledger-Id", secondLedgerId).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"越界改名\"}"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("CATEGORY_NOT_FOUND"));
  }

  @Test
  void specialWebBindingAndPlatformReadOnlyContractWorks() throws Exception {
    when(wechat.exchangeLoginCode("binding-code"))
        .thenReturn(new WeChatClient.WeChatIdentity("bound-owner"));
    Cookie web = mvc.perform(post("/api/auth/web/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"ledger-owner\",\"password\":\"ledger-owner-password\"}"))
        .andExpect(status().isNoContent()).andReturn().getResponse().getCookie("ledger_session");
    String binding = JsonPath.read(mvc.perform(post("/api/auth/binding-code").cookie(web))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.code");
    Cookie mini = wechatLogin("binding-code");
    mvc.perform(post("/api/auth/web-ledger/import").cookie(mini).contentType(MediaType.APPLICATION_JSON)
            .content("{\"bindingCode\":\"" + binding + "\"}"))
        .andExpect(status().isOk());

    Cookie platform = mvc.perform(post("/api/auth/platform/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"platform-admin\",\"password\":\"platform-admin-password\"}"))
        .andExpect(status().isNoContent()).andReturn().getResponse().getCookie("platform_session");
    mvc.perform(get("/api/platform/ledgers").cookie(platform)).andExpect(status().isOk());
    mvc.perform(post("/api/accounts").cookie(platform).contentType(MediaType.APPLICATION_JSON)
            .content("{\"ledgerId\":1,\"name\":\"禁止\"}"))
        .andExpect(status().isForbidden());
  }

  private Cookie wechatLogin(String code) throws Exception {
    return mvc.perform(post("/api/auth/wechat/login").contentType(MediaType.APPLICATION_JSON)
            .content("{\"code\":\"" + code + "\"}"))
        .andExpect(status().isOk()).andReturn().getResponse().getCookie("ledger_session");
  }

  private long jsonLong(MvcResult result, String path) throws Exception {
    Number value = JsonPath.read(result.getResponse().getContentAsString(), path);
    return value.longValue();
  }
}
