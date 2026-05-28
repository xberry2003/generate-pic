import base64
import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request, status
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env", override=True)

AUTH_COOKIE_NAME = "generate_pic_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7


def admin_credentials() -> tuple[str, str]:
    return (
        os.getenv("ADMIN_USERNAME", "admin").strip() or "admin",
        os.getenv("ADMIN_PASSWORD", "").strip(),
    )


def session_secret() -> str:
    secret = os.getenv("AUTH_SECRET_KEY", "").strip()
    if secret:
        return secret
    username, password = admin_credentials()
    return hashlib.sha256(f"{username}:{password}:generate-pic".encode("utf-8")).hexdigest()


def user_payload(username: str) -> dict[str, str]:
    return {"username": username, "role": "admin"}


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}")


def create_session_cookie(username: str) -> str:
    payload = {
        "username": username,
        "role": "admin",
        "exp": int(time.time()) + SESSION_MAX_AGE_SECONDS,
    }
    payload_text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    encoded_payload = _b64encode(payload_text.encode("utf-8"))
    signature = hmac.new(
        session_secret().encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{encoded_payload}.{signature}"


def parse_session_cookie(cookie_value: str | None) -> dict[str, Any] | None:
    if not cookie_value or "." not in cookie_value:
        return None
    encoded_payload, signature = cookie_value.rsplit(".", 1)
    expected_signature = hmac.new(
        session_secret().encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        return None
    try:
        payload = json.loads(_b64decode(encoded_payload).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


def authenticate_admin(username: str, password: str) -> bool:
    admin_username, admin_password = admin_credentials()
    if not admin_password:
        return False
    return hmac.compare_digest(username, admin_username) and hmac.compare_digest(password, admin_password)


def current_user_from_request(request: Request) -> dict[str, str] | None:
    payload = parse_session_cookie(request.cookies.get(AUTH_COOKIE_NAME))
    if not payload:
        return None
    return user_payload(str(payload.get("username") or "admin"))


def require_auth(request: Request) -> dict[str, str]:
    user = current_user_from_request(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "未登录或登录已过期"},
        )
    return user
