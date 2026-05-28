from datetime import datetime
from dataclasses import dataclass
import base64

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.image_generation_service import call_image_generation_api, save_image_file
from app.services.image_record_service import create_image_record, image_to_dict
from app.services.minimax_client import MiniMaxClientError, MiniMaxImageGenerationClient
from app.services.remote_storage_service import (
    RemoteStorageError,
    SFTPStorageClient,
    generate_image_filename,
    normalize_image_to_png_bytes,
)

router = APIRouter()


@dataclass
class LocalImageInfo:
    file_name: str
    remote_path: str
    file_size: int
    modified_at: datetime
    mime_type: str = "image/png"


class GenerateRequest(BaseModel):
    prompt: str
    keywords: str | list[str] = ""
    description: str = ""
    original_prompt: str = ""
    count: int = 1


class GenerateResponse(BaseModel):
    message: str
    images: list[dict]
    success: bool = True


class DraftGenerateResponse(BaseModel):
    message: str
    images: list[dict]
    success: bool = True


class UploadDraftRequest(BaseModel):
    prompt: str
    keywords: str | list[str] = ""
    description: str = ""
    original_prompt: str = ""
    image_base64: str
    file_name: str = ""


@router.get("/generate/provider-health")
async def provider_health():
    """返回当前图像生成供应商配置状态；只返回 has_api_key 布尔值，不泄露真实密钥。"""

    return MiniMaxImageGenerationClient().provider_health()


@router.post("/generate", response_model=GenerateResponse)
async def generate_image(request: GenerateRequest, db: Session = Depends(get_db)):
    """
    生成图片接口。
    数据流：前端 prompt -> 即梦生成 bytes -> 统一转 PNG -> SFTP 上传 -> 数据库落库 -> 返回后端代理预览/下载 URL。
    """

    try:
        if not request.prompt or not request.prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt is required")
        if request.count < 1 or request.count > 4:
            raise HTTPException(status_code=400, detail="Count must be between 1 and 4")

        keyword_text = ",".join(request.keywords) if isinstance(request.keywords, list) else request.keywords
        image_data_list = await call_image_generation_api(
            prompt=request.prompt,
            keywords=keyword_text,
            count=request.count,
        )

        storage = SFTPStorageClient()
        generated_images = []
        for index, image_data in enumerate(image_data_list):
            png_bytes = normalize_image_to_png_bytes(image_data)
            image_description = (request.description or request.prompt).strip()
            filename_description = (request.original_prompt or request.prompt).strip()
            file_name = generate_image_filename(
                description=filename_description,
                prompt=request.prompt,
            )
            try:
                remote_info = storage.upload_bytes(png_bytes, file_name)
            except RemoteStorageError as exc:
                print(f"Remote storage upload failed, falling back to local file: {exc}")
                local_path = save_image_file(png_bytes, file_name)
                remote_info = LocalImageInfo(
                    file_name=file_name,
                    remote_path="",
                    file_size=len(png_bytes),
                    modified_at=datetime.utcnow(),
                )
            db_image = create_image_record(
                db,
                prompt=request.prompt,
                description=image_description,
                keywords=keyword_text,
                remote_info=remote_info,
                source="generated",
                status="done",
            )
            if not remote_info.remote_path:
                db_image.file_path = local_path
                db_image.preview_url = local_path
                db_image.download_url = f"/api/images/{db_image.id}/download"
                db.commit()
                db.refresh(db_image)
            generated_images.append(image_to_dict(db_image))

        return GenerateResponse(message="Generation succeeded", images=generated_images)
    except HTTPException:
        raise
    except MiniMaxClientError as exc:
        print(f"Generation provider error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    except RemoteStorageError as exc:
        print(f"Remote storage error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        print(f"Request error: {exc}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}")


@router.post("/generate/draft", response_model=DraftGenerateResponse)
async def generate_image_draft(request: GenerateRequest):
    try:
        if not request.prompt or not request.prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt is required")
        if request.count < 1 or request.count > 4:
            raise HTTPException(status_code=400, detail="Count must be between 1 and 4")

        keyword_text = ",".join(request.keywords) if isinstance(request.keywords, list) else request.keywords
        image_data_list = await call_image_generation_api(
            prompt=request.prompt,
            keywords=keyword_text,
            count=request.count,
        )
        images = []
        filename_description = (request.original_prompt or request.prompt).strip()
        for index, image_data in enumerate(image_data_list):
            png_bytes = normalize_image_to_png_bytes(image_data)
            b64 = base64.b64encode(png_bytes).decode("ascii")
            images.append(
                {
                    "id": f"draft-{index + 1}",
                    "title": request.description or request.prompt,
                    "prompt": request.prompt,
                    "description": request.description or request.prompt,
                    "keywords": keyword_text,
                    "mimeType": "image/png",
                    "fileName": generate_image_filename(description=filename_description, prompt=request.prompt),
                    "imageBase64": b64,
                    "previewUrl": f"data:image/png;base64,{b64}",
                    "uploaded": False,
                    "temporary": True,
                }
            )
        return DraftGenerateResponse(message="Draft generation succeeded", images=images)
    except HTTPException:
        raise
    except MiniMaxClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Draft generation failed: {exc}")


@router.post("/generate/upload", response_model=GenerateResponse)
async def upload_generated_draft(request: UploadDraftRequest, db: Session = Depends(get_db)):
    try:
        if request.image_base64.startswith("data:image/"):
            image_base64 = request.image_base64.split(",", 1)[1]
        else:
            image_base64 = request.image_base64
        image_bytes = base64.b64decode(image_base64)
        png_bytes = normalize_image_to_png_bytes(image_bytes)
        keyword_text = ",".join(request.keywords) if isinstance(request.keywords, list) else request.keywords
        image_description = (request.description or request.prompt).strip()
        filename_description = (request.original_prompt or request.prompt).strip()
        file_name = generate_image_filename(
            description=filename_description,
            prompt=request.prompt,
        ) if filename_description else request.file_name or generate_image_filename()
        remote_info = SFTPStorageClient().upload_bytes(png_bytes, file_name)
        db_image = create_image_record(
            db,
            prompt=request.prompt,
            description=image_description,
            keywords=keyword_text,
            remote_info=remote_info,
            source="generated",
            status="done",
        )
        return GenerateResponse(message="Upload succeeded", images=[image_to_dict(db_image)])
    except RemoteStorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Upload draft failed: {exc}")
