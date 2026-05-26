import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.image_generation_service import save_image_file
from app.services.jimeng_client import JimengImageGenerationClient


async def main():
    """
    本地测试脚本。
    数据流：读取 .env -> 调用 JimengImageGenerationClient -> 下载/解码图片 bytes -> 复用 save_image_file 保存到本地。
    安全说明：脚本只打印配置是否存在和保存路径，不打印 API key。
    """

    load_dotenv(BACKEND_DIR / ".env")
    client = JimengImageGenerationClient()
    health = client.provider_health()
    print(
        {
            "provider": health["provider"],
            "configured": health["configured"],
            "base_url": health["base_url"],
            "has_api_key": health["has_api_key"],
        }
    )

    results = await client.generate(
        prompt=os.getenv("JIMENG_TEST_PROMPT", "一张简洁的蓝色科技感产品海报"),
        keywords=["test"],
        count=1,
    )
    saved_paths = []
    for result in results:
        image_bytes = await client.fetch_image_bytes(result)
        saved_paths.append(save_image_file(image_bytes))

    print({"success": True, "image_count": len(results), "saved_paths": saved_paths})


if __name__ == "__main__":
    asyncio.run(main())
