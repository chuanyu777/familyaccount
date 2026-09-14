package com.familyledger.common;

import java.util.Map;

/** 从 JdbcTemplate 返回的 Map<String,Object> 行里安全取值。 */
public final class Row {
  private Row() {}

  public static long lng(Object v) {
    if (v == null) return 0L;
    if (v instanceof Number n) return n.longValue();
    return Long.parseLong(String.valueOf(v));
  }

  public static long lng(Map<String, Object> m, String k) {
    return lng(m.get(k));
  }

  public static Long lngOrNull(Map<String, Object> m, String k) {
    Object v = m.get(k);
    return v == null ? null : lng(v);
  }

  public static Integer intOrNull(Map<String, Object> m, String k) {
    Object v = m.get(k);
    return v == null ? null : ((Number) v).intValue();
  }

  public static String str(Map<String, Object> m, String k) {
    Object v = m.get(k);
    return v == null ? null : String.valueOf(v);
  }

  public static String strOrNull(Map<String, Object> m, String k) {
    return str(m, k);
  }
}
