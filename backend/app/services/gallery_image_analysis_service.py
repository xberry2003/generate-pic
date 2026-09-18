import base64
import json
import os
import re
from dataclasses import dataclass
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()


@dataclass
class GalleryImageAnalysisResult:
    title: str
    original_description: str
    raw_text: str = ""


class GalleryImageAnalysisError(Exception):
    pass


def _clean_text(value: str, fallback: str = "") -> str:
    text = re.sub(r"\s+", " ", (value or "").strip())
    return text or fallback


def _truncate_text(value: str, max_length: int, fallback: str = "") -> str:
    text = _clean_text(value, fallback)
    if not text:
        return fallback
    return text[:max_length]


def _contains_cjk(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text or ""))


def _strip_think_blocks(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.S | re.I)
    cleaned = re.sub(r"^<think>.*$", "", cleaned, flags=re.M | re.I)
    cleaned = cleaned.replace("</think>", "")
    return cleaned.strip()


def _extract_json_text(text: str) -> dict[str, Any] | None:
    if not text:
        return None

    candidates = []
    stripped = _strip_think_blocks(text)
    if stripped and stripped != text:
        candidates.append(stripped)
    match = re.search(r"\{.*\}", text, flags=re.S)
    if match:
        candidates.append(match.group(0))
    candidates.append(text.strip())

    for candidate in candidates:
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    return None


def _image_data_url(image_bytes: bytes) -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _extract_response_text(payload: Any) -> str:
    if isinstance(payload, dict):
        for key_path in (
            ("choices", 0, "message", "content"),
            ("choices", 0, "text"),
            ("reply",),
            ("output_text",),
            ("output", "text"),
            ("data", "text"),
            ("data", "content"),
            ("content",),
        ):
            current: Any = payload
            try:
                for key in key_path:
                    if isinstance(key, int):
                        current = current[key]
                    else:
                        current = current.get(key) if isinstance(current, dict) else None
                    if current is None:
                        break
                if isinstance(current, str) and current.strip():
                    return current.strip()
                if isinstance(current, list):
                    text_parts = []
                    for item in current:
                        if isinstance(item, str):
                            text_parts.append(item)
                        elif isinstance(item, dict):
                            text_parts.append(str(item.get("text") or item.get("content") or item.get("value") or ""))
                    joined = "".join(text_parts).strip()
                    if joined:
                        return joined
            except Exception:
                continue

    if isinstance(payload, list):
        for item in payload:
            text = _extract_response_text(item)
            if text:
                return text
    return ""


def _log_minimax_response(response_payload: Any, raw_text: str) -> None:
    try:
        if isinstance(response_payload, dict):
            print(f"MiniMax gallery analysis response keys: {list(response_payload.keys())}")
            choices = response_payload.get("choices")
            if isinstance(choices, list) and choices:
                first_choice = choices[0] if isinstance(choices[0], dict) else {}
                message = first_choice.get("message") if isinstance(first_choice, dict) else None
                print(f"MiniMax gallery analysis choice[0] raw: {repr(first_choice)}")
                print(f"MiniMax gallery analysis choice[0].message raw: {repr(message)}")
                if isinstance(message, dict):
                    print(f"MiniMax gallery analysis choice[0].message.content raw: {repr(message.get('content'))}")
                print(f"MiniMax gallery analysis choice[0].text raw: {repr(first_choice.get('text'))}")
        elif isinstance(response_payload, list):
            print(f"MiniMax gallery analysis response type: list, len={len(response_payload)}")
        else:
            print(f"MiniMax gallery analysis response type: {type(response_payload).__name__}")

        preview = _clean_text(raw_text)[:1000]
        if preview:
            print(f"MiniMax gallery analysis raw text preview: {preview}")
    except Exception as exc:
        print(f"MiniMax gallery analysis logging failed: {exc}")


def _normalize_result(title: str, description: str) -> tuple[str, str]:
    title = _truncate_text(title, 12)
    description = _truncate_text(description, 40)

    if not _contains_cjk(title):
        title = ""
    if not _contains_cjk(description):
        description = ""

    if not title and description:
        title = _truncate_text(description, 12)
    if not description and title:
        description = title

    if not title:
        title = "图片上传"
    if not description:
        description = "一张用户上传的图片"
    return title, description


def _extract_json_result(text: str) -> tuple[str, str]:
    cleaned = _strip_think_blocks(text or "")
    parsed = _extract_json_text(cleaned or text or "")
    if not parsed:
        return "", ""
    title = str(parsed.get("title") or "").strip()
    description = str(parsed.get("original_description") or "").strip()
    return _normalize_result(title, description)


class GalleryImageAnalysisClient:
    def __init__(self) -> None:
        self.base_url = os.getenv("MINIMAX_API_BASE_URL", "https://api.minimax.io").strip().rstrip("/")
        self.api_key = os.getenv("MINIMAX_API_KEY", "").strip()
        self.model = "MiniMax-M3"
        self.endpoint = os.getenv("MINIMAX_IMAGE_ANALYSIS_ENDPOINT", "/v1/chat/completions").strip()
        self.timeout_seconds = int(os.getenv("MINIMAX_IMAGE_ANALYSIS_TIMEOUT_SECONDS", "120"))
        self.enabled = os.getenv("MINIMAX_IMAGE_ANALYSIS_ENABLED", "true").strip().lower() == "true"

    @property
    def configured(self) -> bool:
        return bool(self.enabled and self.base_url and self.api_key)

    def build_url(self) -> str:
        return f"{self.base_url}/{self.endpoint.lstrip('/')}"

    def build_payload(self, image_bytes: bytes) -> dict[str, Any]:
        prompt = (
            "请严格只输出 JSON，不要输出任何解释、思考过程、Markdown、代码块或多余文字。"
            'JSON 格式必须是：{"title":"中文标题","original_description":"中文描述"}。'
            "title 和 original_description 都必须是中文。"
            "title 最多 12 个中文字符，original_description 最多 40 个中文字符。"
            "如果图片中有英文，也必须翻译成中文后再输出。"
        )
        return {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": _image_data_url(image_bytes)}},
                    ],
                }
            ],
            "temperature": 0.2,
            "max_completion_tokens": 256,
        }

    async def analyze(self, image_bytes: bytes, file_name: str = "") -> GalleryImageAnalysisResult:
        if not self.configured:
            raise GalleryImageAnalysisError("MiniMax image analysis is not configured")

        payload = self.build_payload(image_bytes)
        async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
            response = await client.post(
                self.build_url(),
                json=payload,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )

        if response.status_code >= 400:
            detail = response.text[:500]
            raise GalleryImageAnalysisError(f"MiniMax analysis failed: {response.status_code}; {detail}")

        try:
            response_payload = response.json()
        except ValueError as exc:
            raise GalleryImageAnalysisError("MiniMax analysis returned non-JSON response") from exc

        text = _extract_response_text(response_payload)
        _log_minimax_response(response_payload, text)
        title, original_description = _extract_json_result(text)
        if not title and not original_description:
            cleaned = _strip_think_blocks(text or "")
            if cleaned and cleaned != (text or ""):
                title, original_description = _extract_json_result(cleaned)
        if not title and not original_description:
            raise GalleryImageAnalysisError("MiniMax analysis returned invalid JSON caption")

        return GalleryImageAnalysisResult(
            title=title,
            original_description=original_description,
            raw_text=text or "",
        )


def fallback_gallery_analysis(file_name: str = "") -> GalleryImageAnalysisResult:
    stem = os.path.splitext(os.path.basename(file_name or "image"))[0]
    cleaned = re.sub(r"[_\-\s]+", " ", stem).strip() or "用户上传的图片"
    title = _truncate_text(cleaned, 12, "图片上传")
    description = _truncate_text(cleaned, 40, "一张用户上传的图片")
    return GalleryImageAnalysisResult(
        title=title,
        original_description=description,
        raw_text="fallback",
    )
