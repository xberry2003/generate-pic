"""
SQLAlchemy ORM 模型定义文件

本文件定义：
1. Image 模型 - 存储生成或上传的图片信息
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from app.database import Base

class Image(Base):
    """
    图片数据模型
    
    用于存储生成或上传的图片信息
    
    属性说明：
    - id: 图片唯一标识符（自增主键）
    - prompt: 生成图片时使用的提示词
    - keywords: 图片的关键词，用逗号分隔
    - description: 图片的详细描述
    - file_path: 图片在服务器上的文件路径（相对于 uploads 目录）
    - preview_url: 图片预览 URL
    - created_at: 图片创建时间
    """
    
    __tablename__ = "images"
    
    # 主键：图片 ID
    id = Column(Integer, primary_key=True, index=True)
    
    # prompt：用户输入的生成提示词
    prompt = Column(String(500), nullable=False)
    
    # keywords：图片关键词，用逗号分隔
    # 例如：可爱, 温暖, 日光
    keywords = Column(String(255), nullable=True)
    
    # description：图片详细描述
    description = Column(Text, nullable=True)
    
    # file_path：图片文件的相对路径
    # 例如：/images/abc123.png
    file_path = Column(String(255), nullable=False)
    
    # preview_url：图片预览 URL，用于前端展示
    preview_url = Column(String(255), nullable=False)
    
    # created_at：记录创建时间，用于排序和查询
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    def __repr__(self):
        """
        字符串表示，便于调试
        """
        return f"<Image(id={self.id}, prompt='{self.prompt}', file_path='{self.file_path}')>"
