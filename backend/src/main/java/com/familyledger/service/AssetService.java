package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.MonthUtil;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import com.familyledger.auth.AuthPrincipal;
import com.familyledger.ledger.LedgerAuthorization;
import com.familyledger.ledger.LedgerContext;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 资产项 + 市值快照。 */
@Service
public class AssetService {
  private final JdbcTemplate db;
  private final LedgerAuthorization authorization;

  public AssetService(JdbcTemplate db, LedgerAuthorization authorization) {
    this.db = db;
    this.authorization = authorization;
  }

  public List<Map<String, Object>> list(LedgerContext context) {
    return db.queryForList("SELECT id, name, value_cents, kind, archived, updated_at FROM asset "
            + "WHERE ledger_id = ? ORDER BY id", context.ledgerId())
        .stream().map(this::toLedgerRow).toList();
  }

  public Map<String, Object> get(LedgerContext context, long id) { return toLedgerRow(fetchLedger(context, id)); }

  @Transactional
  public Map<String, Object> create(LedgerContext context, Map<String, Object> input) {
    String name = requiredName(input.get("name"));
    long value = input.get("value") == null ? 0 : parseValueCents(input.get("value"));
    String kind = input.get("kind") == null ? "其他" : String.valueOf(input.get("kind")).trim();
    if (kind.isEmpty()) kind = "其他";
    long id = Db.insert(db, "INSERT INTO asset (ledger_id, name, value_cents, kind, archived, updated_at) "
        + "VALUES (?, ?, ?, ?, 0, ?)", context.ledgerId(), name, value, kind, Time.now());
    upsertSnapshot(context, id, MonthUtil.currentMonth(), Money.toYuanString(value), "建项");
    return get(context, id);
  }

  @Transactional
  public Map<String, Object> update(LedgerContext context, long id, Map<String, Object> patch) {
    fetchLedger(context, id);
    if (patch.containsKey("name")) db.update("UPDATE asset SET name = ? WHERE id = ? AND ledger_id = ?",
        requiredName(patch.get("name")), id, context.ledgerId());
    if (patch.containsKey("kind")) db.update("UPDATE asset SET kind = ? WHERE id = ? AND ledger_id = ?",
        String.valueOf(patch.get("kind")), id, context.ledgerId());
    if (patch.containsKey("value")) {
      long value = parseValueCents(patch.get("value"));
      db.update("UPDATE asset SET value_cents = ?, updated_at = ? WHERE id = ? AND ledger_id = ?",
          value, Time.now(), id, context.ledgerId());
      upsertSnapshot(context, id, MonthUtil.currentMonth(), Money.toYuanString(value), null);
    }
    return get(context, id);
  }

  public void archive(LedgerContext context, long id) {
    authorization.requireOwner(AuthPrincipal.ledgerUser(context.userId()), context.ledgerId());
    fetchLedger(context, id);
    db.update("UPDATE asset SET archived = 1 WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
  }

  public void restore(LedgerContext context, long id) {
    authorization.requireOwner(AuthPrincipal.ledgerUser(context.userId()), context.ledgerId());
    fetchLedger(context, id);
    db.update("UPDATE asset SET archived = 0 WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
  }

  public Map<String, Object> getForSnapshot(LedgerContext context, long id) {
    Map<String, Object> row = fetchLedger(context, id);
    if (Row.intOrNull(row, "archived") != null && Row.intOrNull(row, "archived") == 1) {
      throw ApiException.conflict("ASSET_ARCHIVED", "资产已归档");
    }
    return toLedgerRow(row);
  }

  @Transactional
  public Map<String, Object> upsertSnapshot(LedgerContext context, long assetId, String month,
      Object value, String note) {
    getForSnapshot(context, assetId);
    String m = assertMonth(month);
    long cents = parseValueCents(value);
    List<Map<String, Object>> existing = db.queryForList("SELECT id FROM asset_snapshot "
        + "WHERE ledger_id = ? AND asset_id = ? AND snap_month = ?", context.ledgerId(), assetId, m);
    if (existing.isEmpty()) db.update("INSERT INTO asset_snapshot "
        + "(ledger_id, asset_id, snap_month, value_cents, note, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
        context.ledgerId(), assetId, m, cents, note, Time.now());
    else db.update("UPDATE asset_snapshot SET value_cents = ?, note = ?, recorded_at = ? "
        + "WHERE id = ? AND ledger_id = ?", cents, note, Time.now(), Row.lng(existing.get(0), "id"), context.ledgerId());
    if (m.equals(MonthUtil.currentMonth())) db.update("UPDATE asset SET value_cents = ?, updated_at = ? "
        + "WHERE id = ? AND ledger_id = ?", cents, Time.now(), assetId, context.ledgerId());
    return snapshotRow(db.queryForMap("SELECT id, asset_id, snap_month, value_cents, note, recorded_at "
        + "FROM asset_snapshot WHERE id = (SELECT MAX(id) FROM asset_snapshot WHERE ledger_id = ? AND asset_id = ? AND snap_month = ?)",
        context.ledgerId(), assetId, m));
  }

  public List<Map<String, Object>> listSnapshots(LedgerContext context, long assetId) {
    get(context, assetId);
    return db.queryForList("SELECT id, asset_id, snap_month, value_cents, note, recorded_at FROM asset_snapshot "
        + "WHERE ledger_id = ? AND asset_id = ? ORDER BY snap_month DESC, id DESC", context.ledgerId(), assetId)
        .stream().map(this::snapshotRow).toList();
  }

  public List<Map<String, Object>> assetValuesAtMonth(LedgerContext context, String month) {
    assertMonth(month);
    List<Map<String, Object>> assets = db.queryForList("SELECT id, value_cents FROM asset WHERE ledger_id = ?", context.ledgerId());
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> asset : assets) {
      long id = Row.lng(asset, "id");
      List<Map<String, Object>> snapshot = db.queryForList("SELECT value_cents FROM asset_snapshot "
          + "WHERE ledger_id = ? AND asset_id = ? AND snap_month <= ? ORDER BY snap_month DESC, id DESC LIMIT 1",
          context.ledgerId(), id, month);
      Map<String, Object> row = new LinkedHashMap<>(); row.put("asset_id", id);
      row.put("cents", snapshot.isEmpty() ? Row.lng(asset, "value_cents") : Row.lng(snapshot.get(0), "value_cents"));
      row.put("source", snapshot.isEmpty() ? "current" : "snapshot"); out.add(row);
    }
    return out;
  }

  public long assetsTotalAtMonth(LedgerContext context, String month) {
    return assetValuesAtMonth(context, month).stream().mapToLong(v -> Row.lng(v, "cents")).sum();
  }

  private Map<String, Object> fetchLedger(LedgerContext context, long id) {
    List<Map<String, Object>> rows = db.queryForList("SELECT id, name, value_cents, kind, archived, updated_at "
        + "FROM asset WHERE id = ? AND ledger_id = ?", id, context.ledgerId());
    if (rows.isEmpty()) throw ApiException.notFound("ASSET_NOT_FOUND", "资产项不存在");
    return rows.get(0);
  }

  private Map<String, Object> toLedgerRow(Map<String, Object> r) {
    Map<String, Object> out = new LinkedHashMap<>(); long value = Row.lng(r, "value_cents");
    out.put("id", Row.lng(r, "id")); out.put("name", Row.str(r, "name")); out.put("valueCents", value);
    out.put("value", Money.toYuanString(value)); out.put("kind", Row.str(r, "kind"));
    out.put("archived", Row.intOrNull(r, "archived")); out.put("updatedAt", Row.str(r, "updated_at")); return out;
  }

  private static String requiredName(Object value) {
    if (value == null || String.valueOf(value).trim().isEmpty()) {
      throw ApiException.badRequest("VALIDATION_FAILED", "资产名称不能为空");
    }
    return String.valueOf(value).trim();
  }

  private static long parseValueCents(Object value) {
    long cents;
    try {
      cents = Money.toCents(value);
    } catch (IllegalArgumentException e) {
      throw ApiException.badRequest("VALIDATION_FAILED", "金额格式非法");
    }
    if (cents < 0) throw ApiException.badRequest("VALIDATION_FAILED", "当前市值不能为负");
    return cents;
  }

  // ---------- 市值快照 ----------

  private String assertMonth(String month) {
    if (!MonthUtil.isValidMonth(month)) {
      throw ApiException.badRequest("VALIDATION_FAILED", "月份需为 YYYY-MM");
    }
    if (month.compareTo(MonthUtil.currentMonth()) > 0) {
      throw ApiException.badRequest("FUTURE_MONTH", "不能记录未来月份的市值");
    }
    return month;
  }

  private Map<String, Object> snapshotRow(Map<String, Object> r) {
    long valueCents = Row.lng(r, "value_cents");
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", Row.lng(r, "id"));
    m.put("asset_id", Row.lng(r, "asset_id"));
    m.put("month", Row.str(r, "snap_month"));
    m.put("value_cents", valueCents);
    m.put("note", Row.strOrNull(r, "note"));
    m.put("recorded_at", Row.str(r, "recorded_at"));
    m.put("value", Money.toYuanString(valueCents));
    return m;
  }

}
