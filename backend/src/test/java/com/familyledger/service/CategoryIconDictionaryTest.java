package com.familyledger.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * 词典本身是纯函数，不依赖数据库 —— 单元测试就够。
 * 关键词覆盖「餐饮/交通/购物/工资」等常见词以及子串匹配边界。
 */
class CategoryIconDictionaryTest {

  @Test
  void matchesKnownKeywords() {
    assertThat(CategoryIconDictionary.lookup("餐饮")).isEqualTo("food");
    assertThat(CategoryIconDictionary.lookup("交通")).isEqualTo("transport");
    assertThat(CategoryIconDictionary.lookup("购物")).isEqualTo("shopping");
    assertThat(CategoryIconDictionary.lookup("工资")).isEqualTo("salary");
    assertThat(CategoryIconDictionary.lookup("娱乐")).isEqualTo("entertainment");
  }

  @Test
  void matchesSubstringInsideCompoundName() {
    // 子串匹配，"餐饮" 出现在更长名字里也应命中
    assertThat(CategoryIconDictionary.lookup("朋友聚餐")).isEqualTo("food");
    assertThat(CategoryIconDictionary.lookup("日常交通")).isEqualTo("transport");
    assertThat(CategoryIconDictionary.lookup("孩子衣服")).isEqualTo("clothing");
    assertThat(CategoryIconDictionary.lookup("月度工资发放")).isEqualTo("salary");
  }

  @Test
  void isCaseInsensitiveForEnglishKeywords() {
    // 当前关键词全是中文，但保留大小写无关语义以便未来扩展英文
    assertThat(CategoryIconDictionary.lookup("OTHER")).isEqualTo(CategoryIconDictionary.DEFAULT_KEY);
  }

  @Test
  void fallsBackToDefaultForUnknown() {
    assertThat(CategoryIconDictionary.lookup("xyz不存在的词")).isEqualTo("other");
    assertThat(CategoryIconDictionary.lookup("")).isEqualTo("other");
    assertThat(CategoryIconDictionary.lookup("  ")).isEqualTo("other");
    assertThat(CategoryIconDictionary.lookup(null)).isEqualTo("other");
  }

  @Test
  void ruleOrderMattersFirstMatchWins() {
    // 「日常交通」应该命中 transport 而不是 shopping
    assertThat(CategoryIconDictionary.lookup("日常交通")).isEqualTo("transport");
  }

  @Test
  void resolveCollapsesUnknownKeyToDefault() {
    assertThat(CategoryIconDictionary.resolve("food")).isEqualTo("food");
    assertThat(CategoryIconDictionary.resolve("nonexistent")).isEqualTo("other");
    assertThat(CategoryIconDictionary.resolve(null)).isEqualTo("other");
    assertThat(CategoryIconDictionary.resolve("")).isEqualTo("other");
    assertThat(CategoryIconDictionary.resolve("  food  ")).isEqualTo("food");
  }

  @Test
  void validKeysListMatchesSharedContract() {
    // 与前端 shared/category-icons.ts 的 CATEGORY_ICON_KEYS 顺序保持一致
    // 改一边必须同步另一边，否则前端拿到合法 key 但找不到渲染数据
    assertThat(CategoryIconDictionary.VALID_KEYS).containsExactly(
        "food", "transport", "shopping", "home", "utility",
        "entertainment", "health", "education", "clothing",
        "salary", "invest", "gift", "pet", "repay",
        CategoryIconDictionary.DEFAULT_KEY
    );
  }
}