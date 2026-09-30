package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 收支分类。 */
@Service
public class CategoryService {
  private final JdbcTemplate db;
  private final LedgerAuthorization authorization;

  public CategoryService(JdbcTemplate db, LedgerAuthorization authorization) {
    this.db = db;
    this.authorization = authorization;
  }

  public List<Map<String, Object>> list(LedgerContext context, String kind) {
    return db.queryForList("SELECT id, kind, name, archived, created_at FROM category "
            + "WHERE ledger_id = ? AND kind = ? ORDER BY id", context.ledgerId(), kind)
        .stream().map(this::toLedgerRow).toList();
  }

  public Map<String, Object> upsert(LedgerContext context, String kind, String name) {
    String normalized = requiredName(name);
    List<Map<String, Object>> existing = db.queryForList("SELECT id, kind, name, archived, created_at "
        + "FROM category WHERE ledger_id = ? AND kind = ? AND name = ?", context.ledgerId(), kind, normalized);
    if (!existing.isEmpty()) {
      if (Row.intOrNull(existing.get(0), "archived") != null
          && Row.intOrNull(existing.get(0), "archived") == 1) {
        throw ApiException.conflict("CATEGORY_ARCHIVED", "分类已归档，不能用于新记录");
      }
      return toLedgerRow(existing.get(0));
    }
    long id = Db.insert(db, "INSERT INTO category (ledger_id, kind, name, archived, created_at) "
        + "VALUES (?, ?, ?, 0, ?)", context.ledgerId(), kind, normalized, Time.now());
    return toLedgerRow(db.queryForMap("SELECT id, kind, name, archived, created_at FROM category "
        + "WHERE id = ? AND ledger_id = ?", id, context.ledgerId()));
  }

  public Map<String, Object> ensureDefault(LedgerContext context, String kind) {
    return upsert(context, kind, "expense".equals(kind) ? "其他" : "其他收入");
  }

  public Map<String, Object> getForEntry(LedgerContext context, long id) {
    List<Map<String, Object>> rows = db.queryForList("SELECT id, kind, name, archived, created_at "
        + "FROM category WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
    if (rows.isEmpty()) throw ApiException.notFound("CATEGORY_NOT_FOUND", "分类不存在");
    Map<String, Object> row = rows.get(0);
    if (Row.intOrNull(row, "archived") != null && Row.intOrNull(row, "archived") == 1) {
      throw ApiException.conflict("CATEGORY_ARCHIVED", "分类已归档");
    }
    return toLedgerRow(row);
  }

  public void archive(LedgerContext context, long id) {
    authorization.requireOwner(AuthPrincipal.ledgerUser(context.userId()), context.ledgerId());
    getLedgerRow(context, id);
    db.update("UPDATE category SET archived = 1 WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
  }

  public void restore(LedgerContext context, long id) {
    authorization.requireOwner(AuthPrincipal.ledgerUser(context.userId()), context.ledgerId());
    getLedgerRow(context, id);
    db.update("UPDATE category SET archived = 0 WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
  }

  private Map<String, Object> getLedgerRow(LedgerContext context, long id) {
    List<Map<String, Object>> rows = db.queryForList("SELECT id, kind, name, archived, created_at "
        + "FROM category WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
    if (rows.isEmpty()) throw ApiException.notFound("CATEGORY_NOT_FOUND", "分类不存在");
    return rows.get(0);
  }

  private Map<String, Object> toLedgerRow(Map<String, Object> r) {
    Map<String, Object> out = toRow(r);
    out.put("archived", Row.intOrNull(r, "archived"));
    return out;
  }

  private static String requiredName(String name) {
    if (name == null || name.trim().isEmpty()) {
      throw ApiException.badRequest("VALIDATION_FAILED", "分类名称不能为空");
    }
    return name.trim();
  }

  private Map<String, Object> toRow(Map<String, Object> r) {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", Row.lng(r, "id"));
    m.put("kind", Row.str(r, "kind"));
    m.put("name", Row.str(r, "name"));
    m.put("created_at", Row.str(r, "created_at"));
    return m;
  }

}
