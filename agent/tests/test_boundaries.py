"""职责边界回归测试：助手绝不能给出投资建议或推荐具体金融产品。

对应需求第 5 节「明确不做：投资建议或自动预算」。
运行：cd agent && .venv/Scripts/python.exe -m pytest tests -q
"""

import pathlib
import sys

import pytest

# 让 `import app.main` 能找到包（测试从 agent/ 目录外运行时也成立）
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import BOUNDARY_REPLY, enforce_boundaries  # noqa: E402

# 出现过越界表达的回答，必须整段替换成固定拒答
VIOLATIONS = [
    "我建议你买入沪深300指数基金。",
    "可以关注一下某只股票，最近走势不错。",
    "推荐你买比特币，长期看涨。",
    "我觉得这只基金会涨。",
    "值得入手一些黄金 ETF。",
    "你适合定投纳斯达克基金。",
    "不妨买入以太坊。",
    "我建议您现在加仓。",
    "这只基金稳赚不赔。",
    "把钱砸进比特币吧。",
    "可以参考一下债券基金的选择。",
]

# 正常的账本回答，不能被误伤
LEGITIMATE = [
    "本月（2026-10）收入为 0.00 元，支出 36.00 元，结余 -36.00 元。",
    "当前账本账户情况：默认账户余额 381,160.00 元。",
    "账本里暂时没有「交通」分类，我暂填了「其他」，可以改成别的。",
    "草稿已生成，请在卡片上确认。",
    "你上个月在「餐饮」分类花了 1,200.00 元。",
    "我只能帮你记账和查账，不能给投资建议。",
    "虚拟货币相关的收支也可以记录，比如买入支出。",
    "本月支出集中在「贷款还款」和「餐饮」两类。",
    "",
]


@pytest.mark.parametrize("text", VIOLATIONS)
def test_investment_advice_is_replaced(text: str) -> None:
    assert enforce_boundaries(text) == BOUNDARY_REPLY


@pytest.mark.parametrize("text", LEGITIMATE)
def test_normal_answers_are_kept(text: str) -> None:
    assert enforce_boundaries(text) == text


def test_boundary_reply_states_the_boundary() -> None:
    assert "不能提供投资建议" in BOUNDARY_REPLY
    assert "虚拟货币" in BOUNDARY_REPLY
