package com.familyledger.common;

import java.math.BigDecimal;
import java.util.regex.Pattern;

/**
 * 金额转换工具：内部一律整数「分」，对外输出两位小数字符串元。
 * 与 TS 版 domain/money.ts 逐行对齐：走字符串解析，规避浮点误差。
 */
public final class Money {
  private static final Pattern AMOUNT_RE = Pattern.compile("-?\\d+(\\.\\d+)?");

  private Money() {}

  /** 元 -> 整数分，四舍五入到分。非法输入抛 IllegalArgumentException。 */
  public static long toCents(Object input) {
    String s;
    if (input instanceof Number n) {
      if (n instanceof Double d && !Double.isFinite(d)) throw new IllegalArgumentException("INVALID_AMOUNT");
      if (n instanceof Float f && !Float.isFinite(f)) throw new IllegalArgumentException("INVALID_AMOUNT");
      s = numberToString(n);
    } else if (input instanceof String str) {
      s = str.trim();
    } else {
      throw new IllegalArgumentException("INVALID_AMOUNT");
    }

    if (s.isEmpty() || !AMOUNT_RE.matcher(s).matches()) {
      throw new IllegalArgumentException("INVALID_AMOUNT");
    }

    boolean negative = s.startsWith("-");
    String abs = negative ? s.substring(1) : s;
    int dotIdx = abs.indexOf('.');
    String intPart = dotIdx == -1 ? abs : abs.substring(0, dotIdx);
    String fracPart = dotIdx == -1 ? "" : abs.substring(dotIdx + 1);

    long intVal = Long.parseLong(intPart);
    int d1 = fracPart.length() > 0 ? fracPart.charAt(0) - '0' : 0;
    int d2 = fracPart.length() > 1 ? fracPart.charAt(1) - '0' : 0;
    int d3 = fracPart.length() > 2 ? fracPart.charAt(2) - '0' : 0;

    long cents = intVal * 100 + d1 * 10L + d2;
    if (d3 >= 5) cents += 1;
    return negative ? -cents : cents;
  }

  /** 整数分 -> 两位小数字符串元。如 1234 -> "12.34"，-5 -> "-0.05"。 */
  public static String toYuanString(long cents) {
    boolean negative = cents < 0;
    long abs = Math.abs(cents);
    long yuan = abs / 100;
    long rem = abs % 100;
    return (negative ? "-" : "") + yuan + "." + String.format("%02d", rem);
  }

  private static String numberToString(Number n) {
    if (n instanceof BigDecimal bd) return bd.toPlainString();
    if (n instanceof Integer || n instanceof Long || n instanceof Short || n instanceof Byte) {
      return n.toString();
    }
    // double / float：走 BigDecimal 的十进制表示，避免 12.5 -> "12.5" 之外的精度漂移
    return new BigDecimal(n.toString()).toPlainString();
  }
}
