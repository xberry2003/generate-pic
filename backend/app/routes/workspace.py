from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Image, WorkspaceRow
from app.routes.images import build_thumbnail_url
from app.services.auth_service import require_auth
from app.services.remote_storage_service import RemoteStorageError, SFTPStorageClient

router = APIRouter()


class WorkspaceRowPayload(BaseModel):
    rowKey: str | None = ""
    originalPrompt: str = ""
    expandedPrompt: str = ""
    expandedPromptTouched: bool = False
    keywords: str | list[str] = Field(default_factory=list)
    count: int = 1
    status: str = "idle"
    uploaded: bool = False
    cosKey: str = ""
    previewUrl: str = ""
    downloadUrl: str = ""
    dbId: int | None = None
    errorMessage: str = ""
    generationPromptSnapshot: str = ""
    generatedAt: str | None = None
    createdAt: str | None = None


class BulkSavePayload(BaseModel):
    rows: list[WorkspaceRowPayload] = Field(default_factory=list)


def user_id_from_auth(user: dict[str, str]) -> str:
    return str(user.get("username") or "admin")


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def keywords_to_text(keywords: str | list[str]) -> str:
    if isinstance(keywords, list):
        return ",".join(str(keyword).strip() for keyword in keywords if str(keyword).strip())
    return str(keywords or "")


def row_to_dict(row: WorkspaceRow) -> dict[str, Any]:
    thumbnail_url = build_thumbnail_url(row.cos_key or "")
    return {
        "id": row.id,
        "rowKey": row.row_key or f"draft-{row.id}",
        "originalPrompt": row.original_prompt or "",
        "expandedPrompt": row.expanded_prompt or "",
        "description": row.expanded_prompt or "",
        "expandedPromptTouched": bool(row.expanded_prompt_touched),
        "keywords": row.keywords or "",
        "count": row.count or 1,
        "status": row.status or "idle",
        "uploaded": bool(row.uploaded),
        "cosKey": row.cos_key or "",
        "thumbnailUrl": thumbnail_url,
        "thumbnail_url": thumbnail_url,
        "previewUrl": row.preview_url or "",
        "downloadUrl": row.download_url or "",
        "dbId": row.image_db_id,
        "errorMessage": row.error_message or "",
        "generationPromptSnapshot": row.generation_prompt_snapshot or "",
        "generatedAt": row.generated_at.isoformat() if row.generated_at else "",
        "createdAt": row.created_at.isoformat() if row.created_at else "",
        "updatedAt": row.updated_at.isoformat() if row.updated_at else "",
    }


def apply_payload(row: WorkspaceRow, payload: WorkspaceRowPayload) -> WorkspaceRow:
    row.row_key = payload.rowKey or row.row_key
    row.original_prompt = payload.originalPrompt or ""
    row.expanded_prompt = payload.expandedPrompt or ""
    row.expanded_prompt_touched = 1 if payload.expandedPromptTouched else 0
    row.keywords = keywords_to_text(payload.keywords)
    row.count = max(1, int(payload.count or 1))
    row.status = payload.status or "idle"
    row.uploaded = 1 if payload.uploaded else 0
    row.cos_key = payload.cosKey or ""
    row.preview_url = payload.previewUrl or ""
    row.download_url = payload.downloadUrl or ""
    row.image_db_id = payload.dbId
    row.error_message = payload.errorMessage or ""
    row.generation_prompt_snapshot = payload.generationPromptSnapshot or ""
    row.generated_at = parse_datetime(payload.generatedAt)
    row.updated_at = datetime.utcnow()
    return row


def validate_delete_cos_key(storage: SFTPStorageClient, cos_key: str) -> str:
    clean_key = (cos_key or "").strip().lstrip("/")
    prefix = storage.config.get("cos_key_prefix", "").strip("/")
    if not clean_key or ".." in clean_key.split("/"):
        raise HTTPException(status_code=400, detail="无效的 COS 图片路径")
    if prefix:
        if clean_key == prefix or clean_key == f"{prefix}/":
            raise HTTPException(status_code=400, detail="拒绝删除整个图片目录")
        if not clean_key.startswith(f"{prefix}/"):
            raise HTTPException(status_code=403, detail="COS 图片路径不在允许目录内")
    return clean_key


@router.get("/workspace/rows")
async def list_workspace_rows(
    user: dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(WorkspaceRow)
        .filter(WorkspaceRow.user_id == user_id_from_auth(user))
        .order_by(WorkspaceRow.created_at.asc(), WorkspaceRow.id.asc())
        .all()
    )
    return {"success": True, "rows": [row_to_dict(row) for row in rows]}


@router.post("/workspace/rows", status_code=status.HTTP_201_CREATED)
async def create_workspace_row(
    payload: WorkspaceRowPayload,
    user: dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    row = WorkspaceRow(
        user_id=user_id_from_auth(user),
        row_key=payload.rowKey or "",
        created_at=parse_datetime(payload.createdAt) or now,
        updated_at=now,
    )
    apply_payload(row, payload)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"success": True, "row": row_to_dict(row)}


@router.put("/workspace/rows/{row_id}")
async def update_workspace_row(
    row_id: int,
    payload: WorkspaceRowPayload,
    user: dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    row = (
        db.query(WorkspaceRow)
        .filter(WorkspaceRow.id == row_id, WorkspaceRow.user_id == user_id_from_auth(user))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Workspace row not found")
    apply_payload(row, payload)
    db.commit()
    db.refresh(row)
    return {"success": True, "row": row_to_dict(row)}


@router.delete("/workspace/rows/{row_id}")
async def delete_workspace_row(
    row_id: int,
    user: dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    row = (
        db.query(WorkspaceRow)
        .filter(WorkspaceRow.id == row_id, WorkspaceRow.user_id == user_id_from_auth(user))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Workspace row not found")

    image = None
    if row.image_db_id:
        image = db.query(Image).filter(Image.id == row.image_db_id).first()
    if not image and row.cos_key:
        image = db.query(Image).filter(Image.remote_path == row.cos_key).first()

    storage = SFTPStorageClient()
    raw_cos_key = row.cos_key or (image.remote_path if image else "")
    cos_key = ""
    deleted_cos_object = False
    cos_object_missing = False
    if raw_cos_key:
        cos_key = validate_delete_cos_key(storage, raw_cos_key)
        try:
            if storage.config.get("provider") == "cos" and not storage.cos_object_exists(cos_key):
                cos_object_missing = True
            else:
                storage.delete_file(cos_key)
                deleted_cos_object = True
        except RemoteStorageError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"COS 图片删除失败，工作台记录未删除：{exc}",
            ) from exc

    deleted_image_record = False
    if image:
        db.delete(image)
        deleted_image_record = True
    db.delete(row)
    db.commit()
    return {
        "success": True,
        "deletedWorkspaceRow": True,
        "deletedCosObject": deleted_cos_object,
        "cosObjectMissing": cos_object_missing,
        "deletedImageRecord": deleted_image_record,
        "cosKey": cos_key,
    }


@router.post("/workspace/rows/bulk-save")
async def bulk_save_workspace_rows(
    payload: BulkSavePayload,
    user: dict[str, str] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    user_id = user_id_from_auth(user)
    existing_rows = db.query(WorkspaceRow).filter(WorkspaceRow.user_id == user_id).all()
    by_row_key = {row.row_key: row for row in existing_rows if row.row_key}
    saved_rows = []
    for item in payload.rows:
        row = by_row_key.get(item.rowKey or "")
        if not row:
            row = WorkspaceRow(user_id=user_id, row_key=item.rowKey or "", created_at=datetime.utcnow())
            db.add(row)
        apply_payload(row, item)
        saved_rows.append(row)
    db.commit()
    for row in saved_rows:
        db.refresh(row)
    return {"success": True, "rows": [row_to_dict(row) for row in saved_rows]}
