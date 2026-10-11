package com.familyledger.service;

import java.util.List;

/**
 * 分类名称 → 图标代号 的本地词典。
 *
 * <p>匹配规则：大小写不敏感的子串包含（toLowerCase 后 contains）。
 * 一条分类命中多条规则时，取词典中先出现的那条（顺序很重要）。
 * 未命中则返回 {@link #DEFAULT_KEY}。
 *
 * <p>词典与前端 shared/category-icons.ts 中的 icon_key 集合保持一致；
 * 新增/删除图标时两边都要同步。
 */
public final class CategoryIconDictionary {
  private CategoryIconDictionary() {}

  public static final String DEFAULT_KEY = "other";

  /** 关键词（任一出现即命中）→ icon_key。 */
  private static final List<Rule> RULES = List.of(
      new Rule(List.of("餐饮", "吃饭", "外卖", "聚餐", "食堂", "早餐", "午餐", "晚餐", "宵夜",
              "咖啡", "奶茶", "饮料", "零食", "水果", "蔬菜", "超市购物吃"), "food"),
      new Rule(List.of("交通", "打车", "滴滴", "公交", "地铁", "加油", "油费", "停车", "高速",
              "过路", "过路费", "出租车", "网约车", "火车", "高铁", "动车", "机票", "船票",
              "共享单车", "单车", "车费"), "transport"),
      new Rule(List.of("购物", "超市", "日用品", "网购", "淘宝", "京东", "拼多多", "百货",
              "杂货", "文具", "日用"), "shopping"),
      new Rule(List.of("房租", "房贷", "月供", "按揭", "物业", "物业费", "取暖", "取暖费",
              "搬家"), "home"),
      new Rule(List.of("水电", "电费", "水费", "燃气", "煤气", "暖气", "网费", "宽带",
              "话费", "手机费", "电话费"), "utility"),
      new Rule(List.of("娱乐", "电影", "游戏", "ktv", "唱歌", "演出", "演唱会", "话剧",
              "展览", "景点", "景区", "门票", "网吧", "麻将", "桌游"), "entertainment"),
      new Rule(List.of("医疗", "看病", "门诊", "挂号", "住院", "手术", "买药", "药店",
              "体检", "疫苗", "牙医", "口腔"), "health"),
      new Rule(List.of("教育", "学费", "培训", "补习班", "辅导班", "书本", "学习",
              "文具学习", "网课"), "education"),
      new Rule(List.of("衣服", "裤子", "裙子", "鞋子", "袜子", "帽子", "服饰", "穿搭",
              "服装"), "clothing"),
      new Rule(List.of("工资", "薪水", "薪资", "奖金", "津贴", "补贴", "报销"), "salary"),
      new Rule(List.of("理财", "基金", "股票", "债券", "投资", "利息", "分红", "收益",
              "余额宝", "零钱通"), "invest"),
      new Rule(List.of("红包", "礼金", "随礼", "份子钱", "人情", "打赏", "送礼", "礼物"), "gift"),
      new Rule(List.of("宠物", "猫粮", "狗粮", "猫砂", "宠物医疗", "宠物用品"), "pet"),
      new Rule(List.of("还款", "还贷", "信用卡", "花呗", "白条", "借呗"), "repay")
  );

  /** 取与前端 shared/category-icons.ts 一致的合法 icon_key 集合（用于校验/过滤）。 */
  public static final List<String> VALID_KEYS = List.of(
      "food", "transport", "shopping", "home", "utility",
      "entertainment", "health", "education", "clothing",
      "salary", "invest", "gift", "pet", "repay",
      DEFAULT_KEY
  );

  /**
   * 根据分类名推断 icon_key。null/空返回默认。
   * 匹配是子串包含，所以「早餐饮品」「外卖晚餐」都会被「餐饮/外卖/晚餐」命中。
   */
  public static String lookup(String name) {
    if (name == null) return DEFAULT_KEY;
    String n = name.trim().toLowerCase(java.util.Locale.ROOT);
    if (n.isEmpty()) return DEFAULT_KEY;
    for (Rule rule : RULES) {
      for (String keyword : rule.keywords) {
        if (n.contains(keyword.toLowerCase(java.util.Locale.ROOT))) {
          return rule.iconKey;
        }
      }
    }
    return DEFAULT_KEY;
  }

  /** 收敛任意字符串到合法 icon_key，未知返回 {@link #DEFAULT_KEY}。 */
  public static String resolve(String key) {
    if (key == null) return DEFAULT_KEY;
    String trimmed = key.trim();
    if (trimmed.isEmpty()) return DEFAULT_KEY;
    return VALID_KEYS.contains(trimmed) ? trimmed : DEFAULT_KEY;
  }

  private record Rule(List<String> keywords, String iconKey) {}
}