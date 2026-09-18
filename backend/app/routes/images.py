import os
import posixpath
import io
import hashlib
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from PIL import Image as PILImage
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Image as ImageModel
from app.services.auth_service import require_admin, require_auth
from app.services.image_generation_service import get_full_image_path
from app.services.image_record_service import image_to_dict, sync_remote_files_to_db
from app.services.remote_storage_service import RemoteStorageError, SFTPStorageClient, description_from_filename

router = APIRouter()
THUMBNAIL_SIZE = (640, 360)
THUMBNAIL_CACHE_DIR = Path(os.getenv(
    "THUMBNAIL_CACHE_DIR",
    Path(__file__).resolve().parents[2] / "data" / "thumbnails",
))


class ImageMetadataUpdateRequest(BaseModel):
    originalPrompt: str = ""
    expandedPrompt: str = ""
    keywords: str | list[str] = ""


class ImageRenameRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


def mime_type_for_filename(file_name: str) -> str:
    ext = os.path.splitext(file_name)[1].lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "application/octet-stream")


def query_images(db: Session):
    """统一的图片排序入口：图库和搜索都按创建时间倒序返回，保证最新同步的服务器图片排在前面。"""

    return db.query(ImageModel).order_by(desc(ImageModel.created_at))


def build_thumbnail_url(cos_key: str) -> str:
    if not cos_key:
        return ""
    return f"/api/images/thumbnail?key={quote(cos_key, safe='')}"


def sync_remote_images(db: Session) -> int:
    """
    把公司服务器 SFTP 目录中的图片同步到数据库。
    数据流：SFTP 列目录 -> 找出数据库没有的 remote_path -> 用文件名反推描述 -> 写入 images 表。
    """

    remote_files = SFTPStorageClient().list_images()
    return sync_remote_files_to_db(db, remote_files)


def cos_file_to_dict(remote_file, db_by_path: dict[str, ImageModel], index: int) -> dict:
    db_image = db_by_path.get(remote_file.remote_path)
    thumbnail_url = build_thumbnail_url(remote_file.remote_path)
    encoded_key = quote(remote_file.remote_path, safe="")
    preview_url = f"/api/images/preview?key={encoded_key}"
    download_url = f"/api/images/download?key={encoded_key}"
    title = remote_file.file_name
    if db_image:
        title = db_image.prompt or db_image.description or remote_file.file_name
        payload = {
            "id": db_image.id,
            "prompt": db_image.prompt or "",
            "originalPrompt": db_image.prompt or "",
            "original_prompt": db_image.prompt or "",
            "description": db_image.description or "",
            "expandedPrompt": db_image.description or "",
            "expanded_prompt": db_image.description or "",
            "keywords": db_image.keywords or "",
            "created_at": db_image.created_at,
            "updated_at": db_image.updated_at,
            "source": db_image.source or "cos",
            "status": db_image.status or "done",
        }
    else:
        description = description_from_filename(remote_file.file_name)
        title = description
        payload = {
            "id": f"cos-{index}",
            "prompt": description,
            "originalPrompt": description,
            "original_prompt": description,
            "description": "",
            "expandedPrompt": "",
            "expanded_prompt": "",
            "keywords": "",
            "created_at": remote_file.modified_at,
            "updated_at": remote_file.modified_at,
            "status": "done",
            "source": "cos",
        }
    payload.update(
        {
            "title": title,
            "file_name": remote_file.file_name,
            "fileName": remote_file.file_name,
            "storage_provider": "cos",
            "remote_path": remote_file.remote_path,
            "cosKey": remote_file.remote_path,
            "preview_url": preview_url,
            "previewUrl": preview_url,
            "thumbnail_url": thumbnail_url,
            "thumbnailUrl": thumbnail_url,
            "download_url": download_url,
            "downloadUrl": download_url,
            "url": preview_url,
            "mime_type": remote_file.mime_type,
            "file_size": remote_file.file_size,
            "size": remote_file.file_size,
            "lastModified": remote_file.modified_at,
            "createdAt": payload.get("created_at") or remote_file.modified_at,
        }
    )
    return payload


def list_cos_images_with_metadata(db: Session) -> list[dict]:
    remote_files = SFTPStorageClient().list_images()
    remote_paths = [remote_file.remote_path for remote_file in remote_files]
    db_images = []
    if remote_paths:
        db_images = (
            db.query(ImageModel)
            .filter(ImageModel.remote_path.in_(remote_paths))
            .order_by(desc(ImageModel.updated_at), desc(ImageModel.created_at))
            .all()
        )
    db_by_path = {}
    for image in db_images:
        if image.remote_path and image.remote_path not in db_by_path:
            db_by_path[image.remote_path] = image
    remote_files.sort(key=lambda item: item.modified_at or datetime.min, reverse=True)
    return [cos_file_to_dict(remote_file, db_by_path, index) for index, remote_file in enumerate(remote_files)]


@router.get("/images")
async def list_images(
    sync_remote: bool = Query(False, description="Deprecated; images are listed from COS directly"),
    db: Session = Depends(get_db),
):
    """
    图片库列表接口。
    默认只读数据库；当 sync_remote=true 时，先扫描 SFTP 远程目录并把新文件写入数据库，再返回列表。
    """

    try:
        images = list_cos_images_with_metadata(db)
        return {
            "success": True,
            "total": len(images),
            "synced": 0,
            "images": images,
        }
    except RemoteStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/images/search")
async def search_images(
    query: str = Query("", description="Search prompt, description, keywords, and file name"),
    sync_remote: bool = Query(False, description="Whether to sync SFTP remote directory before searching"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(100, ge=1, le=500, description="Pagination limit"),
    db: Session = Depends(get_db),
):
    """
    数据库搜索接口。
    支持搜索 prompt、description、keywords、file_name；前端输入描述时，本质上会匹配服务器文件名反推的描述。
    """

    try:
        clean_query = query.strip()
        images = list_cos_images_with_metadata(db)
        if clean_query:
            needle = clean_query.lower()
            images = [
                image
                for image in images
                if needle
                in " ".join(
                    str(image.get(field, ""))
                    for field in ("prompt", "description", "keywords", "file_name", "cosKey")
                ).lower()
            ]

        total = len(images)
        images = images[skip : skip + limit]
        return {
            "success": True,
            "message": "Search succeeded",
            "total": total,
            "synced": 0,
            "images": images,
        }
    except RemoteStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        print(f"Search error: {exc}")
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}")


@router.patch("/images/{image_id}/metadata")
async def update_image_metadata(
    image_id: int,
    request: ImageMetadataUpdateRequest,
    user: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

    keyword_text = ",".join(request.keywords) if isinstance(request.keywords, list) else request.keywords
    original_prompt = request.originalPrompt.strip()
    expanded_prompt = request.expandedPrompt.strip()

    image.prompt = original_prompt or image.prompt or ""
    image.description = expanded_prompt
    image.keywords = keyword_text or ""
    image.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(image)

    return {
        "success": True,
        "message": "Metadata updated",
        "image": image_to_dict(image),
    }


@router.patch("/images/{image_id}/name")
async def rename_image(
    image_id: int,
    request: ImageRenameRequest,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update the administrator-managed display name without moving the COS object."""

    image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="图片名称不能为空")

    image.prompt = name
    image.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(image)
    return {
        "success": True,
        "message": "Image name updated",
        "image": image_to_dict(image),
    }


@router.delete("/images/{image_id}")
async def delete_image(
    image_id: str,
    cos_key: str = Query("", alias="cosKey"),
    file_name: str = Query("", alias="fileName"),
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete either a database-backed image or a storage-only gallery image.

    Files discovered directly from COS do not always have an ``images`` table
    row.  The gallery gives those files a temporary ``cos-<index>`` ID, so the
    real storage key supplied by the gallery must be used in that case.
    """
    image = None
    if image_id.isdigit():
        image = db.query(ImageModel).filter(ImageModel.id == int(image_id)).first()

    is_storage_only_image = image is None and image_id.startswith("cos-")
    if image is None and not is_storage_only_image:
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

    storage = SFTPStorageClient()
    if image:
        remote_path = image.remote_path
        target_file_name = image.file_name
    else:
        # Never trust a temporary UI ID as a storage path.  The supplied key is
        # validated against the configured gallery prefix before deletion.
        remote_path = validate_cos_key(cos_key)
        target_file_name = posixpath.basename(remote_path) or file_name

    if remote_path:
        try:
            storage.delete_file(remote_path)
        except RemoteStorageError as exc:
            if "not found" not in str(exc).lower():
                raise HTTPException(status_code=500, detail=str(exc))

    if target_file_name and (not remote_path or posixpath.basename(remote_path) != target_file_name):
        try:
            storage.delete_file_by_name(target_file_name)
        except RemoteStorageError as exc:
            if "not found" not in str(exc).lower():
                raise HTTPException(status_code=500, detail=str(exc))

    if image:
        db.delete(image)
        db.commit()
    return {"success": True}


def load_image_bytes(image_id: int, db: Session) -> tuple[ImageModel, bytes]:
    """
    根据数据库 id 读取图片 bytes。
    安全边界：前端只能传 id，不能传 remote_path，避免任意读取服务器文件。
    """

    image = db.query(ImageModel).filter(ImageModel.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

    if not image.remote_path:
        local_path = get_full_image_path(image.file_path)
        if not os.path.exists(local_path):
            raise HTTPException(status_code=404, detail="Image file not found")
        with open(local_path, "rb") as file:
            return image, file.read()

    try:
        image_bytes = SFTPStorageClient().download_bytes(image.remote_path)
        return image, image_bytes
    except RemoteStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def validate_cos_key(key: str) -> str:
    prefix = SFTPStorageClient().config["cos_key_prefix"].strip("/")
    clean_key = key.strip().lstrip("/")
    if not clean_key or ".." in clean_key.split("/"):
        raise HTTPException(status_code=400, detail="Invalid COS key")
    if prefix and not clean_key.startswith(f"{prefix}/"):
        raise HTTPException(status_code=403, detail="COS key is outside image prefix")
    return clean_key


def content_disposition(disposition: str, file_name: str) -> str:
    encoded_name = quote(file_name)
    return f"{disposition}; filename=\"image\"; filename*=UTF-8''{encoded_name}"


@router.get("/images/preview")
@router.get("/images/cos/preview")
async def preview_cos_image(key: str = Query(..., description="COS object key")):
    clean_key = validate_cos_key(key)
    file_name = posixpath.basename(clean_key)
    mime_type = mime_type_for_filename(file_name)
    try:
        image_bytes = SFTPStorageClient().download_bytes(clean_key)
    except RemoteStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(
        content=image_bytes,
        media_type=mime_type,
        headers={"Content-Disposition": content_disposition("inline", file_name)},
    )


def thumbnail_cache_path(cos_key: str) -> Path:
    digest = hashlib.sha256(cos_key.encode("utf-8")).hexdigest()
    return THUMBNAIL_CACHE_DIR / f"{digest}.webp"


def build_cover_thumbnail(image_bytes: bytes, size: tuple[int, int] = THUMBNAIL_SIZE) -> bytes:
    target_width, target_height = size
    target_ratio = target_width / target_height
    with PILImage.open(io.BytesIO(image_bytes)) as image:
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")
        elif image.mode == "RGBA":
            background = PILImage.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.getchannel("A"))
            image = background

        source_width, source_height = image.size
        source_ratio = source_width / source_height
        if source_ratio > target_ratio:
            crop_width = int(source_height * target_ratio)
            left = max(0, (source_width - crop_width) // 2)
            image = image.crop((left, 0, left + crop_width, source_height))
        elif source_ratio < target_ratio:
            crop_height = int(source_width / target_ratio)
            top = max(0, (source_height - crop_height) // 2)
            image = image.crop((0, top, source_width, top + crop_height))

        image = image.resize(size, PILImage.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format="WEBP", quality=78, method=4)
        return output.getvalue()


@router.get("/images/thumbnail")
@router.get("/images/cos/thumbnail")
async def thumbnail_cos_image(key: str = Query(..., description="COS object key")):
    clean_key = validate_cos_key(key)
    cache_path = thumbnail_cache_path(clean_key)
    if cache_path.exists():
        return Response(
            content=cache_path.read_bytes(),
            media_type="image/webp",
            headers={
                "Cache-Control": "public, max-age=86400",
                "Content-Disposition": content_disposition("inline", f"{posixpath.basename(clean_key)}.webp"),
            },
        )
    try:
        image_bytes = SFTPStorageClient().download_bytes(clean_key)
        thumbnail_bytes = build_cover_thumbnail(image_bytes)
        THUMBNAIL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(thumbnail_bytes)
    except RemoteStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Thumbnail generation failed: {exc}") from exc
    return Response(
        content=thumbnail_bytes,
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": content_disposition("inline", f"{posixpath.basename(clean_key)}.webp"),
        },
    )


@router.get("/images/download")
@router.get("/images/cos/download")
async def download_cos_image(key: str = Query(..., description="COS object key")):
    clean_key = validate_cos_key(key)
    file_name = posixpath.basename(clean_key)
    mime_type = mime_type_for_filename(file_name)
    try:
        image_bytes = SFTPStorageClient().download_bytes(clean_key)
    except RemoteStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(
        content=image_bytes,
        media_type=mime_type,
        headers={"Content-Disposition": content_disposition("attachment", file_name)},
    )


@router.get("/images/{image_id}/preview")
async def preview_image(image_id: int, db: Session = Depends(get_db)):
    """图片预览代理接口：从数据库 id 找远程路径，通过后端读取后 inline 返回给前端 img 标签。"""

    image, image_bytes = load_image_bytes(image_id, db)
    return Response(
        content=image_bytes,
        media_type=image.mime_type or "image/png",
        headers={"Content-Disposition": content_disposition("inline", image.file_name or f"image_{image_id}.png")},
    )


@router.get("/images/{image_id}/download")
async def download_image(image_id: int, db: Session = Depends(get_db)):
    """图片下载代理接口：路径保持 /api/images/{id}/download，底层可读本地旧文件或 SFTP 远程文件。"""

    image, image_bytes = load_image_bytes(image_id, db)
    file_name = image.file_name or f"image_{image_id}.png"
    return Response(
        content=image_bytes,
        media_type=image.mime_type or "image/png",
        headers={"Content-Disposition": content_disposition("attachment", file_name)},
    )
