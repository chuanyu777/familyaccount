package com.familyledger.common;

import java.util.regex.Pattern;

/** 路由参数解析辅助：与 TS 版 routes/params.ts + zod 校验对齐。 */
public final class Params {
  private static final Pattern MONTH_LOOSE = Pattern.compile("\\d{4}-\\d{2}");

  private Params() {}

  public static long parseId(Object raw) {
    long id;
    try {
      id = Long.parseLong(String.valueOf(raw));
    } catch (NumberFormatException e) {
      throw ApiException.badRequest("VALIDATION_FAILED", "id 必须为正整数");
    }
    if (id <= 0) throw ApiException.badRequest("VALIDATION_FAILED", "id 必须为正整数");
    return id;
  }

  public static Integer parseIntPositive(Object raw, String field) {
    if (raw == null) return null;
    String s = String.valueOf(raw).trim();
    if (s.isEmpty()) return null;
    int v;
    try {
      v = Integer.parseInt(s);
    } catch (NumberFormatException e) {
      throw ApiException.badRequest("VALIDATION_FAILED", field + " 必须为正整数");
    }
    if (v <= 0) throw ApiException.badRequest("VALIDATION_FAILED", field + " 必须为正整数");
    return v;
  }

  /** 正整数可空（用于 accountId/memberId 这类筛选，z.coerce.number().positive()）。 */
  public static Long parseLongPositive(Object raw, String field) {
    if (raw == null) return null;
    String s = String.valueOf(raw).trim();
    if (s.isEmpty()) return null;
    long v;
    try {
      v = Long.parseLong(s);
    } catch (NumberFormatException e) {
      throw ApiException.badRequest("VALIDATION_FAILED", field + " 必须为正整数");
    }
    if (v <= 0) throw ApiException.badRequest("VALIDATION_FAILED", field + " 必须为正整数");
    return v;
  }

  /** 校验 'YYYY-MM'（宽松，与路由层一致；严格到 1-12 月由 service 再校验）。 */
  public static String parseMonth(Object raw, String field) {
    if (raw == null) return null;
    String s = String.valueOf(raw).trim();
    if (!MONTH_LOOSE.matcher(s).matches()) {
      throw ApiException.badRequest("VALIDATION_FAILED", field + " 需为 YYYY-MM");
    }
    return s;
  }

  /** 校验枚举值。 */
  public static String parseEnum(Object raw, String field, String... allowed) {
    String s = raw == null ? null : String.valueOf(raw);
    for (String a : allowed) {
      if (a.equals(s)) return s;
    }
    throw ApiException.badRequest("VALIDATION_FAILED", field + " 取值非法");
  }
}
