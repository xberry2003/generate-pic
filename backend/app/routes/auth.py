from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel

from app.services.auth_service import (
    AUTH_COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    authenticate_admin,
    create_session_cookie,
    current_user_from_request,
    user_payload,
)

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
async def login(request: LoginRequest, response: Response):
    username = request.username.strip()
    if not authenticate_admin(username, request.password):
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"success": False, "message": "用户名或密码错误"}

    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=create_session_cookie(username),
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=SESSION_MAX_AGE_SECONDS,
        path="/",
    )
    return {"success": True, "user": user_payload(username)}


@router.get("/auth/me")
async def me(request: Request, response: Response):
    user = current_user_from_request(request)
    if not user:
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"authenticated": False, "message": "未登录或登录已过期"}
    return {"authenticated": True, "user": user}


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key=AUTH_COOKIE_NAME, path="/", httponly=True, samesite="lax")
    return {"success": True}
