import asyncio
import os
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Image, TeamflowUsageEvent

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env", override=True)


def _enabled(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def tracking_enabled() -> bool:
    return _enabled(os.getenv("IMAGE_LIBRARY_USAGE_TRACKING_ENABLED"))


def _api_base_url() -> str:
    return os.getenv(
        "IMAGE_LIBRARY_USAGE_API_BASE_URL",
        "https://tongjixinzhi.cn/kdocs-sync/api",
    ).rstrip("/")


def _product_id() -> int:
    return int(os.getenv("IMAGE_LIBRARY_USAGE_PRODUCT_ID", "116"))


def _source() -> str:
    return os.getenv("IMAGE_LIBRARY_USAGE_SOURCE", "ai-image-library").strip() or "ai-image-library"


def _occurred_at(value: datetime | None) -> datetime:
    return value or datetime.utcnow()


def queue_image_added_usage(
    db: Session,
    image: Image,
    user: dict | None = None,
) -> str | None:
    """Persist one pending event after a gallery image has been committed."""

    if not tracking_enabled() or not image or image.id is None:
        return None
    event_id = f"ai-image-library:image:{image.id}"
    if db.get(TeamflowUsageEvent, event_id):
        return event_id
    user = user or {}
    user_name = str(user.get("name") or user.get("username") or "图片库用户").strip()
    user_id = str(user.get("id") or user.get("username") or "").strip()
    event = TeamflowUsageEvent(
        event_id=event_id,
        product_id=_product_id(),
        usage_count=1,
        source=_source(),
        user_id=user_id,
        user_name=user_name,
        remark=f"image_added | image:{image.id} | file:{str(image.file_name or '')[:180]}",
        occurred_at=_occurred_at(image.created_at),
        delivery_status="pending",
        delivery_attempts=0,
    )
    db.add(event)
    db.commit()
    return event_id


def _event_payload(event: TeamflowUsageEvent) -> dict:
    occurred_at = _occurred_at(event.occurred_at)
    return {
        "product_id": event.product_id,
        "usage_count": event.usage_count,
        "source": event.source,
        "user_name": event.user_name or "",
        "user_id": event.user_id or "",
        "event_id": event.event_id,
        "remark": event.remark or "",
        "occurred_at": occurred_at.isoformat(timespec="milliseconds") + "Z",
    }


async def deliver_usage_event(event_id: str) -> bool:
    if not tracking_enabled():
        return False
    with SessionLocal() as db:
        event = db.get(TeamflowUsageEvent, event_id)
        if not event or event.delivery_status == "delivered":
            return False
        event.delivery_attempts = int(event.delivery_attempts or 0) + 1
        event.updated_at = datetime.utcnow()
        payload = _event_payload(event)
        db.commit()

    try:
        timeout = max(0.5, float(os.getenv("IMAGE_LIBRARY_USAGE_TIMEOUT_SECONDS", "3")))
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{_api_base_url()}/products/usage-events",
                json=payload,
                headers={"accept": "application/json"},
            )
            response.raise_for_status()
    except Exception as exc:
        with SessionLocal() as db:
            event = db.get(TeamflowUsageEvent, event_id)
            if event:
                event.delivery_status = "failed"
                event.last_error = str(exc)[:500]
                event.updated_at = datetime.utcnow()
                db.commit()
        print(f"[usage] {event_id} delivery failed; it will be retried: {exc}")
        return False

    with SessionLocal() as db:
        event = db.get(TeamflowUsageEvent, event_id)
        if event:
            event.delivery_status = "delivered"
            event.delivered_at = datetime.utcnow()
            event.last_error = ""
            event.updated_at = datetime.utcnow()
            db.commit()
    return True


async def retry_pending_usage_events() -> int:
    if not tracking_enabled():
        return 0
    with SessionLocal() as db:
        event_ids = [
            row[0]
            for row in (
                db.query(TeamflowUsageEvent.event_id)
                .filter(TeamflowUsageEvent.delivery_status != "delivered")
                .order_by(TeamflowUsageEvent.created_at)
                .limit(100)
                .all()
            )
        ]
    delivered = 0
    for event_id in event_ids:
        if await deliver_usage_event(event_id):
            delivered += 1
    return delivered


async def usage_retry_loop() -> None:
    while True:
        try:
            await retry_pending_usage_events()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            print(f"[usage] retry loop failed: {exc}")
        await asyncio.sleep(300)
