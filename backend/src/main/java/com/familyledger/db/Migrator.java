package com.familyledger.db;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.familyledger.common.Time;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 版本化数据库迁移：启动时按版本号顺序执行 db/migration/V{n}__{描述}.sql，执行记录写入
 * schema_migration 表，保证「每个脚本只跑一次」。
 *
 * <p>设计取舍：不引入 Flyway，保持与项目现有 JdbcTemplate 风格一致，同时脚本对 MySQL 与 H2
 * 都保持兼容（测试库是 H2）。
 */
@Component
public class Migrator {
  /** V1 是基线锚点，只登记不执行；真正的变更从 V2 开始。 */
  public static final long BASELINE_VERSION = 1L;

  private static final String LOCATION = "classpath*:db/migration/V*.sql";
  private static final Pattern FILE_NAME = Pattern.compile("^V(\\d+)__(.+)\\.sql$");

  private final JdbcTemplate db;

  public Migrator(JdbcTemplate db) {
    this.db = db;
  }

  /** 启动入口：建历史表 → 必要时补登记基线 → 执行未应用的脚本 → 校验已有脚本未被篡改。 */
  public void migrate() {
    ensureHistoryTable();
    TreeMap<Long, Script> scripts = loadScripts();
    if (scripts.isEmpty()) return;

    Map<Long, String> applied = appliedChecksums();
    if (applied.isEmpty()) {
      adoptBaseline(scripts);
      applied = appliedChecksums();
    }

    for (Script s : scripts.values()) {
      String recorded = applied.get(s.version);
      if (recorded == null) {
        applyScript(s.version, s.name, s.content);
      } else if (!recorded.equals(checksum(s.content))) {
        throw new IllegalStateException(
            "迁移脚本已被修改，拒绝启动：V" + s.version + "__" + s.name
                + "（已应用过的脚本不能编辑，请新增更高版本的脚本来修正）");
      }
    }
  }

  /** 执行单个脚本（供测试与特殊场景调用）。 */
  public void applyScript(long version, String name, String content) {
    long start = System.currentTimeMillis();
    List<String> statements = splitStatements(content);
    for (String sql : statements) {
      db.execute(sql);
    }
    long cost = System.currentTimeMillis() - start;
    db.update(
        "INSERT INTO schema_migration (version, name, checksum, applied_at, execution_ms) "
            + "VALUES (?, ?, ?, ?, ?)",
        version, name, checksum(content), Time.now(), cost);
    System.out.printf("[migrate] 已应用 V%d__%s（%d 条语句，%d ms）%n",
        version, name, statements.size(), cost);
  }

  // ---------- 内部实现 ----------

  private void ensureHistoryTable() {
    db.execute(
        "CREATE TABLE IF NOT EXISTS schema_migration ("
            + "version      BIGINT       NOT NULL PRIMARY KEY,"
            + "name         VARCHAR(200) NOT NULL,"
            + "checksum     VARCHAR(64)  NOT NULL,"
            + "applied_at   VARCHAR(19)  NOT NULL,"
            + "execution_ms BIGINT       NOT NULL DEFAULT 0"
            + ")");
  }

  /** 首次接入迁移器时，把 <= 基线版本 的脚本直接登记为已应用（schema.sql 已经建好这些表）。 */
  private void adoptBaseline(TreeMap<Long, Script> scripts) {
    for (Script s : scripts.values()) {
      if (s.version <= BASELINE_VERSION) {
        db.update(
            "INSERT INTO schema_migration (version, name, checksum, applied_at, execution_ms) "
                + "VALUES (?, ?, ?, ?, 0)",
            s.version, s.name, checksum(s.content), Time.now());
        System.out.printf("[migrate] 基线登记 V%d__%s（不执行）%n", s.version, s.name);
      }
    }
  }

  private Map<Long, String> appliedChecksums() {
    Map<Long, String> out = new java.util.LinkedHashMap<>();
    db.query(
        "SELECT version, checksum FROM schema_migration ORDER BY version",
        rs -> {
          out.put(rs.getLong("version"), rs.getString("checksum"));
        });
    return out;
  }

  private TreeMap<Long, Script> loadScripts() {
    TreeMap<Long, Script> out = new TreeMap<>(Comparator.naturalOrder());
    try {
      Resource[] resources =
          new PathMatchingResourcePatternResolver().getResources(LOCATION);
      for (Resource r : resources) {
        String file = r.getFilename();
        if (file == null) continue;
        Matcher m = FILE_NAME.matcher(file);
        if (!m.matches()) {
          throw new IllegalStateException("迁移脚本命名不合法（应为 V2__说明.sql）：" + file);
        }
        long version = Long.parseLong(m.group(1));
        String name = m.group(2);
        if (out.containsKey(version)) {
          throw new IllegalStateException("迁移版本号重复：V" + version);
        }
        try (InputStream in = r.getInputStream()) {
          out.put(version, new Script(version, name, new String(in.readAllBytes(),
              StandardCharsets.UTF_8)));
        }
      }
    } catch (java.io.IOException e) {
      throw new IllegalStateException("读取迁移脚本失败", e);
    }
    return out;
  }

  /** 按分号切分 SQL，跳过注释，不在引号/反引号内切分。 */
  public static List<String> splitStatements(String sql) {
    List<String> out = new ArrayList<>();
    StringBuilder cur = new StringBuilder();
    boolean inSingle = false;
    boolean inDouble = false;
    boolean inBack = false;
    boolean lineComment = false;
    for (int i = 0; i < sql.length(); i++) {
      char c = sql.charAt(i);
      char next = i + 1 < sql.length() ? sql.charAt(i + 1) : '\0';
      if (lineComment) {
        if (c == '\n') {
          lineComment = false;
          cur.append('\n');
        }
        continue;
      }
      if (!inSingle && !inDouble && !inBack) {
        if (c == '-' && next == '-') {
          lineComment = true;
          i++;
          continue;
        }
        if (c == '#') {
          lineComment = true;
          continue;
        }
      }
      if (c == '\'' && !inDouble && !inBack) {
        inSingle = !inSingle;
      } else if (c == '"' && !inSingle && !inBack) {
        inDouble = !inDouble;
      } else if (c == '`') {
        inBack = !inBack;
      }
      if (c == ';' && !inSingle && !inDouble && !inBack) {
        String stmt = cur.toString().trim();
        if (!stmt.isEmpty()) out.add(stmt);
        cur.setLength(0);
        continue;
      }
      cur.append(c);
    }
    String last = cur.toString().trim();
    if (!last.isEmpty()) out.add(last);
    return out;
  }

  static String checksum(String content) {
    try {
      MessageDigest md = MessageDigest.getInstance("MD5");
      byte[] digest = md.digest(content.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private record Script(long version, String name, String content) {}
}
