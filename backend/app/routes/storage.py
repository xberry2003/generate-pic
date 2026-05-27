from fastapi import APIRouter

from app.services.remote_storage_service import SFTPStorageClient

router = APIRouter()


@router.get("/storage/health")
async def storage_health():
    """SFTP 存储健康检查；不返回私钥内容，只返回 host、remote_dir 和连接状态。"""

    return SFTPStorageClient().health()
