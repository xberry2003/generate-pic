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
from app.services.employee_auth_service import (
    EmployeeAuthError,
    register_employee,
    reset_employee_password,
    verify_employee_login,
)

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class EmployeeLoginRequest(BaseModel):
    name: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    id_card: str
    phone: str
    password: str
    confirm_password: str


class ResetPasswordRequest(BaseModel):
    name: str
    id_card: str
    password: str
    confirm_password: str


def set_login_cookie(response: Response, user: dict):
    username = str(user.get("username") or user.get("name") or "employee")
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=create_session_cookie(username, user),
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=SESSION_MAX_AGE_SECONDS,
        path="/",
    )


def employee_auth_error(response: Response, exc: EmployeeAuthError):
    response.status_code = status.HTTP_401_UNAUTHORIZED
    return {"success": False, "message": exc.message, "code": exc.code}


@router.post("/auth/login")
async def login(request: LoginRequest, response: Response):
    username = request.username.strip()
    try:
        user = verify_employee_login(username, request.password).to_public_dict()
    except EmployeeAuthError:
        user = None

    if user:
        set_login_cookie(response, user)
        return {"success": True, "user": user}

    if not authenticate_admin(username, request.password):
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"success": False, "message": "用户名或密码错误"}

    admin_user = user_payload(username)
    set_login_cookie(response, admin_user)
    return {"success": True, "user": admin_user}


@router.post("/verify-login")
async def verify_login(request: EmployeeLoginRequest, response: Response):
    try:
        user = verify_employee_login(request.name, request.password).to_public_dict()
    except EmployeeAuthError as exc:
        return employee_auth_error(response, exc)
    set_login_cookie(response, user)
    return {"success": True, "user": user}


@router.post("/auth/register")
async def register(request: RegisterRequest, response: Response):
    try:
        user = register_employee(
            request.name,
            request.id_card,
            request.phone,
            request.password,
            request.confirm_password,
        ).to_public_dict()
    except EmployeeAuthError as exc:
        return employee_auth_error(response, exc)
    set_login_cookie(response, user)
    return {"success": True, "user": user}


@router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest, response: Response):
    try:
        reset_employee_password(request.name, request.id_card, request.password, request.confirm_password)
    except EmployeeAuthError as exc:
        return employee_auth_error(response, exc)
    return {"success": True, "message": "密码已重置，请重新登录"}


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
