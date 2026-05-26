from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Image as ImageModel
from app.services.image_generation_service import (
    call_image_generation_api,
    save_image_file,
)
from app.services.jimeng_client import JimengImageGenerationClient, JimengClientError

router = APIRouter()


class GenerateRequest(BaseModel):
    prompt: str
    keywords: str = ""
    count: int = 1


class ImageResponse(BaseModel):
    id: int
    prompt: str
    keywords: str
    preview_url: str
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateResponse(BaseModel):
    message: str
    images: list[ImageResponse]


@router.get("/generate/provider-health")
async def provider_health():
    """返回当前图像生成供应商配置状态；只返回 has_api_key 布尔值，不泄露真实密钥。"""

    return JimengImageGenerationClient().provider_health()


@router.post("/generate", response_model=GenerateResponse)
async def generate_image(request: GenerateRequest, db: Session = Depends(get_db)):
    try:
        if not request.prompt or not request.prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt is required")

        if request.count < 1 or request.count > 4:
            raise HTTPException(status_code=400, detail="Count must be between 1 and 4")

        image_data_list = await call_image_generation_api(
            prompt=request.prompt,
            keywords=request.keywords,
            count=request.count,
        )

        generated_images = []
        for index, image_data in enumerate(image_data_list):
            file_path = save_image_file(image_data)
            db_image = ImageModel(
                prompt=request.prompt,
                keywords=request.keywords,
                description=f"Generated image {index + 1}",
                file_path=file_path,
                preview_url=file_path,
                created_at=datetime.utcnow(),
            )

            db.add(db_image)
            db.commit()
            db.refresh(db_image)
            generated_images.append(ImageResponse.model_validate(db_image))

        return GenerateResponse(
            message="Generation succeeded",
            images=generated_images,
        )
    except HTTPException:
        raise
    except JimengClientError as e:
        print(f"Generation provider error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"Request error: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {e}")
