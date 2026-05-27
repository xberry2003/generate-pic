from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Image as ImageModel
from app.services.remote_storage_service import RemoteFileInfo, description_from_filename


def image_to_dict(image: ImageModel) -> dict:
    """
    把数据库 Image 模型转换成前端统一使用的响应结构。
    关键点：preview_url/download_url 都走后端接口，不把 remote_path 当成前端图片 src。
    """

    preview_url = image.preview_url or f"/api/images/{image.id}/preview"
    download_url = image.download_url or f"/api/images/{image.id}/download"
    return {
        "id": image.id,
        "prompt": image.prompt or "",
        "description": image.description or "",
        "keywords": image.keywords or "",
        "file_name": image.file_name or "",
        "storage_provider": image.storage_provider or "",
        "remote_path": image.remote_path or "",
        "preview_url": preview_url,
        "download_url": download_url,
        "created_at": image.created_at,
        "updated_at": image.updated_at,
        "status": image.status or "done",
        "mime_type": image.mime_type or "image/png",
        "file_size": image.file_size or 0,
        "source": image.source or "",
        # 兼容旧前端字段命名。
        "url": preview_url,
    }


def create_image_record(
    db: Session,
    *,
    prompt: str,
    description: str,
    keywords: str,
    remote_info: RemoteFileInfo,
    source: str,
    status: str = "done",
) -> ImageModel:
    """生成/上传成功后写入数据库，并返回可序列化的 Image 模型。"""

    image = ImageModel(
        prompt=prompt or description or remote_info.file_name,
        description=description or prompt or remote_info.file_name,
        keywords=keywords or "",
        file_path=remote_info.remote_path,
        preview_url="",  # 先落库，拿到 id 后再写后端代理地址
        file_name=remote_info.file_name,
        storage_provider="sftp",
        remote_path=remote_info.remote_path,
        download_url="",
        mime_type=remote_info.mime_type,
        file_size=remote_info.file_size,
        source=source,
        status=status,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(image)
    db.commit()
    db.refresh(image)

    image.preview_url = f"/api/images/{image.id}/preview"
    image.download_url = f"/api/images/{image.id}/download"
    db.commit()
    db.refresh(image)
    return image


def sync_remote_files_to_db(db: Session, remote_files: list[RemoteFileInfo]) -> int:
    """
    把远程目录中存在、但数据库没有的图片写入数据库。
    判断依据优先使用 remote_path，兼容文件名相同的情况。
    """

    created_count = 0
    existing_paths = {
        path
        for (path,) in db.query(ImageModel.remote_path).filter(ImageModel.remote_path.isnot(None)).all()
    }
    for remote_file in remote_files:
        if remote_file.remote_path in existing_paths:
            continue
        description = description_from_filename(remote_file.file_name)
        create_image_record(
            db,
            prompt=description,
            description=description,
            keywords="",
            remote_info=remote_file,
            source="remote",
            status="done",
        )
        created_count += 1
    return created_count
