-- 家庭记账簿 MVP 数据模型
-- 约定：
--   1. 所有金额以「分」为单位的 INTEGER 存储，杜绝浮点误差。
--   2. 单家庭：family 表恒为一行（id = 1），其余表不冗余 family_id。
--   3. 级联删除由应用层显式处理（service 层事务），外键仅作兜底约束。

CREATE TABLE IF NOT EXISTS family (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS member (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  color      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS account (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  member_id     INTEGER REFERENCES member(id) ON DELETE SET NULL,
  is_default    INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS category (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, name)
);

-- 表名用 txn 而非 transaction：前者不是 SQL 保留字。
CREATE TABLE IF NOT EXISTS txn (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  occurred_on   TEXT NOT NULL,
  note          TEXT,
  account_id    INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  to_account_id INTEGER REFERENCES account(id) ON DELETE CASCADE,
  category_id   INTEGER REFERENCES category(id) ON DELETE SET NULL,
  member_id     INTEGER REFERENCES member(id) ON DELETE SET NULL,
  source_type   TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'repayment')),
  source_id     INTEGER,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS asset (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT NOT NULL,
  value_cents          INTEGER NOT NULL DEFAULT 0 CHECK (value_cents >= 0),
  kind                 TEXT NOT NULL DEFAULT '其他',
  member_id            INTEGER REFERENCES member(id) ON DELETE SET NULL,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by_member_id INTEGER REFERENCES member(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS liability (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL,
  remaining_cents       INTEGER NOT NULL DEFAULT 0 CHECK (remaining_cents >= 0),
  monthly_payment_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_payment_cents >= 0),
  payment_day           INTEGER,
  member_id             INTEGER REFERENCES member(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repayment (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  liability_id   INTEGER NOT NULL REFERENCES liability(id) ON DELETE CASCADE,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  occurred_on    TEXT NOT NULL,
  account_id     INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  transaction_id INTEGER REFERENCES txn(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 资产市值快照：每月一条，记录「该月底这项资产值多少钱」。
-- 只在用户主动更新市值时写入，因此历史月份可能缺失，读取时按需回退到当前市值。
CREATE TABLE IF NOT EXISTS asset_snapshot (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id     INTEGER NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  month        TEXT NOT NULL,
  value_cents  INTEGER NOT NULL CHECK (value_cents >= 0),
  note         TEXT,
  recorded_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (asset_id, month)
);

CREATE INDEX IF NOT EXISTS idx_txn_occurred_on   ON txn (occurred_on DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_txn_source        ON txn (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_repayment_liab    ON repayment (liability_id);
CREATE INDEX IF NOT EXISTS idx_account_default   ON account (is_default);
CREATE INDEX IF NOT EXISTS idx_asset_snapshot    ON asset_snapshot (asset_id, month DESC);
