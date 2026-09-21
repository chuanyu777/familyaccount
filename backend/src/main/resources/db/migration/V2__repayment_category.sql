-- 还款生成的账目原本归到「其他」，这里补上专门的「还款」分类并订正历史数据。
-- 说明：MySQL 与 H2（本地测试库）都要能跑，所以不用 INSERT IGNORE 这类方言。

INSERT INTO category (kind, name, created_at)
SELECT 'expense', '还款', '2026-09-21 00:00:00'
  FROM (SELECT 1) AS seed
 WHERE NOT EXISTS (SELECT 1 FROM category WHERE kind = 'expense' AND name = '还款');

UPDATE txn
   SET category_id = (SELECT id FROM category WHERE kind = 'expense' AND name = '还款')
 WHERE source_type = 'repayment';
