import asyncio
import base64
import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin

import httpx
from dotenv import load_dotenv

load_dotenv()


class JimengClientError(Exception):
    """即梦供应商调用失败时使用的业务异常。"""


class JimengAuthError(JimengClientError):
    """API Key 无效或无权限。"""


class JimengRateLimitError(JimengClientError):
    """供应商限流。"""


class JimengTimeoutError(JimengClientError):
    """生成、轮询或下载超时。"""


class JimengTaskFailedError(JimengClientError):
    """异步任务明确失败。"""


@dataclass
class JimengConfig:
    """即梦反代配置；所有敏感值只从环境变量读取，不写死到代码里。"""

    base_url: str
    api_key: str
    model: str
    generate_endpoint: str
    task_status_endpoint: str
    timeout_seconds: int
    poll_interval_seconds: int
    save_dir: str

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key)


def get_jimeng_config() -> JimengConfig:
    """读取 .env 配置；不要在日志中打印 api_key。"""

    return JimengConfig(
        base_url=os.getenv("JIMENG_API_BASE_URL", "").strip().rstrip("/"),
        api_key=os.getenv("JIMENG_API_KEY", "").strip(),
        model=os.getenv("JIMENG_MODEL", "jimeng-4.0").strip(),
        generate_endpoint=os.getenv("JIMENG_GENERATE_ENDPOINT", "/images/generations").strip(),
        task_status_endpoint=os.getenv("JIMENG_TASK_STATUS_ENDPOINT", "/tasks/{task_id}").strip(),
        timeout_seconds=int(os.getenv("JIMENG_TIMEOUT_SECONDS", "180")),
        poll_interval_seconds=int(os.getenv("JIMENG_POLL_INTERVAL_SECONDS", "3")),
        save_dir=os.getenv("JIMENG_SAVE_DIR", "uploads/images").strip(),
    )


def get_headers(config: JimengConfig) -> dict[str, str]:
    """构造接口请求头；鉴权方式集中在这里，后续调整时不用改业务代码。"""

    return {
        "Authorization": f"Bearer {config.api_key}",
        "Content-Type": "application/json",
    }


def get_image_download_headers() -> dict[str, str]:
    """下载签名图片时使用浏览器式请求头，减少 CDN 偶发拒绝或 5xx。"""

    return {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    }


def normalize_keywords(keywords: str | list[str] | None) -> list[str]:
    """兼容字符串或数组，把关键词统一成 list[str]。"""

    if isinstance(keywords, list):
        return [str(item).strip() for item in keywords if str(item).strip()]
    if not keywords:
        return []
    return [item.strip() for item in str(keywords).replace("，", ",").split(",") if item.strip()]


def build_jimeng_payload(prompt: str, keywords: list[str], count: int, model: str = "jimeng-4.0") -> dict[str, Any]:
    """
    构造即梦反代请求体。
    keywords 会追加进 prompt，同时保留独立字段，方便之后按具体接口文档微调。
    """

    final_prompt = prompt.strip()
    if keywords:
        final_prompt = f"{final_prompt}\n关键词：{', '.join(keywords)}"

    return {
        "model": model,
        "prompt": final_prompt,
        "keywords": keywords,
        "n": count,
        "count": count,
        "size": "1024x1024",
    }


def response_keys_summary(payload: Any) -> str:
    """只输出响应结构摘要，避免日志打印完整响应。"""

    if isinstance(payload, dict):
        return ",".join(payload.keys())
    if isinstance(payload, list):
        return f"list[{len(payload)}]"
    return type(payload).__name__


def get_nested(payload: dict[str, Any], path: list[str]) -> Any:
    current: Any = payload
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def looks_like_base64(value: str) -> bool:
    """粗略判断字符串是否可能是 base64 图片。"""

    if not value or value.startswith("http") or len(value) < 80:
        return False
    return value.startswith("data:image/") or all(char.isalnum() or char in "+/=\n\r" for char in value[:120])


def normalize_image_item(item: Any) -> dict[str, Any] | None:
    """把 URL、base64 字符串或对象统一成 image_url/image_base64 结构。"""

    if isinstance(item, str):
        if item.startswith("http"):
            return {"image_url": item, "image_base64": None, "mime_type": "image/png", "raw": item}
        if item.startswith("data:image/") or looks_like_base64(item):
            return {"image_url": None, "image_base64": item, "mime_type": "image/png", "raw": "base64"}
        return None

    if not isinstance(item, dict):
        return None

    image_url = (
        item.get("image_url")
        or item.get("url")
        or item.get("src")
        or item.get("image")
        or item.get("origin_image_url")
    )
    image_base64 = item.get("image_base64") or item.get("base64") or item.get("b64_json")
    mime_type = item.get("mime_type") or item.get("mime") or "image/png"

    if image_url or image_base64:
        return {
            "image_url": image_url,
            "image_base64": image_base64,
            "mime_type": mime_type,
            "raw": item,
        }
    return None


def parse_jimeng_response(payload: dict[str, Any]) -> dict[str, Any]:
    """
    解析即梦反代响应。
    兼容 OpenAI 风格 data: [{url: ...}]，以及 images/image_urls/urls/task_id 等常见字段。
    """

    image_paths = [
        ["data"],
        ["data", "images"],
        ["data", "image_urls"],
        ["data", "urls"],
        ["images"],
        ["image_urls"],
        ["urls"],
        ["result", "images"],
        ["output", "images"],
    ]
    for path in image_paths:
        value = get_nested(payload, path)
        if not value:
            continue
        items = value if isinstance(value, list) else [value]
        images = [normalized for item in items if (normalized := normalize_image_item(item))]
        if images:
            return {"images": images}

    for path in (["task_id"], ["data", "task_id"], ["id"]):
        task_id = get_nested(payload, path)
        if task_id:
            return {"task_id": str(task_id)}

    raise JimengClientError(f"无法解析图像生成响应，响应字段：{response_keys_summary(payload)}")


class JimengImageGenerationClient:
    """即梦反代客户端，负责生成请求、轮询任务、下载远程图片。"""

    def __init__(self, config: JimengConfig | None = None):
        self.config = config or get_jimeng_config()

    def provider_health(self) -> dict[str, Any]:
        """健康检查只返回安全信息，不返回真实 key。"""

        return {
            "provider": "jimeng",
            "configured": self.config.configured,
            "base_url": self.config.base_url,
            "has_api_key": bool(self.config.api_key),
        }

    def build_url(self, endpoint: str) -> str:
        return urljoin(f"{self.config.base_url}/", endpoint.lstrip("/"))

    def ensure_configured(self) -> None:
        if not self.config.configured:
            raise JimengClientError("图像生成 API 未配置，请检查 JIMENG_API_BASE_URL 和 JIMENG_API_KEY")

    async def generate(self, prompt: str, keywords: str | list[str] | None = None, count: int = 1) -> list[dict[str, Any]]:
        """调用真实生成接口；如果返回 task_id，则自动轮询直到成功、失败或超时。"""

        self.ensure_configured()
        keyword_list = normalize_keywords(keywords)
        payload = build_jimeng_payload(prompt, keyword_list, count, self.config.model)
        generate_url = self.build_url(self.config.generate_endpoint)

        async with httpx.AsyncClient(timeout=self.config.timeout_seconds) as client:
            response_payload = await self.post_json(client, generate_url, payload)
            parsed = parse_jimeng_response(response_payload)
            if parsed.get("images"):
                return parsed["images"]
            return await self.poll_task(client, parsed["task_id"])

    async def post_json(self, client: httpx.AsyncClient, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await client.post(url, json=payload, headers=get_headers(self.config))
        except httpx.TimeoutException as exc:
            raise JimengTimeoutError("图像生成超时，请稍后重试") from exc
        except httpx.HTTPError as exc:
            raise JimengClientError(f"图像生成 API 请求失败：{exc.__class__.__name__}") from exc

        self.raise_for_status(response)
        try:
            return response.json()
        except ValueError as exc:
            raise JimengClientError("图像生成 API 返回了非 JSON 响应") from exc

    async def get_json(self, client: httpx.AsyncClient, url: str) -> dict[str, Any]:
        try:
            response = await client.get(url, headers=get_headers(self.config))
        except httpx.TimeoutException as exc:
            raise JimengTimeoutError("图像生成超时，请稍后重试") from exc
        except httpx.HTTPError as exc:
            raise JimengClientError(f"图像生成任务查询失败：{exc.__class__.__name__}") from exc

        self.raise_for_status(response)
        try:
            return response.json()
        except ValueError as exc:
            raise JimengClientError("图像生成任务返回了非 JSON 响应") from exc

    def raise_for_status(self, response: httpx.Response) -> None:
        if response.status_code in (401, 403):
            raise JimengAuthError("图像生成 API 鉴权失败，请检查 API Key")
        if response.status_code == 429:
            raise JimengRateLimitError("图像生成 API 请求过于频繁，请稍后重试")
        if response.status_code >= 400:
            raise JimengClientError(f"图像生成 API 请求失败，状态码：{response.status_code}")

    async def poll_task(self, client: httpx.AsyncClient, task_id: str) -> list[dict[str, Any]]:
        deadline = asyncio.get_running_loop().time() + self.config.timeout_seconds
        while asyncio.get_running_loop().time() < deadline:
            endpoint = self.config.task_status_endpoint.format(task_id=task_id)
            payload = await self.get_json(client, self.build_url(endpoint))
            status = str(
                payload.get("status")
                or get_nested(payload, ["data", "status"])
                or get_nested(payload, ["result", "status"])
                or ""
            ).lower()

            if status in {"failed", "fail", "error", "canceled", "cancelled"}:
                raise JimengTaskFailedError("图像生成任务失败")

            try:
                parsed = parse_jimeng_response(payload)
                if parsed.get("images"):
                    return parsed["images"]
            except JimengClientError:
                pass

            await asyncio.sleep(self.config.poll_interval_seconds)

        raise JimengTimeoutError("图像生成超时，请稍后重试")

    async def fetch_image_bytes(self, result: dict[str, Any]) -> bytes:
        """把生成结果里的 URL/base64 转成 bytes，供保存逻辑写入本地 uploads/images。"""

        if result.get("image_base64"):
            value = result["image_base64"]
            if value.startswith("data:image/"):
                value = value.split(",", 1)[1]
            return base64.b64decode(value)

        if result.get("image_url"):
            async with httpx.AsyncClient(
                timeout=self.config.timeout_seconds,
                follow_redirects=True,
                headers=get_image_download_headers(),
            ) as client:
                last_status = None
                for attempt in range(3):
                    try:
                        response = await client.get(result["image_url"])
                    except httpx.TimeoutException as exc:
                        raise JimengTimeoutError("图像下载超时，请稍后重试") from exc
                    except httpx.HTTPError as exc:
                        raise JimengClientError(f"远程图片下载失败：{exc.__class__.__name__}") from exc

                    last_status = response.status_code
                    if response.status_code < 400:
                        return response.content

                    # 签名图片 CDN 偶尔会短暂返回 5xx，稍等后重试，避免一次波动直接导致生成失败。
                    if response.status_code >= 500 and attempt < 2:
                        await asyncio.sleep(1 + attempt)
                        continue

                    self.raise_for_status(response)

                raise JimengClientError(f"远程图片下载失败，状态码：{last_status}")

        raise JimengClientError("图像生成响应缺少 image_url 或 image_base64")
