package com.familyledger.common;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/** 时间戳（'YYYY-MM-DD HH:MM:SS'）工具，对应 TS 版用 datetime('now') 的语义（本地时间）。 */
public final class Time {
  private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

  private Time() {}

  /** 当前日期时间字符串，如 '2026-09-13 21:52:44'。 */
  public static String now() {
    return LocalDateTime.now().format(TS);
  }

  /** 今天日期 'YYYY-MM-DD'。 */
  public static String today() {
    return LocalDate.now().toString();
  }
}
