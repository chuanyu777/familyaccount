package com.familyledger.common;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** 月份（'YYYY-MM'）相关工具，与 TS 版 domain/month.ts 对齐。 */
public final class MonthUtil {
  public static final Pattern MONTH_RE = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

  private MonthUtil() {}

  public static boolean isValidMonth(String month) {
    return month != null && MONTH_RE.matcher(month).matches();
  }

  /** 当前月份，形如 '2026-09'。 */
  public static String currentMonth() {
    LocalDate d = LocalDate.now();
    return String.format("%d-%02d", d.getYear(), d.getMonthValue());
  }

  /** 'YYYY-MM' 平移 n 个月，跨年自动进位/借位。 */
  public static String shiftMonth(String month, int delta) {
    String[] parts = month.split("-");
    int total = Integer.parseInt(parts[0]) * 12 + (Integer.parseInt(parts[1]) - 1) + delta;
    int y = Math.floorDiv(total, 12);
    int m = Math.floorMod(total, 12) + 1;
    return String.format("%d-%02d", y, m);
  }

  /** 该月最后一天的日期串 'YYYY-MM-DD'。 */
  public static String lastDayOf(String month) {
    String[] parts = month.split("-");
    int y = Integer.parseInt(parts[0]);
    int m = Integer.parseInt(parts[1]);
    int day = LocalDate.of(y, m, 1).lengthOfMonth();
    return String.format("%d-%02d-%02d", y, m, day);
  }

  /** 生成以 endMonth 结尾、共 months 个月的升序列表。 */
  public static List<String> monthRange(String endMonth, int months) {
    List<String> out = new ArrayList<>(months);
    for (int i = months - 1; i >= 0; i--) {
      out.add(shiftMonth(endMonth, -i));
    }
    return out;
  }
}
