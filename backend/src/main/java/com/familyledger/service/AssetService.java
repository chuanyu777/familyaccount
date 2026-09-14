package com.familyledger.service;

import com.familyledger.common.ApiException;
import com.familyledger.common.Db;
import com.familyledger.common.Money;
import com.familyledger.common.MonthUtil;
import com.familyledger.common.Row;
import com.familyledger.common.Time;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 资产项 + 市值快照。 */
@Service
public class AssetService {
  private final JdbcTemplate db;
  private final MemberService members;

  public AssetService(JdbcTemplate db, MemberService members) {
    this.db = db;
    this.members = members;
  }

  // ---------- 资产项 ----------

  private Map<String, Object> toRow(Map<String, Object> r) {
    long valueCents = Row.lng(r, "value_cents");
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", Row.lng(r, "id"));
    m.put("name", Row.str(r, "name"));
    m.put("value_cents", valueCents);
    m.put("kind", Row.str(r, "kind"));
    m.put("member_id", Row.lngOrNull(r, "member_id"));
    m.put("updated_at", Row.str(r, "updated_at"));
    m.put("updated_by_member_id", Row.lngOrNull(r, "updated_by_member_id"));
    m.put("value", Money.toYuanString(valueCents));
    return m;
  }

  public List<Map<String, Object>> list() {
    return db.queryForList(
        "SELECT id, name, value_cents, kind, member_id, updated_at, updated_by_member_id "
            + "FROM asset ORDER BY id")
        .stream().map(this::toRow).toList();
  }

  public Map<String, Object> get(long id) {
    return toRow(fetch(id));
  }

  private Map<String, Object> fetch(long id) {
    List<Map<String, Object>> r = db.queryForList(
        "SELECT id, name, value_cents, kind, member_id, updated_at, updated_by_member_id "
            + "FROM asset WHERE id = ?", id);
    if (r.isEmpty()) throw ApiException.notFound("ASSET_NOT_FOUND", "资产项不存在");
    return r.get(0);
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

  public Map<String, Object> create(Map<String, Object> input) {
    if (input.get("name") == null) throw ApiException.badRequest("VALIDATION_FAILED", "资产名称不能为空");
    String name = String.valueOf(input.get("name")).trim();
    if (name.isEmpty()) throw ApiException.badRequest("VALIDATION_FAILED", "资产名称不能为空");
    long valueCents = input.get("value") == null ? 0 : parseValueCents(input.get("value"));
    String kind = input.get("kind") == null ? "其他" : String.valueOf(input.get("kind")).trim();
    if (kind.isEmpty()) kind = "其他";
    Long memberId = input.get("memberId") == null ? null : ((Number) input.get("memberId")).longValue();
    if (memberId != null && !members.exists(memberId)) {
      throw ApiException.notFound("MEMBER_NOT_FOUND", "成员不存在");
    }
    long id = Db.insert(db,
        "INSERT INTO asset (name, value_cents, kind, member_id, updated_at) VALUES (?, ?, ?, ?, ?)",
        name, valueCents, kind, memberId, Time.now());
    upsertSnapshot(id, MonthUtil.currentMonth(), Money.toYuanString(valueCents), "建项", null);
    return get(id);
  }

  public Map<String, Object> update(long id, Map<String, Object> patch) {
    if (!exists(id)) throw ApiException.notFound("ASSET_NOT_FOUND", "资产项不存在");
    if (patch.containsKey("name")) {
      String n = String.valueOf(patch.get("name")).trim();
      if (n.isEmpty()) throw ApiException.badRequest("VALIDATION_FAILED", "资产名称不能为空");
      db.update("UPDATE asset SET name = ? WHERE id = ?", n, id);
    }
    if (patch.containsKey("kind")) {
      String k = String.valueOf(patch.get("kind")).trim();
      if (k.isEmpty()) k = "其他";
      db.update("UPDATE asset SET kind = ? WHERE id = ?", k, id);
    }
    if (patch.containsKey("memberId")) {
      Object mv = patch.get("memberId");
      if (mv != null) {
        long mid = ((Number) mv).longValue();
        if (!members.exists(mid)) throw ApiException.notFound("MEMBER_NOT_FOUND", "成员不存在");
        db.update("UPDATE asset SET member_id = ? WHERE id = ?", mid, id);
      } else {
        db.update("UPDATE asset SET member_id = NULL WHERE id = ?", id);
      }
    }
    if (patch.containsKey("value")) {
      long valueCents = parseValueCents(patch.get("value"));
      db.update("UPDATE asset SET value_cents = ?, updated_at = ? WHERE id = ?",
          valueCents, Time.now(), id);
      upsertSnapshot(id, MonthUtil.currentMonth(), Money.toYuanString(valueCents), null, null);
    }
    return get(id);
  }

  public void delete(long id) {
    if (!exists(id)) throw ApiException.notFound("ASSET_NOT_FOUND", "资产项不存在");
    db.update("DELETE FROM asset WHERE id = ?", id);
  }

  private boolean exists(long id) {
    Long n = db.queryForObject("SELECT COUNT(*) FROM asset WHERE id = ?", Long.class, id);
    return n != null && n > 0;
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

  public Map<String, Object> upsertSnapshot(long assetId, String month, Object value, String note,
      Object updatedByMemberId) {
    fetch(assetId); // 校验存在
    String m = assertMonth(month);
    long valueCents = parseValueCents(value);
    String n = note == null ? null : note.trim().isEmpty() ? null : note.trim();

    List<Map<String, Object>> existing = db.queryForList(
        "SELECT id FROM asset_snapshot WHERE asset_id = ? AND snap_month = ?", assetId, m);
    if (existing.isEmpty()) {
      db.update("INSERT INTO asset_snapshot (asset_id, snap_month, value_cents, note, recorded_at) "
          + "VALUES (?, ?, ?, ?, ?)", assetId, m, valueCents, n, Time.now());
    } else {
      db.update("UPDATE asset_snapshot SET value_cents = ?, note = ?, recorded_at = ? WHERE id = ?",
          valueCents, n, Time.now(), Row.lng(existing.get(0), "id"));
    }

    if (m.equals(MonthUtil.currentMonth())) {
      db.update("UPDATE asset SET value_cents = ?, updated_at = ? WHERE id = ?",
          valueCents, Time.now(), assetId);
    }

    return snapshotRow(db.queryForMap(
        "SELECT id, asset_id, snap_month, value_cents, note, recorded_at FROM asset_snapshot "
            + "WHERE asset_id = ? AND snap_month = ?", assetId, m));
  }

  public List<Map<String, Object>> listSnapshots(long assetId) {
    fetch(assetId);
    return db.queryForList(
        "SELECT id, asset_id, snap_month, value_cents, note, recorded_at FROM asset_snapshot "
            + "WHERE asset_id = ? ORDER BY snap_month DESC, id DESC", assetId)
        .stream().map(this::snapshotRow).toList();
  }

  public void deleteSnapshot(long id) {
    Long n = db.queryForObject("SELECT COUNT(*) FROM asset_snapshot WHERE id = ?", Long.class, id);
    if (n == null || n == 0) throw ApiException.notFound("SNAPSHOT_NOT_FOUND", "快照不存在");
    db.update("DELETE FROM asset_snapshot WHERE id = ?", id);
  }

  /** 各项资产在指定月份的期末市值。 */
  public List<Map<String, Object>> assetValuesAtMonth(String month) {
    assertMonth(month);
    List<Map<String, Object>> assets = db.queryForList("SELECT id, value_cents FROM asset ORDER BY id");
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> a : assets) {
      long assetId = Row.lng(a, "id");
      List<Map<String, Object>> hit = db.queryForList(
          "SELECT value_cents FROM asset_snapshot WHERE asset_id = ? AND snap_month <= ? "
              + "ORDER BY snap_month DESC, id DESC LIMIT 1", assetId, month);
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("asset_id", assetId);
      if (!hit.isEmpty()) {
        m.put("cents", Row.lng(hit.get(0), "value_cents"));
        m.put("source", "snapshot");
      } else {
        m.put("cents", Row.lng(a, "value_cents"));
        m.put("source", "current");
      }
      out.add(m);
    }
    return out;
  }

  public long assetsTotalAtMonth(String month) {
    return assetValuesAtMonth(month).stream().mapToLong(v -> Row.lng(v, "cents")).sum();
  }
}
