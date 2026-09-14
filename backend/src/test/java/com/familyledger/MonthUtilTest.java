package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;

import com.familyledger.common.MonthUtil;
import java.util.List;
import org.junit.jupiter.api.Test;

class MonthUtilTest {

  @Test
  void isValidMonth() {
    assertThat(MonthUtil.isValidMonth("2026-09")).isTrue();
    assertThat(MonthUtil.isValidMonth("2026-1")).isFalse();
    assertThat(MonthUtil.isValidMonth("2026-13")).isFalse();
    assertThat(MonthUtil.isValidMonth("2026-00")).isFalse();
    assertThat(MonthUtil.isValidMonth(null)).isFalse();
  }

  @Test
  void shiftMonth_跨年进位借位() {
    assertThat(MonthUtil.shiftMonth("2026-01", -1)).isEqualTo("2025-12");
    assertThat(MonthUtil.shiftMonth("2025-12", 1)).isEqualTo("2026-01");
    assertThat(MonthUtil.shiftMonth("2026-09", -6)).isEqualTo("2026-03");
  }

  @Test
  void lastDayOf_闰年与平年() {
    assertThat(MonthUtil.lastDayOf("2026-02")).isEqualTo("2026-02-28");
    assertThat(MonthUtil.lastDayOf("2024-02")).isEqualTo("2024-02-29");
    assertThat(MonthUtil.lastDayOf("2026-04")).isEqualTo("2026-04-30");
  }

  @Test
  void monthRange_升序含末月() {
    assertThat(MonthUtil.monthRange("2026-03", 3))
        .isEqualTo(List.of("2026-01", "2026-02", "2026-03"));
  }
}
