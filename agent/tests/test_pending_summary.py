"""待确认草稿上下文格式回归测试。"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.main import format_pending_summary  # noqa: E402


def test_pending_summary_contains_real_values() -> None:
    text = format_pending_summary([
        {
            "id": 7,
            "action_type": "create_transaction",
            "payload": {"amount": "45.00", "note": "买菜"},
        }
    ])

    assert "草稿#7" in text
    assert "create_transaction" in text
    assert "amount=45.00" in text
    assert "note=买菜" in text
    assert "{k}" not in text


def test_pending_summary_is_empty_without_actions() -> None:
    assert format_pending_summary([]) == ""
