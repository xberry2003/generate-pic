"""
app 包初始化文件

初始化 FastAPI 应用包
"""

from app.main import app
from app.database import init_db, get_db
from app.models import Image

__all__ = ['app', 'init_db', 'get_db', 'Image']
