package com.familyledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.familyledger.common.Money;
import org.junit.jupiter.api.Test;

class MoneyTest {

  @Test
  void toCents_字符串与数字元转分() {
    assertThat(Money.toCents("12.34")).isEqualTo(1234L);
    assertThat(Money.toCents(12.5)).isEqualTo(1250L);
    assertThat(Money.toCents(99.99)).isEqualTo(9999L);
    assertThat(Money.toCents("100")).isEqualTo(10000L);
    assertThat(Money.toCents(100)).isEqualTo(10000L);
    assertThat(Money.toCents("0.01")).isEqualTo(1L);
    assertThat(Money.toCents("-0.05")).isEqualTo(-5L);
    assertThat(Money.toCents("0")).isEqualTo(0L);
  }

  @Test
  void toCents_第三位小数四舍五入到分() {
    assertThat(Money.toCents("1.005")).isEqualTo(101L); // 100 + 进位 1
    assertThat(Money.toCents("1.004")).isEqualTo(100L); // 100，不舍入
    assertThat(Money.toCents("1.999")).isEqualTo(200L); // 199.9 -> 200
  }

  @Test
  void toCents_非法输入抛异常() {
    assertThatThrownBy(() -> Money.toCents("abc")).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> Money.toCents("")).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> Money.toCents(null)).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> Money.toCents("12.34.5")).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void toYuanString_分转两位元() {
    assertThat(Money.toYuanString(1234L)).isEqualTo("12.34");
    assertThat(Money.toYuanString(-5L)).isEqualTo("-0.05");
    assertThat(Money.toYuanString(0L)).isEqualTo("0.00");
    assertThat(Money.toYuanString(100000000L)).isEqualTo("1000000.00");
    assertThat(Money.toYuanString(-13024089L)).isEqualTo("-130240.89");
  }
}
