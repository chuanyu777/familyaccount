# Family Ledger Agent Runtime

这是家庭财务助手的 LangChain Runtime。它只负责理解用户意图、选择工具和组织回答，不直接连接 MySQL。

```bash
cd agent
uv sync
OPENAI_API_KEY=... uv run uvicorn app.main:app --reload --port 8090
```

Spring Boot 通过内部工具端点提供账本数据，并负责身份、权限、操作草稿和最终写入。
