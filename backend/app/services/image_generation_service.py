import os
import uuid
from datetime import datetime

from dotenv import load_dotenv

from app.services.jimeng_client import JimengImageGenerationClient

load_dotenv()


async def call_image_generation_api(prompt: str, keywords: str = "", count: int = 1) -> list[bytes]:
    """
    调用真实即梦反代图像生成 API，并把远程结果转换为图片 bytes。
    数据流：路由传入 prompt/keywords/count -> Jimeng 客户端生成 URL/base64 -> 后端下载或解码成 bytes -> 复用 save_image_file 入库。
    """

    client = JimengImageGenerationClient()
    image_results = await client.generate(prompt=prompt, keywords=keywords, count=count)
    return [await client.fetch_image_bytes(result) for result in image_results]


def save_image_file(image_data: bytes, filename: str = None) -> str:
    """
    保存图片到本地 uploads/images，并返回数据库和前端使用的相对预览路径。
    数据流说明：真实 API 返回的图片 bytes 会先落盘到公司服务器本地目录，再把 /uploads/images/xxx.png 写入数据库。
    """

    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    save_dir = os.getenv("JIMENG_SAVE_DIR", "uploads/images")
    images_dir = os.path.join(backend_dir, save_dir)
    os.makedirs(images_dir, exist_ok=True)

    if filename:
        safe_name = os.path.basename(filename)
        name, ext = os.path.splitext(safe_name)
        if not ext:
            ext = ".png"
        filename = f"{name}_{uuid.uuid4().hex[:8]}{ext}"
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{uuid.uuid4().hex[:8]}.png"

    file_path = os.path.join(images_dir, filename)
    with open(file_path, "wb") as file:
        file.write(image_data)

    return f"/uploads/images/{filename}"


def get_full_image_path(relative_path: str) -> str:
    """把数据库里保存的相对路径转换为服务器本地完整文件路径，供下载接口使用。"""

    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    clean_path = relative_path.lstrip("/")

    # 兼容新路径 /uploads/images/xxx.png，以及旧数据里可能存在的 /images/xxx.png。
    if clean_path.startswith("uploads/"):
        clean_path = clean_path[len("uploads/"):]

    return os.path.join(backend_dir, "uploads", clean_path)
