import os
from datetime import datetime

import httpx


def _env_bool(name: str, default: bool = True) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


async def report_minimax_usage_event(*, usage_count: int = 1, source: str = "minimax", remark: str = "", user_name: str = "", user_id: str = "") -> None:
    if not _env_bool("KDOCS_USAGE_EVENTS_ENABLED", True):
        return

    product_id = int(os.getenv("KDOCS_MINIMAX_PRODUCT_ID", "73"))
    url = os.getenv(
        "KDOCS_USAGE_EVENTS_URL",
        "https://43.142.31.198/kdocs-sync/api/products/usage-events",
    ).strip()
    timeout_seconds = float(os.getenv("KDOCS_USAGE_EVENTS_TIMEOUT_SECONDS", "5"))
    verify_ssl = _env_bool("KDOCS_USAGE_EVENTS_VERIFY_SSL", False)

    payload = {
        "product_id": product_id,
        "usage_count": max(1, int(usage_count or 1)),
        "source": source,
        "user_name": str(user_name or "").strip(),
        "user_id": str(user_id or "").strip(),
        "remark": remark,
        "occurred_at": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds, verify=verify_ssl) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
    except Exception as exc:
        print(f"KDocs usage event report failed: {exc}")
