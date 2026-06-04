from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApiUsageLog
from app.services.employee_auth_service import connect_employee_db, normalize_text

router = APIRouter()


def parse_day(value: str | None, default: date) -> date:
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD") from exc


def day_bounds(start_date: date, end_date: date) -> tuple[datetime, datetime]:
    return datetime.combine(start_date, time.min), datetime.combine(end_date + timedelta(days=1), time.min)


def fetch_employee_users() -> dict[str, dict[str, Any]]:
    users: dict[str, dict[str, Any]] = {}
    try:
        with connect_employee_db() as connection:
            rows = connection.execute("SELECT id, name, type FROM employees ORDER BY id ASC").fetchall()
    except Exception:
        return users

    for row in rows:
        user_id = str(row["id"])
        name = normalize_text(row["name"])
        users[user_id] = {
            "userId": user_id,
            "userName": name or user_id,
            "userType": normalize_text(row["type"]),
        }
    return users


def empty_metrics() -> dict[str, Any]:
    return {
        "requestCount": 0,
        "successCount": 0,
        "failedCount": 0,
        "requestedImages": 0,
        "generatedImages": 0,
        "avgLatencyMs": 0,
    }


@router.get("/admin/usage/daily")
async def daily_usage(
    start: str | None = Query(default=None),
    end: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    today = date.today()
    start_date = parse_day(start, today - timedelta(days=6))
    end_date = parse_day(end, today)
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="End date cannot be earlier than start date")
    if (end_date - start_date).days > 92:
        raise HTTPException(status_code=400, detail="Usage range cannot exceed 93 days")

    start_at, end_at = day_bounds(start_date, end_date)
    day_expr = func.date(ApiUsageLog.created_at)
    rows = (
        db.query(
            day_expr.label("day"),
            ApiUsageLog.user_id,
            ApiUsageLog.user_name,
            ApiUsageLog.user_role,
            func.count(ApiUsageLog.id).label("request_count"),
            func.sum(case((ApiUsageLog.status == "success", 1), else_=0)).label("success_count"),
            func.sum(case((ApiUsageLog.status != "success", 1), else_=0)).label("failed_count"),
            func.coalesce(func.sum(ApiUsageLog.requested_count), 0).label("requested_images"),
            func.coalesce(func.sum(ApiUsageLog.generated_count), 0).label("generated_images"),
            func.coalesce(func.avg(ApiUsageLog.latency_ms), 0).label("avg_latency_ms"),
        )
        .filter(ApiUsageLog.created_at >= start_at, ApiUsageLog.created_at < end_at)
        .group_by(day_expr, ApiUsageLog.user_id, ApiUsageLog.user_name, ApiUsageLog.user_role)
        .order_by(day_expr.desc(), ApiUsageLog.user_name.asc())
        .all()
    )

    employees = fetch_employee_users()
    per_user: dict[tuple[str, str], dict[str, Any]] = {}
    totals = empty_metrics()
    by_day: dict[str, dict[str, Any]] = {}

    for row in rows:
        day = str(row.day)
        user_id = str(row.user_id)
        key = (day, user_id)
        metrics = {
            "requestCount": int(row.request_count or 0),
            "successCount": int(row.success_count or 0),
            "failedCount": int(row.failed_count or 0),
            "requestedImages": int(row.requested_images or 0),
            "generatedImages": int(row.generated_images or 0),
            "avgLatencyMs": int(row.avg_latency_ms or 0),
        }
        employee = employees.get(user_id, {})
        per_user[key] = {
            "date": day,
            "userId": user_id,
            "userName": row.user_name or employee.get("userName") or user_id,
            "userType": employee.get("userType") or row.user_role or "",
            **metrics,
        }
        for metric_key in ("requestCount", "successCount", "failedCount", "requestedImages", "generatedImages"):
            totals[metric_key] += metrics[metric_key]
        day_metrics = by_day.setdefault(day, {"date": day, **empty_metrics()})
        for metric_key in ("requestCount", "successCount", "failedCount", "requestedImages", "generatedImages"):
            day_metrics[metric_key] += metrics[metric_key]

    day_cursor = start_date
    daily_rows = []
    while day_cursor <= end_date:
        day = day_cursor.isoformat()
        daily_rows.append(by_day.get(day, {"date": day, **empty_metrics()}))
        for employee_id, employee in employees.items():
            per_user.setdefault(
                (day, employee_id),
                {
                    "date": day,
                    **employee,
                    **empty_metrics(),
                },
            )
        day_cursor += timedelta(days=1)

    if totals["requestCount"]:
        latency_total = sum(row["avgLatencyMs"] * row["requestCount"] for row in per_user.values())
        totals["avgLatencyMs"] = int(latency_total / totals["requestCount"])

    user_rows = sorted(per_user.values(), key=lambda item: (item["date"], item["userName"]), reverse=True)
    return {
        "success": True,
        "range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "totals": totals,
        "daily": daily_rows,
        "users": user_rows,
    }
