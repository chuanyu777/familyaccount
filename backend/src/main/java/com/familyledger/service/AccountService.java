package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 资金账户。 */
@Service
public class AccountService {
  private final JdbcTemplate db;
  private final MemberService members;

  public AccountService(JdbcTemplate db, MemberService members) {
    this.db = db;
    this.members = members;
  }

  private Map<String, Object> toRow(Map<String, Object> r) {
    Map<String, Object> m = new LinkedHashMap<>();
    long balanceCents = Row.lng(r, "balance_cents");
    m.put("id", Row.lng(r, "id"));
    m.put("name", Row.str(r, "name"));
    m.put("balance_cents", balanceCents);
    m.put("member_id", Row.lngOrNull(r, "member_id"));
    m.put("is_default", Row.intOrNull(r, "is_default"));
    m.put("created_at", Row.str(r, "created_at"));
    m.put("balance", Money.toYuanString(balanceCents));
    return m;
  }

  public List<Map<String, Object>> list() {
    return db.queryForList(
        "SELECT id, name, balance_cents, member_id, is_default, created_at FROM account ORDER BY id")
        .stream().map(this::toRow).toList();
  }

  public Map<String, Object> get(long id) {
    return toRow(fetch(id));
  }

  private Map<String, Object> fetch(long id) {
    List<Map<String, Object>> r = db.queryForList(
        "SELECT id, name, balance_cents, member_id, is_default, created_at FROM account WHERE id = ?", id);
    if (r.isEmpty()) throw ApiException.notFound("ACCOUNT_NOT_FOUND", "账户 " + id + " 不存在");
    return r.get(0);
  }

  public Map<String, Object> create(String name, Long memberId) {
    String n = name.trim();
    if (n.isEmpty()) throw ApiException.badRequest("VALIDATION_FAILED", "账户名称不能为空");
    if (memberId != null && !members.exists(memberId)) {
      throw ApiException.notFound("MEMBER_NOT_FOUND", "成员 " + memberId + " 不存在");
    }
    long id = Db.insert(db, "INSERT INTO account (name, balance_cents, member_id, created_at) VALUES (?, 0, ?, ?)",
        n, memberId, Time.now());
    return get(id);
  }

  public Map<String, Object> update(long id, Map<String, Object> patch) {
    if (!exists(id)) throw ApiException.notFound("ACCOUNT_NOT_FOUND", "账户 " + id + " 不存在");
    if (patch.containsKey("name")) {
      String n = String.valueOf(patch.get("name")).trim();
      if (n.isEmpty()) throw ApiException.badRequest("VALIDATION_FAILED", "账户名称不能为空");
      db.update("UPDATE account SET name = ? WHERE id = ?", n, id);
    }
    if (patch.containsKey("memberId")) {
      Object mv = patch.get("memberId");
      if (mv != null) {
        long mid = ((Number) mv).longValue();
        if (!members.exists(mid)) {
          throw ApiException.notFound("MEMBER_NOT_FOUND", "成员 " + mid + " 不存在");
        }
        db.update("UPDATE account SET member_id = ? WHERE id = ?", mid, id);
      } else {
        db.update("UPDATE account SET member_id = NULL WHERE id = ?", id);
      }
    }
    return get(id);
  }

  @Transactional
  public void setDefault(long id) {
    if (!exists(id)) throw ApiException.notFound("ACCOUNT_NOT_FOUND", "账户 " + id + " 不存在");
    db.update("UPDATE account SET is_default = 0");
    db.update("UPDATE account SET is_default = 1 WHERE id = ?", id);
    Long n = db.queryForObject("SELECT COUNT(*) FROM account WHERE is_default = 1", Long.class);
    if (n == null || n != 1) {
      throw new ApiException(500, "INTERNAL", "切换默认账户后存在多个默认账户");
    }
  }

  public Map<String, Object> calibrate(long id, long cents) {
    if (!exists(id)) throw ApiException.notFound("ACCOUNT_NOT_FOUND", "账户 " + id + " 不存在");
    db.update("UPDATE account SET balance_cents = ? WHERE id = ?", cents, id);
    return get(id);
  }

  /** 余额增减：唯一入口，其它服务（账目/还款/负债）都走这里，绝不直接 UPDATE account。 */
  public void applyBalanceDelta(long id, long cents) {
    db.update("UPDATE account SET balance_cents = balance_cents + ? WHERE id = ?", cents, id);
  }

  public long countTransactions(long accountId) {
    Long n = db.queryForObject(
        "SELECT COUNT(*) FROM txn WHERE account_id = ? OR to_account_id = ?", Long.class,
        accountId, accountId);
    return n == null ? 0 : n;
  }

  public void delete(long id) {
    if (!exists(id)) throw ApiException.notFound("ACCOUNT_NOT_FOUND", "账户 " + id + " 不存在");
    long n = countTransactions(id);
    if (n > 0) {
      throw ApiException.conflict("ACCOUNT_IN_USE", "账户 " + id + " 已关联 " + n + " 笔交易，无法删除");
    }
    db.update("DELETE FROM account WHERE id = ?", id);
  }

  public boolean exists(long id) {
    Long n = db.queryForObject("SELECT COUNT(*) FROM account WHERE id = ?", Long.class, id);
    return n != null && n > 0;
  }

  /** 默认账户 id，不存在返回 null。 */
  public Long defaultAccountId() {
    List<Map<String, Object>> r = db.queryForList("SELECT id FROM account WHERE is_default = 1");
    return r.isEmpty() ? null : Row.lng(r.get(0), "id");
  }
}
