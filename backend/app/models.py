from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.database import Base


class Image(Base):
    """
    图片元数据模型。
    数据流：生成/上传/远程同步都会写入这张表，前端刷新后通过 GET /api/images 从数据库恢复图片库。
    """

    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True)
    prompt = Column(String(500), nullable=False, default="")
    keywords = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)

    # 兼容旧字段：file_path / preview_url 仍然保留，避免破坏已有前端和旧数据。
    file_path = Column(String(1000), nullable=False)
    preview_url = Column(String(255), nullable=False)

    # 远程 SFTP 持久化字段。
    file_name = Column(String(255), nullable=True)
    storage_provider = Column(String(50), nullable=True)
    remote_path = Column(String(1000), nullable=True)
    download_url = Column(String(255), nullable=True)
    mime_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    source = Column(String(50), nullable=True)
    status = Column(String(50), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Image(id={self.id}, file_name='{self.file_name}', remote_path='{self.remote_path}')>"


class WorkspaceRow(Base):
    """Persisted per-user draft row for the batch workspace."""

    __tablename__ = "workspace_rows"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    row_key = Column(String(255), nullable=True)
    original_prompt = Column(Text, nullable=True)
    expanded_prompt = Column(Text, nullable=True)
    expanded_prompt_touched = Column(Integer, default=0)
    keywords = Column(Text, nullable=True)
    count = Column(Integer, default=1)
    status = Column(String(50), nullable=True)
    uploaded = Column(Integer, default=0)
    cos_key = Column(String(1000), nullable=True)
    preview_url = Column(String(1000), nullable=True)
    download_url = Column(String(1000), nullable=True)
    image_db_id = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    generation_prompt_snapshot = Column(Text, nullable=True)
    generated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
