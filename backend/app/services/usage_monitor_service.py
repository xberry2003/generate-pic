import os
from datetime import datetime
from time import perf_counter
from typing import Any

from sqlalchemy.orm import Session

from app.models import ApiUsageLog


def usage_user_id(user: dict[str, Any] | None) -> str:
    if not user:
        return "anonymous"
    return str(user.get("id") or user.get("username") or user.get("name") or "anonymous")


def usage_user_name(user: dict[str, Any] | None) -> str:
    if not user:
        return "anonymous"
    return str(user.get("name") or user.get("username") or user.get("id") or "anonymous")


def usage_user_role(user: dict[str, Any] | None) -> str:
    return str((user or {}).get("role") or "")


def new_usage_timer() -> float:
    return perf_counter()


def elapsed_ms(started_at: float) -> int:
    return max(0, int((perf_counter() - started_at) * 1000))


def record_generation_usage(
    db: Session,
    *,
    user: dict[str, Any] | None,
    endpoint: str,
    prompt: str,
    requested_count: int,
    generated_count: int = 0,
    status: str = "success",
    error_message: str = "",
    latency_ms: int | None = None,
) -> ApiUsageLog:
    log = ApiUsageLog(
        user_id=usage_user_id(user),
        user_name=usage_user_name(user),
        user_role=usage_user_role(user),
        endpoint=endpoint,
        provider="minimax",
        model=os.getenv("MINIMAX_MODEL", "image-01"),
        prompt_chars=len(str(prompt or "")),
        requested_count=max(0, int(requested_count or 0)),
        generated_count=max(0, int(generated_count or 0)),
        status=status,
        error_message=str(error_message or "")[:1000],
        latency_ms=latency_ms,
        created_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    return log
