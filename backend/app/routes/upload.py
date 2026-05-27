import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.image_record_service import create_image_record, image_to_dict
from app.services.remote_storage_service import (
    ALLOWED_IMAGE_EXTENSIONS,
    RemoteStorageError,
    SFTPStorageClient,
    generate_image_filename,
    normalize_image_to_png_bytes,
)

router = APIRouter()


class UploadImageResponse(BaseModel):
    id: int
    preview_url: str
    download_url: str
    message: str
    image: dict | None = None


def upload_file_name(description: str, prompt: str, original_file_name: str) -> str:
    base = prompt.strip() or description.strip()
    if not base:
        raise HTTPException(status_code=400, detail="请填写原始描述或描述扩展，用于生成规范中文文件名")
    ext = os.path.splitext(original_file_name or "")[1].lower() or ".png"
    if ext == ".jpg":
        ext = ".jpeg"
    safe_name = generate_image_filename(description=base, prompt=base)
    stem = os.path.splitext(safe_name)[0]
    return f"{stem}{ext}"


@router.post("/images/upload", response_model=UploadImageResponse)
async def upload_image(
    file: UploadFile = File(..., description="Image file"),
    prompt: str = Form("", description="Image prompt"),
    keywords: str = Form("", description="Image keywords"),
    description: str = Form("", description="Image description"),
    db: Session = Depends(get_db),
):
    """
    上传图片接口。
    数据流：前端上传文件 -> 后端校验并转 PNG -> SFTP 上传 -> 数据库写入 -> 返回后端代理 URL。
    """

    try:
        file_content = await file.read()
        if not file_content:
            raise HTTPException(status_code=400, detail="File is empty")
        if len(file_content) > 50 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File is larger than 50MB")

        file_extension = os.path.splitext(file.filename or "")[1].lower()
        if file_extension not in ALLOWED_IMAGE_EXTENSIONS:
            allowed = ", ".join(sorted(ALLOWED_IMAGE_EXTENSIONS))
            raise HTTPException(status_code=400, detail=f"Unsupported file format. Supported formats: {allowed}")

        png_bytes = normalize_image_to_png_bytes(file_content)
        file_name = upload_file_name(description, prompt, file.filename or "")
        remote_info = SFTPStorageClient().upload_bytes(png_bytes, file_name)
        display_description = prompt.strip() or description.strip()
        db_image = create_image_record(
            db,
            prompt=prompt or display_description,
            description=display_description,
            keywords=keywords,
            remote_info=remote_info,
            source="uploaded",
            status="done",
        )
        image_payload = image_to_dict(db_image)

        return UploadImageResponse(
            id=db_image.id,
            preview_url=image_payload["preview_url"],
            download_url=image_payload["download_url"],
            message="Upload succeeded",
            image=image_payload,
        )
    except HTTPException:
        raise
    except RemoteStorageError as exc:
        print(f"Remote storage error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        print(f"Request error: {exc}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")
