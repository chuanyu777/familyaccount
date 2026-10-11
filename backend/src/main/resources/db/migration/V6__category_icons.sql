-- 为分类增加 icon_key 字段。
-- - V1 baseline 已建好 category 表，但当时没有图标字段
-- - 加可空列：新老分类都不破坏；老分类在 V6 应用后由 Java 端 CategoryIconBackfill 一次性回填
-- - 已应用迁移不可改：若以后要改默认值或加索引，新建更高版本

ALTER TABLE category ADD COLUMN icon_key VARCHAR(32) NULL AFTER name;