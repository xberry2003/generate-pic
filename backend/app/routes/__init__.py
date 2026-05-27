"""
routes 包初始化文件

导出所有路由模块
"""

# 导出路由模块，确保它们被正确注册
from app.routes import generate, images, upload, storage

__all__ = ['generate', 'images', 'upload']
