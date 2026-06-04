import os
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env", override=True)

DEFAULT_EMPLOYEE_DB_PATH = "/www/wwwroot/auth-system/data/employees.db"


class EmployeeAuthError(Exception):
    def __init__(self, message: str, code: str = "auth_error"):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass
class EmployeeUser:
    id: int
    name: str
    type: str

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "username": self.name,
            "type": self.type,
            "role": "employee",
        }


def employee_db_path() -> str:
    return os.getenv("EMPLOYEE_DB_PATH", DEFAULT_EMPLOYEE_DB_PATH).strip() or DEFAULT_EMPLOYEE_DB_PATH


def connect_employee_db() -> sqlite3.Connection:
    path = employee_db_path()
    if not os.path.exists(path):
        raise EmployeeAuthError("员工数据库不存在，请检查 EMPLOYEE_DB_PATH", "database_missing")
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    return connection


def normalize_text(value: str | None) -> str:
    return str(value or "").strip()


def employee_to_user(row: sqlite3.Row) -> EmployeeUser:
    return EmployeeUser(
        id=int(row["id"]),
        name=normalize_text(row["name"]),
        type=normalize_text(row["type"]) or "正式员工",
    )


def get_employee_by_name(name: str) -> sqlite3.Row | None:
    with connect_employee_db() as connection:
        return connection.execute("SELECT * FROM employees WHERE name = ?", (normalize_text(name),)).fetchone()


def parse_date(value: str | None) -> date | None:
    raw = normalize_text(value)
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw).date()
    except ValueError:
        return None


def ensure_not_expired(row: sqlite3.Row) -> None:
    if normalize_text(row["type"]) != "实习生":
        return
    expiry = parse_date(row["expiry_date"])
    if expiry and expiry < date.today():
        raise EmployeeAuthError("您的账号已到期，请联系管理员续约", "expired")


def verify_employee_login(name: str, password: str) -> EmployeeUser:
    row = get_employee_by_name(name)
    if not row:
        raise EmployeeAuthError("公司员工中未找到该姓名", "not_found")
    saved_password = normalize_text(row["password"])
    if not saved_password:
        raise EmployeeAuthError("您尚未注册，请先注册", "not_registered")
    if saved_password != str(password or ""):
        raise EmployeeAuthError("密码错误", "wrong_password")
    ensure_not_expired(row)
    return employee_to_user(row)


def validate_id_card(id_card: str) -> str:
    value = normalize_text(id_card)
    if len(value) not in (15, 18):
        raise EmployeeAuthError("身份证号位数不正确", "invalid_id_card_length")
    return value


def register_employee(name: str, id_card: str, phone: str, password: str, confirm_password: str) -> EmployeeUser:
    if str(password or "") != str(confirm_password or ""):
        raise EmployeeAuthError("两次密码不一致", "password_mismatch")
    row = get_employee_by_name(name)
    if not row:
        raise EmployeeAuthError("公司员工中未找到该姓名", "not_found")
    if normalize_text(row["id_card"]) != validate_id_card(id_card):
        raise EmployeeAuthError("身份证号错误", "wrong_id_card")
    if normalize_text(row["phone"]) != normalize_text(phone):
        raise EmployeeAuthError("手机号错误", "wrong_phone")
    ensure_not_expired(row)
    employee_id = int(row["id"])
    with connect_employee_db() as connection:
        connection.execute(
            "UPDATE employees SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (str(password or ""), employee_id),
        )
        connection.commit()
        updated = connection.execute("SELECT * FROM employees WHERE id = ?", (employee_id,)).fetchone()
    return employee_to_user(updated)


def reset_employee_password(name: str, id_card: str, password: str, confirm_password: str) -> EmployeeUser:
    if str(password or "") != str(confirm_password or ""):
        raise EmployeeAuthError("两次新密码不一致", "password_mismatch")
    with connect_employee_db() as connection:
        row = connection.execute(
            "SELECT * FROM employees WHERE name = ? AND id_card = ?",
            (normalize_text(name), validate_id_card(id_card)),
        ).fetchone()
        if not row:
            raise EmployeeAuthError("姓名或身份证号错误", "wrong_identity")
        ensure_not_expired(row)
        connection.execute(
            "UPDATE employees SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (str(password or ""), int(row["id"])),
        )
        connection.commit()
        updated = connection.execute("SELECT * FROM employees WHERE id = ?", (int(row["id"]),)).fetchone()
    return employee_to_user(updated)
