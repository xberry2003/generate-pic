import os
import posixpath
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Image as ImageModel
from app.services.image_generation_service import get_full_image_path
from app.services.image_record_service import image_to_dict, sync_remote_files_to_db
from app.services.remote_storage_service import RemoteStorageError, SFTPStorageClient, description_from_filename

router = APIRouter()


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


def sync_remote_images(db: Session) -> int:
    """
    把公司服务器 SFTP 目录中的图片同步到数据库。
    数据流：SFTP 列目录 -> 找出数据库没有的 remote_path -> 用文件名反推描述 -> 写入 images 表。
    """

    remote_files = SFTPStorageClient().list_images()
    return sync_remote_files_to_db(db, remote_files)


def cos_file_to_dict(remote_file, db_by_path: dict[str, ImageModel], index: int) -> dict:
    db_image = db_by_path.get(remote_file.remote_path)
    encoded_key = quote(remote_file.remote_path, safe="")
    preview_url = f"/api/images/preview?key={encoded_key}"
    download_url = f"/api/images/download?key={encoded_key}"
    title = remote_file.file_name
    if db_image:
        title = db_image.description or db_image.prompt or remote_file.file_name
        payload = {
            "id": db_image.id,
            "prompt": db_image.prompt or "",
            "description": db_image.description or "",
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
            "prompt": "",
            "description": description,
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
        db_images = db.query(ImageModel).filter(ImageModel.remote_path.in_(remote_paths)).all()
    db_by_path = {image.remote_path: image for image in db_images if image.remote_path}
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
