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
    return db.queryForList("SELECT id, kind, name, icon_key, archived, created_at FROM category "
            + "WHERE ledger_id = ? AND kind = ? ORDER BY id", context.ledgerId(), kind)
        .stream().map(this::toLedgerRow).toList();
  }

  public Map<String, Object> upsert(LedgerContext context, String kind, String name) {
    String normalized = requiredName(name);
    List<Map<String, Object>> existing = db.queryForList(
        "SELECT id, kind, name, icon_key, archived, created_at FROM category "
            + "WHERE ledger_id = ? AND kind = ? AND name = ?",
        context.ledgerId(), kind, normalized);
    if (!existing.isEmpty()) {
      if (Row.intOrNull(existing.get(0), "archived") != null
          && Row.intOrNull(existing.get(0), "archived") == 1) {
        throw ApiException.conflict("CATEGORY_ARCHIVED", "分类已归档，不能用于新记录");
      }
      return toLedgerRow(existing.get(0));
    }
    String iconKey = CategoryIconDictionary.lookup(normalized);
    long id = Db.insert(db, "INSERT INTO category (ledger_id, kind, name, icon_key, archived, created_at) "
            + "VALUES (?, ?, ?, ?, 0, ?)",
        context.ledgerId(), kind, normalized, iconKey, Time.now());
    return toLedgerRow(db.queryForMap(
        "SELECT id, kind, name, icon_key, archived, created_at FROM category "
            + "WHERE id = ? AND ledger_id = ?", id, context.ledgerId()));
  }

  public Map<String, Object> ensureDefault(LedgerContext context, String kind) {
    return upsert(context, kind, "expense".equals(kind) ? "其他" : "其他收入");
  }

  public Map<String, Object> rename(LedgerContext context, long id, String name) {
    Map<String, Object> row = getLedgerRow(context, id);
    if (Row.intOrNull(row, "archived") != null && Row.intOrNull(row, "archived") == 1) {
      throw ApiException.conflict("CATEGORY_ARCHIVED", "分类已归档");
    }
    String normalized = requiredName(name);
    if (!db.queryForList("SELECT id FROM category WHERE ledger_id = ? AND kind = ? AND name = ? AND id <> ?",
        context.ledgerId(), Row.str(row, "kind"), normalized, id).isEmpty()) {
      throw ApiException.conflict("CATEGORY_NAME_EXISTS", "分类名称已存在");
    }
    // 改名后重算 icon_key：语义变了图标跟着变比保持不一致更好
    String iconKey = CategoryIconDictionary.lookup(normalized);
    db.update("UPDATE category SET name = ?, icon_key = ? WHERE id = ? AND ledger_id = ?",
        normalized, iconKey, id, context.ledgerId());
    return toLedgerRow(getLedgerRow(context, id));
  }

  public Map<String, Object> getForEntry(LedgerContext context, long id) {
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id, kind, name, icon_key, archived, created_at FROM category "
            + "WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
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

  /**
   * 启动时回填：把所有 icon_key 为 NULL 的分类按名称查词典补一遍。
   * 仅写 NULL 行，幂等。已填过的行不动（防止覆盖任何已经显式设置过的值）。
   */
  public int backfillIcons() {
    return db.update("UPDATE category SET icon_key = ? WHERE icon_key IS NULL",
        CategoryIconDictionary.DEFAULT_KEY);
  }

  /**
   * 启动时智能回填：按真实 name 走词典匹配，能命中具体图标的就不给 'other'。
   * 仅处理 NULL 行，幂等。
   */
  public int backfillIconsByName() {
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id, name FROM category WHERE icon_key IS NULL");
    int updated = 0;
    for (Map<String, Object> row : rows) {
      String name = Row.str(row, "name");
      String key = CategoryIconDictionary.lookup(name);
      if (!CategoryIconDictionary.DEFAULT_KEY.equals(key)) {
        db.update("UPDATE category SET icon_key = ? WHERE id = ? AND icon_key IS NULL",
            key, Row.lng(row, "id"));
        updated++;
      }
    }
    // 剩下的 NULL 行再统一补 'other'
    updated += backfillIcons();
    return updated;
  }

  private Map<String, Object> getLedgerRow(LedgerContext context, long id) {
    List<Map<String, Object>> rows = db.queryForList(
        "SELECT id, kind, name, icon_key, archived, created_at FROM category "
            + "WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
    if (rows.isEmpty()) throw ApiException.notFound("CATEGORY_NOT_FOUND", "分类不存在");
    return rows.get(0);
  }

  private Map<String, Object> toLedgerRow(Map<String, Object> r) {
    Map<String, Object> out = toRow(r);
    out.put("archived", Row.intOrNull(r, "archived"));
    // icon_key 缺失时兜底返回 'other'，避免前端收到 null
    out.put("icon_key", CategoryIconDictionary.resolve(Row.str(r, "icon_key")));
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