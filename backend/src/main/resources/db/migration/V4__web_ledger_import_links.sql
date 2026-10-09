-- Web 账号可被已登录的微信账号认领到对应的特殊账本。
-- 绑定码必须明确账本范围，关联记录同时让原 Web 登录继续生效。
ALTER TABLE web_binding_code ADD COLUMN ledger_id BIGINT;

CREATE TABLE web_account_link (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ledger_id BIGINT NOT NULL,
  web_user_id BIGINT NOT NULL,
  wechat_user_id BIGINT NOT NULL,
  created_at VARCHAR(19) NOT NULL,
  CONSTRAINT uq_web_account_link UNIQUE (ledger_id, web_user_id),
  CONSTRAINT uq_wechat_ledger_link UNIQUE (ledger_id, wechat_user_id),
  CONSTRAINT fk_web_account_link_ledger FOREIGN KEY (ledger_id) REFERENCES ledger (id),
  CONSTRAINT fk_web_account_link_web_user FOREIGN KEY (web_user_id) REFERENCES app_user (id),
  CONSTRAINT fk_web_account_link_wechat_user FOREIGN KEY (wechat_user_id) REFERENCES app_user (id)
);
