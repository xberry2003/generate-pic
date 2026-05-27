import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Image as ImageModel
from app.services.image_generation_service import get_full_image_path
from app.services.image_record_service import image_to_dict, sync_remote_files_to_db
from app.services.remote_storage_service import RemoteStorageError, SFTPStorageClient

router = APIRouter()


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


@router.get("/images")
async def list_images(
    sync_remote: bool = Query(False, description="Whether to sync SFTP remote directory before listing"),
    db: Session = Depends(get_db),
):
    """
    图片库列表接口。
    默认只读数据库；当 sync_remote=true 时，先扫描 SFTP 远程目录并把新文件写入数据库，再返回列表。
    """

    try:
        synced = sync_remote_images(db) if sync_remote else 0
        images = query_images(db).all()
        return {
            "success": True,
            "total": len(images),
            "synced": synced,
            "images": [image_to_dict(image) for image in images],
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
        synced = sync_remote_images(db) if sync_remote else 0
        search_query = db.query(ImageModel)
        clean_query = query.strip()

        if clean_query:
            search_term = f"%{clean_query}%"
            search_query = search_query.filter(
                or_(
                    ImageModel.prompt.ilike(search_term),
                    ImageModel.keywords.ilike(search_term),
                    ImageModel.description.ilike(search_term),
                    ImageModel.file_name.ilike(search_term),
                )
            )

        total = search_query.count()
        images = search_query.order_by(desc(ImageModel.created_at)).offset(skip).limit(limit).all()
        return {
            "success": True,
            "message": "Search succeeded",
            "total": total,
            "synced": synced,
            "images": [image_to_dict(image) for image in images],
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


@router.get("/images/{image_id}/preview")
async def preview_image(image_id: int, db: Session = Depends(get_db)):
    """图片预览代理接口：从数据库 id 找远程路径，通过后端读取后 inline 返回给前端 img 标签。"""

    image, image_bytes = load_image_bytes(image_id, db)
    return Response(
        content=image_bytes,
        media_type=image.mime_type or "image/png",
        headers={"Content-Disposition": f'inline; filename="{image.file_name or f"image_{image_id}.png"}"'},
    )


@router.get("/images/{image_id}/download")
async def download_image(image_id: int, db: Session = Depends(get_db)):
    """图片下载代理接口：路径保持 /api/images/{id}/download，底层可读本地旧文件或 SFTP 远程文件。"""

    image, image_bytes = load_image_bytes(image_id, db)
    file_name = image.file_name or f"image_{image_id}.png"
    return Response(
        content=image_bytes,
        media_type=image.mime_type or "image/png",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )
