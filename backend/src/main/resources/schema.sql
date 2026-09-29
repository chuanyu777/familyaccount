-- Multi-tenant ledger schema (MySQL 8 / H2 MySQL compatibility mode).
-- Amounts are stored as BIGINT cents and timestamps as VARCHAR(19).
-- Existing single-ledger data is outside this rollout and this is the fresh baseline.

CREATE TABLE IF NOT EXISTS app_user (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  display_name VARCHAR(255) NOT NULL,
  created_at VARCHAR(19) NOT NULL
);

CREATE TABLE IF NOT EXISTS wechat_identity (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  openid VARCHAR(255) NOT NULL,
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_wechat_user UNIQUE (user_id),
  CONSTRAINT uq_wechat_openid UNIQUE (openid),
  CONSTRAINT fk_wechat_user FOREIGN KEY (user_id) REFERENCES app_user (id)
);

CREATE TABLE IF NOT EXISTS web_credential (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  username VARCHAR(255) NOT NULL,
  password_hash VARCHAR(512) NOT NULL,
  enabled INT NOT NULL DEFAULT 1,
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_web_user UNIQUE (user_id),
  CONSTRAINT uq_web_username UNIQUE (username),
  CONSTRAINT fk_web_user FOREIGN KEY (user_id) REFERENCES app_user (id)
);

CREATE TABLE IF NOT EXISTS platform_admin (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  password_hash VARCHAR(512) NOT NULL,
  enabled INT NOT NULL DEFAULT 1,
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_platform_username UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS ledger (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  is_web_enabled INT NOT NULL DEFAULT 0,
  created_by_user_id BIGINT NOT NULL,
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_ledger_creator_scope UNIQUE (id, created_by_user_id),
  CONSTRAINT fk_ledger_creator FOREIGN KEY (created_by_user_id) REFERENCES app_user (id)
);

CREATE TABLE IF NOT EXISTS ledger_membership (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  role VARCHAR(16) NOT NULL,
  web_login_allowed INT NOT NULL DEFAULT 0,
  active INT NOT NULL DEFAULT 1,
  joined_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_membership_user UNIQUE (ledger_id, user_id),
  CONSTRAINT ck_membership_role CHECK (role IN ('OWNER', 'MEMBER')),
  CONSTRAINT fk_membership_ledger FOREIGN KEY (ledger_id) REFERENCES ledger (id),
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES app_user (id)
);

CREATE TABLE IF NOT EXISTS ledger_invitation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id BIGINT NOT NULL,
  created_by_user_id BIGINT NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at VARCHAR(19) NOT NULL,
  revoked_at VARCHAR(19),
  accepted_at VARCHAR(19),
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_invitation_token UNIQUE (token_hash),
  CONSTRAINT fk_invitation_ledger FOREIGN KEY (ledger_id) REFERENCES ledger (id),
  CONSTRAINT fk_invitation_creator FOREIGN KEY (created_by_user_id) REFERENCES app_user (id)
);

CREATE TABLE IF NOT EXISTS web_binding_code (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  code_hash VARCHAR(128) NOT NULL,
  expires_at VARCHAR(19) NOT NULL,
  used_at VARCHAR(19),
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_binding_code UNIQUE (code_hash),
  CONSTRAINT fk_binding_user FOREIGN KEY (user_id) REFERENCES app_user (id)
);

CREATE TABLE IF NOT EXISTS account (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  is_default INT NOT NULL DEFAULT 0,
  archived INT NOT NULL DEFAULT 0,
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_account_name UNIQUE (ledger_id, name),
  CONSTRAINT uq_account_scope UNIQUE (id, ledger_id),
  CONSTRAINT fk_account_ledger FOREIGN KEY (ledger_id) REFERENCES ledger (id)
);

CREATE TABLE IF NOT EXISTS category (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id BIGINT NOT NULL,
  kind VARCHAR(16) NOT NULL,
  name VARCHAR(255) NOT NULL,
  archived INT NOT NULL DEFAULT 0,
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_category_name UNIQUE (ledger_id, kind, name),
  CONSTRAINT uq_category_scope UNIQUE (id, ledger_id),
  CONSTRAINT fk_category_ledger FOREIGN KEY (ledger_id) REFERENCES ledger (id)
);

CREATE TABLE IF NOT EXISTS txn (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id BIGINT NOT NULL,
  type VARCHAR(16) NOT NULL,
  amount_cents BIGINT NOT NULL,
  occurred_on VARCHAR(10) NOT NULL,
  note VARCHAR(1024),
  account_id BIGINT NOT NULL,
  to_account_id BIGINT,
  category_id BIGINT,
  created_by_user_id BIGINT NOT NULL,
  source_type VARCHAR(16) NOT NULL DEFAULT 'manual',
  source_id BIGINT,
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_txn_scope UNIQUE (id, ledger_id),
  CONSTRAINT fk_txn_ledger FOREIGN KEY (ledger_id) REFERENCES ledger (id),
  CONSTRAINT fk_txn_account FOREIGN KEY (account_id, ledger_id) REFERENCES account (id, ledger_id),
  CONSTRAINT fk_txn_to_account FOREIGN KEY (to_account_id, ledger_id) REFERENCES account (id, ledger_id),
  CONSTRAINT fk_txn_category FOREIGN KEY (category_id, ledger_id) REFERENCES category (id, ledger_id),
  CONSTRAINT fk_txn_creator FOREIGN KEY (created_by_user_id) REFERENCES app_user (id)
);

CREATE TABLE IF NOT EXISTS asset (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  value_cents BIGINT NOT NULL DEFAULT 0,
  kind VARCHAR(255) NOT NULL DEFAULT '其他',
  archived INT NOT NULL DEFAULT 0,
  updated_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_asset_name UNIQUE (ledger_id, name),
  CONSTRAINT uq_asset_scope UNIQUE (id, ledger_id),
  CONSTRAINT fk_asset_ledger FOREIGN KEY (ledger_id) REFERENCES ledger (id)
);

CREATE TABLE IF NOT EXISTS liability (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  remaining_cents BIGINT NOT NULL DEFAULT 0,
  monthly_payment_cents BIGINT NOT NULL DEFAULT 0,
  payment_day INT,
  archived INT NOT NULL DEFAULT 0,
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_liability_name UNIQUE (ledger_id, name),
  CONSTRAINT uq_liability_scope UNIQUE (id, ledger_id),
  CONSTRAINT fk_liability_ledger FOREIGN KEY (ledger_id) REFERENCES ledger (id)
);

CREATE TABLE IF NOT EXISTS repayment (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id BIGINT NOT NULL,
  liability_id BIGINT NOT NULL,
  amount_cents BIGINT NOT NULL,
  occurred_on VARCHAR(10) NOT NULL,
  account_id BIGINT NOT NULL,
  transaction_id BIGINT,
  created_by_user_id BIGINT NOT NULL,
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_repayment_scope UNIQUE (id, ledger_id),
  CONSTRAINT uq_repayment_transaction UNIQUE (ledger_id, transaction_id),
  CONSTRAINT fk_repayment_ledger FOREIGN KEY (ledger_id) REFERENCES ledger (id),
  CONSTRAINT fk_repayment_liability FOREIGN KEY (liability_id, ledger_id) REFERENCES liability (id, ledger_id),
  CONSTRAINT fk_repayment_account FOREIGN KEY (account_id, ledger_id) REFERENCES account (id, ledger_id),
  CONSTRAINT fk_repayment_transaction FOREIGN KEY (transaction_id, ledger_id) REFERENCES txn (id, ledger_id),
  CONSTRAINT fk_repayment_creator FOREIGN KEY (created_by_user_id) REFERENCES app_user (id)
);

CREATE TABLE IF NOT EXISTS asset_snapshot (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id BIGINT NOT NULL,
  asset_id BIGINT NOT NULL,
  snap_month VARCHAR(7) NOT NULL,
  value_cents BIGINT NOT NULL,
  note VARCHAR(1024),
  recorded_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_snapshot_asset_month UNIQUE (ledger_id, asset_id, snap_month),
  CONSTRAINT fk_snapshot_ledger FOREIGN KEY (ledger_id) REFERENCES ledger (id),
  CONSTRAINT fk_snapshot_asset FOREIGN KEY (asset_id, ledger_id) REFERENCES asset (id, ledger_id)
);
