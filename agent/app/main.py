import os
import re
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
from langchain.tools import tool
from pydantic import BaseModel, Field

SPRING_BASE_URL = os.getenv("SPRING_BASE_URL", "http://localhost:8080")
MODEL_NAME = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

MONTH_PATTERN = re.compile(r"\d{4}-(0[1-9]|1[0-2])")


def normalize_month(value: str | None, fallback: str | None) -> str | None:
    """月份只接受 YYYY-MM。

    模型可能给出「本月」「2026年10月」这类自由文本，直接透传给后端会命中
    month 校验并返回 400，因此在工具边界做一次收口，非法值回退到上下文月份。
    """
    if value:
        candidate = value.strip()
        if MONTH_PATTERN.fullmatch(candidate):
            return candidate
    return fallback


class RunContext(BaseModel):
    run_id: str
    user_id: int | None = None
    ledger_id: int | None = None
    month: str | None = None


class ChatMessage(BaseModel):
    role: str
    content: str


class RunRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    context: RunContext


class ToolGateway:
    async def call(self, name: str, context: RunContext, params: dict[str, Any] | None = None) -> Any:
        headers = {"X-Assistant-Run-Id": context.run_id}
        if token := os.getenv("ASSISTANT_INTERNAL_TOKEN"):
            headers["X-Assistant-Internal-Token"] = token
        if context.ledger_id is not None:
            headers["X-Assistant-Ledger-Id"] = str(context.ledger_id)
        async with httpx.AsyncClient(base_url=SPRING_BASE_URL, timeout=15) as client:
            response = await client.post(
                f"/api/assistant/internal/tools/{name}",
                json={"context": context.model_dump(), "params": params or {}},
                headers=headers,
            )
            response.raise_for_status()
            return response.json()


gateway = ToolGateway()


def build_agent(context: RunContext):
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is required")
    @tool
    async def get_period_summary(month: str | None = None) -> Any:
        """查询指定月份的收入、支出和结余。month 必须形如 YYYY-MM（如 2026-10），不确定就省略。"""
        return await gateway.call("get_period_summary", context,
                                  {"month": normalize_month(month, context.month)})

    @tool
    async def get_category_breakdown(month: str | None = None) -> Any:
        """查询指定月份的支出分类。month 必须形如 YYYY-MM（如 2026-10），不确定就省略。"""
        return await gateway.call("get_category_breakdown", context,
                                  {"month": normalize_month(month, context.month)})

    @tool
    async def list_accounts() -> Any:
        """查询账本账户和余额。"""
        return await gateway.call("list_accounts", context)

    @tool
    async def get_ledger_overview() -> Any:
        """查询家庭资产、负债和净资产概览。"""
        return await gateway.call("get_ledger_overview", context)

    system = (
        "你是家庭财务助手，只能查询当前账本的收支、分类、账户和资产负债。"
        "回答简洁、使用中文；查询必须调用工具，不能猜测金额。"
        "你没有创建、修改或删除账目的能力，也不存在「已存入草稿」这类动作；"
        "用户要求记账时，如实说明你目前只能查询，并引导他到记账页面手工录入。"
    )
    return create_agent(
        model=ChatOpenAI(
            model=MODEL_NAME,
            api_key=api_key,
            base_url=DEEPSEEK_BASE_URL,
            temperature=0,
        ),
        tools=[get_period_summary, get_category_breakdown, list_accounts, get_ledger_overview],
        system_prompt=system,
    )


app = FastAPI(title="Family Ledger Agent Runtime", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/runs")
async def run(request: RunRequest) -> dict[str, Any]:
    try:
        agent = build_agent(request.context)
        result = await agent.ainvoke(
            {"messages": [{"role": m.role, "content": m.content} for m in request.messages]},
            context=request.context.model_dump(),
        )
        messages = result.get("messages", [])
        last = messages[-1] if messages else None
        content = getattr(last, "content", "") if last is not None else ""
        return {"runId": request.context.run_id, "content": content, "messages": messages}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="业务工具服务不可用") from exc
