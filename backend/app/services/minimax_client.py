import base64
import os
from dataclasses import dataclass
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()


class MiniMaxClientError(Exception):
    """Raised when the MiniMax image provider call fails."""


class MiniMaxAuthError(MiniMaxClientError):
    """Raised when the MiniMax API key is invalid or unauthorized."""


class MiniMaxRateLimitError(MiniMaxClientError):
    """Raised when MiniMax rate limits the request."""


class MiniMaxTimeoutError(MiniMaxClientError):
    """Raised when MiniMax generation or image download times out."""


@dataclass
class MiniMaxConfig:
    base_url: str
    api_key: str
    model: str
    endpoint: str
    timeout_seconds: int
    response_format: str
    aspect_ratio: str
    prompt_optimizer: bool
    save_dir: str

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.api_key)


def get_minimax_config() -> MiniMaxConfig:
    return MiniMaxConfig(
        base_url=os.getenv("MINIMAX_API_BASE_URL", "https://api.minimax.chat").strip().rstrip("/"),
        api_key=os.getenv("MINIMAX_API_KEY", "").strip(),
        model=os.getenv("MINIMAX_MODEL", "image-01").strip(),
        endpoint=os.getenv("MINIMAX_IMAGE_ENDPOINT", "/v1/image_generation").strip(),
        timeout_seconds=int(os.getenv("MINIMAX_TIMEOUT_SECONDS", "180")),
        response_format=os.getenv("MINIMAX_RESPONSE_FORMAT", "base64").strip() or "base64",
        aspect_ratio=os.getenv("MINIMAX_ASPECT_RATIO", "1:1").strip() or "1:1",
        prompt_optimizer=os.getenv("MINIMAX_PROMPT_OPTIMIZER", "false").strip().lower() == "true",
        save_dir=os.getenv("MINIMAX_SAVE_DIR", "uploads/images").strip(),
    )


def get_headers(config: MiniMaxConfig) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {config.api_key}",
        "Content-Type": "application/json",
    }


def get_image_download_headers() -> dict[str, str]:
    return {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    }


def normalize_keywords(keywords: str | list[str] | None) -> list[str]:
    if isinstance(keywords, list):
        return [str(item).strip() for item in keywords if str(item).strip()]
    if not keywords:
        return []
    return [item.strip() for item in str(keywords).replace("，", ",").split(",") if item.strip()]


def build_minimax_payload(prompt: str, keywords: list[str], count: int, config: MiniMaxConfig) -> dict[str, Any]:
    final_prompt = prompt.strip()
    if keywords:
        final_prompt = f"{final_prompt}\n关键词：{', '.join(keywords)}"

    return {
        "model": config.model,
        "prompt": final_prompt,
        "n": count,
        "aspect_ratio": config.aspect_ratio,
        "response_format": config.response_format,
        "prompt_optimizer": config.prompt_optimizer,
    }


def response_keys_summary(payload: Any) -> str:
    if isinstance(payload, dict):
        return ",".join(payload.keys())
    if isinstance(payload, list):
        return f"list[{len(payload)}]"
    return type(payload).__name__


def extract_provider_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text[:200]

    message = None
    if isinstance(payload, dict):
        base_resp = payload.get("base_resp")
        if isinstance(base_resp, dict):
            message = base_resp.get("status_msg") or base_resp.get("status_code")
        error = payload.get("error")
        if isinstance(error, dict):
            message = message or error.get("message")
        message = message or payload.get("message") or payload.get("detail")
    return str(message or response_keys_summary(payload))[:200]


def get_nested(payload: dict[str, Any], path: list[str]) -> Any:
    current: Any = payload
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    return current


def normalize_image_item(item: Any) -> dict[str, Any] | None:
    if isinstance(item, str):
        if item.startswith("http"):
            return {"image_url": item, "image_base64": None, "mime_type": "image/png", "raw": item}
        if item.startswith("data:image/") or len(item) > 80:
            return {"image_url": None, "image_base64": item, "mime_type": "image/png", "raw": "base64"}
        return None

    if not isinstance(item, dict):
        return None

    image_url = item.get("image_url") or item.get("url") or item.get("src") or item.get("image")
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


def parse_minimax_response(payload: dict[str, Any]) -> list[dict[str, Any]]:
    base_resp = payload.get("base_resp")
    if isinstance(base_resp, dict):
        status_code = base_resp.get("status_code")
        if status_code not in (None, 0, "0"):
            status_msg = base_resp.get("status_msg") or "unknown MiniMax provider error"
            raise MiniMaxClientError(f"MiniMax generation failed: {status_msg} (code: {status_code})")

    image_paths = [
        ["data", "image_base64"],
        ["data", "image_urls"],
        ["data", "images"],
        ["data"],
        ["images"],
        ["image_urls"],
        ["urls"],
    ]
    for path in image_paths:
        value = get_nested(payload, path)
        if not value:
            continue
        items = value if isinstance(value, list) else [value]
        flattened_items = []
        for item in items:
            if isinstance(item, list):
                flattened_items.extend(item)
            else:
                flattened_items.append(item)
        images = [normalized for item in flattened_items if (normalized := normalize_image_item(item))]
        if images:
            return images

    raise MiniMaxClientError(f"无法解析 MiniMax 生图响应，响应字段：{response_keys_summary(payload)}")


class MiniMaxImageGenerationClient:
    def __init__(self, config: MiniMaxConfig | None = None):
        self.config = config or get_minimax_config()

    def provider_health(self) -> dict[str, Any]:
        return {
            "provider": "minimax",
            "configured": self.config.configured,
            "base_url": self.config.base_url,
            "model": self.config.model,
            "has_api_key": bool(self.config.api_key),
        }

    def build_url(self) -> str:
        return f"{self.config.base_url}/{self.config.endpoint.lstrip('/')}"

    def ensure_configured(self) -> None:
        if not self.config.configured:
            raise MiniMaxClientError("MiniMax 生图 API 未配置，请检查 MINIMAX_API_KEY")

    async def generate(self, prompt: str, keywords: str | list[str] | None = None, count: int = 1) -> list[dict[str, Any]]:
        self.ensure_configured()
        keyword_list = normalize_keywords(keywords)
        payload = build_minimax_payload(prompt, keyword_list, count, self.config)

        async with httpx.AsyncClient(timeout=self.config.timeout_seconds) as client:
            try:
                response = await client.post(self.build_url(), json=payload, headers=get_headers(self.config))
            except httpx.TimeoutException as exc:
                raise MiniMaxTimeoutError("MiniMax 生图超时，请稍后重试") from exc
            except httpx.HTTPError as exc:
                raise MiniMaxClientError(f"MiniMax 生图 API 请求失败：{exc.__class__.__name__}") from exc

            self.raise_for_status(response)
            try:
                response_payload = response.json()
            except ValueError as exc:
                raise MiniMaxClientError("MiniMax 生图 API 返回了非 JSON 响应") from exc

        return parse_minimax_response(response_payload)

    def raise_for_status(self, response: httpx.Response) -> None:
        if response.status_code in (401, 403):
            raise MiniMaxAuthError("MiniMax 生图 API 鉴权失败，请检查 API Key")
        if response.status_code == 429:
            raise MiniMaxRateLimitError("MiniMax 生图 API 请求过于频繁，请稍后重试")
        if response.status_code >= 400:
            detail = extract_provider_error_message(response)
            raise MiniMaxClientError(f"MiniMax 生图 API 请求失败，状态码：{response.status_code}，原因：{detail}")

    async def fetch_image_bytes(self, result: dict[str, Any]) -> bytes:
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
                try:
                    response = await client.get(result["image_url"])
                except httpx.TimeoutException as exc:
                    raise MiniMaxTimeoutError("MiniMax 远程图片下载超时，请稍后重试") from exc
                except httpx.HTTPError as exc:
                    raise MiniMaxClientError(f"MiniMax 远程图片下载失败：{exc.__class__.__name__}") from exc

                if response.status_code >= 400:
                    raise MiniMaxClientError(f"MiniMax 远程图片下载失败，状态码：{response.status_code}")
                return response.content

        raise MiniMaxClientError("MiniMax 生图响应缺少 image_url 或 image_base64")
