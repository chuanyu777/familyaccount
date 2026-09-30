package com.familyledger.common;

import java.math.BigDecimal;
import java.math.RoundingMode;
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

    try {
      return new BigDecimal(s).movePointRight(2)
          .setScale(0, RoundingMode.HALF_UP)
          .longValueExact();
    } catch (ArithmeticException e) {
      throw new IllegalArgumentException("INVALID_AMOUNT", e);
    }
  }

  /** 整数分 -> 两位小数字符串元。如 1234 -> "12.34"，-5 -> "-0.05"。 */
  public static String toYuanString(long cents) {
    return BigDecimal.valueOf(cents, 2).setScale(2).toPlainString();
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
