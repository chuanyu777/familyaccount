# 家庭财务助手 MVP 技术设计

## 状态

技术基线，基于 LangChain / LangGraph 术语设计，待进入实现。

## 1. 设计结论

MVP 使用 LangChain `create_agent` 和自定义财务 Tools；Spring Boot 负责身份、账本权限、助手业务状态和真正的财务写入。暂不使用 Deep Agents，也不在 MVP 中依赖 LangGraph 跨服务 `interrupt()` 恢复。

用户确认由 Spring 的 `assistant_action` 状态机持久化完成。这样助手运行可以在生成记账草稿后结束，用户稍后确认时由 Spring 继续执行，避免 Agent 服务额外引入持久化 Checkpointer、恢复和补偿链路。

## 2. 系统边界

```text
Web 特殊账本 ─┐
              ├─ Spring Boot Assistant API ── MySQL
微信小程序 ───┘            │
                           ▼
                    Python Agent Service
                    LangChain create_agent
                           │
                           ▼
                    Spring 内部 Tool API
```

- Web 和小程序只负责消息展示、页面上下文和操作确认。
- Spring Boot 是身份、账本和财务数据的唯一权威。
- Python Agent Service 负责模型调用、Tool Calling 和回答组织。
- Agent Service 不连接 MySQL，不拥有财务数据库凭证。
- 所有写入继续调用现有 `LedgerService`、`RepaymentService` 等领域服务。

当前多租户身份、账本隔离和小程序基础设施尚未完全落地，应先完成这些基础能力，再接入助手。

## 3. LangChain / LangGraph 映射

| 业务设计 | 框架术语 |
| --- | --- |
| 查询能力 | LangChain Tool |
| Agent 循环 | `create_agent` 的模型-工具循环 |
| 对话会话 | `thread_id` / conversation id |
| Agent 上下文 | `ToolRuntime.context` |
| 用户和账本身份 | Runtime Context，不进入模型参数 |
| 待确认记账 | 应用层 Human-in-the-loop 状态 |
| 后续复杂暂停恢复 | LangGraph `interrupt()` + Checkpointer（后续阶段） |
| Agent 调用日志 | LangSmith Trace + 本地 `assistant_run` |

`create_agent` 已经使用 LangGraph 的运行模型；MVP 不需要手写完整 `StateGraph`。如果以后出现长时间、多步骤任务，再升级为显式 Graph。

## 4. Agent Service

```python
@dataclass
class LedgerContext:
    run_id: str
    user_id: int
    ledger_id: int
    role: str
    timezone: str
    client_type: str
    page: str | None
    month: str | None
    tool_session_token: str


ledger_agent = create_agent(
    model=model,
    tools=[
        get_ledger_overview,
        get_period_summary,
        compare_periods,
        get_category_breakdown,
        search_transactions,
        list_accounts,
        list_categories,
        get_assets,
        get_liabilities,
        propose_create_transaction,
    ],
    system_prompt=FAMILY_LEDGER_SYSTEM_PROMPT,
    context_schema=LedgerContext,
    response_format=AssistantResponse,
)
```

建议加入以下 Middleware：

- Tool 调用次数限制：每轮最多 6 次。
- 同参数重复调用限制。
- 模型超时和 429/5xx 重试。
- Tool 错误标准化。
- 根据 Runtime Context 过滤工具。
- 记录模型、延迟、Token 和 Tool 调用信息。

## 5. Runtime Context 和安全边界

Spring 每次 Agent Turn 签发短期 Tool Session Token：

```json
{
  "aud": "family-ledger-agent-tools",
  "runId": "run_abc123",
  "userId": 21,
  "ledgerId": 8,
  "role": "MEMBER",
  "exp": 1791526200
}
```

Token 有效期建议 2～5 分钟，只允许调用当前账本的内部 Tool API。Token 不进入 Prompt，不存入消息，也不能由模型修改。

每个内部 Tool API 必须重新验证：

1. Token 签名和过期时间。
2. 当前用户是否仍是账本成员。
3. 请求对象是否属于当前账本。
4. 当前角色是否允许该操作。

## 6. Tools

### 6.1 查询 Tools

```text
get_ledger_overview
get_period_summary
compare_periods
get_category_breakdown
search_transactions
list_accounts
list_categories
get_assets
get_liabilities
```

这些 Tool 全部只读。金额计算、比例计算、时间范围解析和数量限制由 Spring 业务层完成。

`search_transactions` 至少支持：起止日期、收支类型、账户、分类、金额上下限、备注关键词、排序和 limit。

### 6.2 写入 Tool

MVP 只有：

```text
propose_create_transaction
```

它只创建 `assistant_action` 草稿，不创建真实交易。Tool 需要调用 Spring 内部接口校验账户、分类、金额和账本归属。

## 7. 结构化回复协议

Agent 不返回 HTML，返回结构化 Blocks：

```json
{
  "messageId": 301,
  "blocks": [
    {
      "type": "text",
      "text": "我整理成了下面这笔支出。"
    },
    {
      "type": "transaction_draft",
      "actionId": 1082,
      "version": 1,
      "fields": {
        "type": "expense",
        "amount": "36.00",
        "occurredOn": "2026-10-08",
        "accountName": "招行卡",
        "categoryName": "交通",
        "note": "打车"
      },
      "inferredFields": ["occurredOn", "categoryId"]
    }
  ]
}
```

客户端支持的 Block：

- `text`
- `metrics`
- `transaction_list`
- `transaction_draft`
- `action_result`
- `error`

Web 和小程序各自渲染同一协议，避免维护两套 Agent 输出格式。

## 8. 请求流程

### 8.1 查询

```text
客户端 POST 消息
→ Spring 验证用户和账本
→ Spring 保存用户消息并签发 Tool Token
→ Agent 调用查询 Tools
→ Tools 通过内部 API 查询 Spring
→ Agent 返回结构化 Blocks
→ Spring 保存助手消息
→ 客户端渲染
```

### 8.2 记账

```text
用户自然语言
→ Agent 调用 list_accounts / list_categories
→ Agent 调用 propose_create_transaction
→ Spring 创建 PROPOSED assistant_action
→ 客户端显示确认卡
→ 用户修改或确认
→ Spring 锁定 assistant_action
→ Spring 调用 LedgerService
→ assistant_action 标记 EXECUTED
→ 客户端刷新账目、账户和统计
```

草稿生成后 Agent Turn 结束。确认不需要恢复原 Agent Graph。

## 9. Assistant API

```text
POST /api/ledgers/{ledgerId}/assistant/conversations
GET  /api/ledgers/{ledgerId}/assistant/conversations/{id}
GET  /api/ledgers/{ledgerId}/assistant/conversations/{id}/messages
POST /api/ledgers/{ledgerId}/assistant/conversations/{id}/messages

GET   /api/ledgers/{ledgerId}/assistant/actions/{id}
PATCH /api/ledgers/{ledgerId}/assistant/actions/{id}
POST  /api/ledgers/{ledgerId}/assistant/actions/{id}/confirm
POST  /api/ledgers/{ledgerId}/assistant/actions/{id}/cancel
```

消息请求：

```json
{
  "requestId": "client-generated-idempotency-key",
  "text": "昨晚打车 36 块，从招行卡出",
  "context": {
    "page": "accounting",
    "month": "2026-10"
  }
}
```

客户端上下文只帮助理解页面，不是权限凭证。

## 10. 数据表

### `assistant_conversation`

```text
id, ledger_id, user_id, title, client_type,
status, created_at, updated_at
```

### `assistant_message`

```text
id, conversation_id, role, text, blocks_json,
request_id, created_at
```

`conversation_id + request_id` 建唯一约束，避免网络重试重复运行。

### `assistant_action`

```text
id, conversation_id, source_message_id,
ledger_id, user_id, action_type, status,
payload_json, preview_json, inferred_fields_json,
version, expires_at, result_json,
created_at, updated_at, executed_at
```

状态：`PROPOSED`、`EXECUTED`、`CANCELLED`、`EXPIRED`。

### `assistant_run`

```text
id, conversation_id, request_id, status,
model_name, tool_call_count, latency_ms,
input_tokens, output_tokens, error_code,
created_at, finished_at
```

JSON 先用 `TEXT` 存储，以保持 MySQL/H2 测试兼容。

## 11. 幂等和并发

- 消息：`conversation_id + request_id` 唯一。
- 草稿：`run_id + tool_call_id` 唯一。
- 确认：`SELECT ... FOR UPDATE` 锁定 `assistant_action`。
- 确认必须携带 `version`，版本过期返回冲突。
- 已执行的 Action 重复确认时返回原 `result_json`。
- 所有真实财务写入继续由现有事务 Service 完成。

## 12. 客户端组织

Web：

```text
web/src/features/assistant/
  AssistantLauncher.vue
  AssistantPanel.vue
  AssistantMessageList.vue
  AssistantComposer.vue
  AssistantBlockRenderer.vue
  blocks/
  useAssistant.ts
  types.ts
```

助手入口放在 `AppShell`，成功记账后复用现有 `resourceInvalidation` 刷新 transactions、accounts 和 statistics。

小程序：

```text
mini/components/assistant-launcher/
mini/components/assistant-action-card/
mini/components/assistant-block-renderer/
mini/pages/assistant/index.*
mini/services/assistant.ts
mini/lib/assistant-store.ts
```

会话绑定当前 `ledgerId`。切换账本时清理助手上下文，防止跨账本串数据。

## 13. 传输和部署

MVP 使用普通 HTTP 请求，不做逐 Token 流式输出。两个客户端先保持一致的请求/响应行为；以后需要实时进度时再引入 SSE 或小程序分块传输。

部署新增 Agent Service：

```text
mysql
app       Spring Boot
web       Nginx + Vue
agent     Python + LangChain
```

Agent Service 只在内部网络访问，持有模型 API Key，不持有 MySQL 凭证。单次 Agent Turn 超时建议 20 秒。

## 14. 测试策略

- Tool 单测：账本隔离、权限、参数校验、金额和数量限制。
- Agent 行为测试：正确选 Tool、歧义时追问、草稿不冒充已保存。
- Spring 集成测试：草稿不改余额、确认只写一笔、重复确认幂等、版本冲突、跨账本拒绝。
- 前端测试：Block 渲染、确认卡编辑、确认/取消、资源刷新。
- 端到端测试：自然语言输入 → 草稿 → 修改 → 确认 → 账目和统计更新。

## 15. 实施顺序

1. 完成多租户身份、账本隔离和特殊 Web 会话基础。
2. 新增 Assistant 数据表和 Spring API。
3. 建立 Python Agent Service 和 Tool Session Token。
4. 实现只读 Tools 和查询对话。
5. 实现 `propose_create_transaction`。
6. 实现 Action 编辑、确认、取消、过期和幂等。
7. 接入 Web。
8. 接入小程序。
9. 增加评测、成本和延迟监控。
