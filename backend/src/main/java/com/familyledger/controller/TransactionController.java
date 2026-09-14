package com.familyledger.controller;

import com.familyledger.common.ApiException;
import com.familyledger.common.Params;
import com.familyledger.service.LedgerQueryService;
import com.familyledger.service.LedgerService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/transactions")
public class TransactionController {
  private final LedgerService ledger;
  private final LedgerQueryService query;

  public TransactionController(LedgerService ledger, LedgerQueryService query) {
    this.ledger = ledger;
    this.query = query;
  }

  @GetMapping
  public Map<String, Object> list(
      @RequestParam(value = "month", required = false) String month,
      @RequestParam(value = "type", required = false) String type,
      @RequestParam(value = "accountId", required = false) String accountId,
      @RequestParam(value = "memberId", required = false) String memberId,
      @RequestParam(value = "page", required = false) String page,
      @RequestParam(value = "pageSize", required = false) String pageSize) {
    String m = month == null ? null : Params.parseMonth(month, "month");
    String t = type == null ? null : Params.parseEnum(type, "type", "expense", "income", "transfer");
    Long aid = Params.parseLongPositive(accountId, "accountId");
    Long mid = Params.parseLongPositive(memberId, "memberId");
    Integer p = Params.parseIntPositive(page, "page");
    Integer ps = Params.parseIntPositive(pageSize, "pageSize");
    return query.list(m, t, aid, mid, p, ps);
  }

  @PostMapping
  public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
    requireType(body);
    if (!body.containsKey("amount")) {
      throw ApiException.badRequest("VALIDATION_FAILED", "金额不能为空");
    }
    return ResponseEntity.status(HttpStatus.CREATED).body(ledger.createTransaction(body));
  }

  @GetMapping("/{id}")
  public Map<String, Object> get(@PathVariable("id") Object id) {
    return query.get(Params.parseId(id));
  }

  @PatchMapping("/{id}")
  public Map<String, Object> update(@PathVariable("id") Object id, @RequestBody Map<String, Object> body) {
    if (body.containsKey("type")) requireType(body);
    return ledger.updateTransaction(Params.parseId(id), body);
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(@PathVariable("id") Object id) {
    ledger.deleteTransaction(Params.parseId(id));
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("ok", true);
    return m;
  }

  private void requireType(Map<String, Object> body) {
    Params.parseEnum(body.get("type"), "type", "expense", "income", "transfer");
  }
}
