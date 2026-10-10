-- AI 助手 MVP：会话、消息、Agent 运行和待确认操作。
-- ledger_id/user_id 暂允许为空，以兼容当前单家庭版本；多租户迁移完成后由应用层强制填充。
CREATE TABLE IF NOT EXISTS assistant_conversation (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT,
  ledger_id  BIGINT,
  title      VARCHAR(255) NOT NULL DEFAULT '家庭财务助手',
  created_at VARCHAR(19) NOT NULL,
  updated_at VARCHAR(19) NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_message (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  role            VARCHAR(16) NOT NULL,
  content         VARCHAR(10000) NOT NULL,
  blocks_json     MEDIUMTEXT,
  created_at      VARCHAR(19) NOT NULL,
  CONSTRAINT fk_assistant_message_conversation
    FOREIGN KEY (conversation_id) REFERENCES assistant_conversation (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assistant_run (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  message_id      BIGINT,
  status          VARCHAR(16) NOT NULL,
  tool_calls_json MEDIUMTEXT,
  error_code      VARCHAR(64),
  started_at      VARCHAR(19) NOT NULL,
  finished_at     VARCHAR(19),
  CONSTRAINT fk_assistant_run_conversation
    FOREIGN KEY (conversation_id) REFERENCES assistant_conversation (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assistant_action (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT NOT NULL,
  run_id          BIGINT,
  action_type     VARCHAR(64) NOT NULL,
  status          VARCHAR(16) NOT NULL,
  payload_json    MEDIUMTEXT NOT NULL,
  result_json     MEDIUMTEXT,
  version         INT NOT NULL DEFAULT 0,
  created_at      VARCHAR(19) NOT NULL,
  expires_at      VARCHAR(19),
  confirmed_at    VARCHAR(19),
  CONSTRAINT fk_assistant_action_conversation
    FOREIGN KEY (conversation_id) REFERENCES assistant_conversation (id) ON DELETE CASCADE
);
