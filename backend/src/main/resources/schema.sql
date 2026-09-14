-- 家庭记账簿数据模型（MySQL 8 / H2 MySQL 兼容模式）
-- 约定：
--   1. 所有金额以「分」为单位的 BIGINT 存储，杜绝浮点误差。
--   2. 单家庭：family 表恒为一行（id = 1），其余表不冗余 family_id。
--   3. 级联删除由应用层显式处理（service 层事务），外键仅作兜底约束。
--   4. 时间戳一律存 VARCHAR(19)（'YYYY-MM-DD HH:MM:SS'），由应用层写入，
--      规避 MySQL/H2 在 DATETIME/TIMESTAMP 上的方言与时区差异。

CREATE TABLE IF NOT EXISTS family (
  id         BIGINT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  created_at VARCHAR(19)  NOT NULL
);

CREATE TABLE IF NOT EXISTS member (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  color      VARCHAR(32),
  created_at VARCHAR(19)  NOT NULL
);

CREATE TABLE IF NOT EXISTS account (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  balance_cents BIGINT       NOT NULL DEFAULT 0,
  member_id     BIGINT,
  is_default    INT          NOT NULL DEFAULT 0,
  created_at    VARCHAR(19)  NOT NULL,
  CONSTRAINT fk_account_member FOREIGN KEY (member_id) REFERENCES member (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS category (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  kind       VARCHAR(16)  NOT NULL,
  name       VARCHAR(255) NOT NULL,
  created_at VARCHAR(19)  NOT NULL,
  CONSTRAINT uq_category_kind_name UNIQUE (kind, name)
);

-- 表名用 txn 而非 transaction：前者不是 SQL 保留字。
CREATE TABLE IF NOT EXISTS txn (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  type          VARCHAR(16)  NOT NULL,
  amount_cents  BIGINT       NOT NULL,
  occurred_on   VARCHAR(10)  NOT NULL,
  note          VARCHAR(1024),
  account_id    BIGINT       NOT NULL,
  to_account_id BIGINT,
  category_id   BIGINT,
  member_id     BIGINT,
  source_type   VARCHAR(16)  NOT NULL DEFAULT 'manual',
  source_id     BIGINT,
  created_at    VARCHAR(19)  NOT NULL,
  CONSTRAINT fk_txn_account    FOREIGN KEY (account_id)    REFERENCES account (id)  ON DELETE CASCADE,
  CONSTRAINT fk_txn_to_account FOREIGN KEY (to_account_id) REFERENCES account (id)  ON DELETE CASCADE,
  CONSTRAINT fk_txn_category   FOREIGN KEY (category_id)   REFERENCES category (id) ON DELETE SET NULL,
  CONSTRAINT fk_txn_member     FOREIGN KEY (member_id)     REFERENCES member (id)   ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS asset (
  id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(255) NOT NULL,
  value_cents          BIGINT       NOT NULL DEFAULT 0,
  kind                 VARCHAR(255) NOT NULL DEFAULT '其他',
  member_id            BIGINT,
  updated_at           VARCHAR(19)  NOT NULL,
  updated_by_member_id BIGINT,
  CONSTRAINT fk_asset_member     FOREIGN KEY (member_id)            REFERENCES member (id) ON DELETE SET NULL,
  CONSTRAINT fk_asset_upd_member FOREIGN KEY (updated_by_member_id) REFERENCES member (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS liability (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL,
  remaining_cents       BIGINT       NOT NULL DEFAULT 0,
  monthly_payment_cents BIGINT       NOT NULL DEFAULT 0,
  payment_day           INT,
  member_id             BIGINT,
  created_at            VARCHAR(19)  NOT NULL,
  CONSTRAINT fk_liability_member FOREIGN KEY (member_id) REFERENCES member (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS repayment (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  liability_id   BIGINT      NOT NULL,
  amount_cents   BIGINT      NOT NULL,
  occurred_on    VARCHAR(10) NOT NULL,
  account_id     BIGINT      NOT NULL,
  transaction_id BIGINT,
  created_at     VARCHAR(19) NOT NULL,
  CONSTRAINT fk_repay_liability FOREIGN KEY (liability_id)   REFERENCES liability (id) ON DELETE CASCADE,
  CONSTRAINT fk_repay_account   FOREIGN KEY (account_id)     REFERENCES account (id)   ON DELETE CASCADE,
  CONSTRAINT fk_repay_txn       FOREIGN KEY (transaction_id) REFERENCES txn (id)       ON DELETE SET NULL
);

-- 资产市值快照：每月一条，记录「该月底这项资产值多少钱」。
-- 列名用 snap_month 而非 month，规避 H2 的保留字 MONTH。
CREATE TABLE IF NOT EXISTS asset_snapshot (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  asset_id    BIGINT      NOT NULL,
  snap_month  VARCHAR(7)  NOT NULL,
  value_cents BIGINT      NOT NULL,
  note        VARCHAR(1024),
  recorded_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_snapshot_asset_month UNIQUE (asset_id, snap_month),
  CONSTRAINT fk_snapshot_asset FOREIGN KEY (asset_id) REFERENCES asset (id) ON DELETE CASCADE
);
