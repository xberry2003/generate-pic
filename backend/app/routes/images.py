import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Image as ImageModel
from app.services.image_generation_service import get_full_image_path

router = APIRouter()


class ImageSearchResult(BaseModel):
    id: int
    prompt: str
    keywords: str | None = None
    description: str | None = None
    preview_url: str
    download_url: str
    created_at: datetime

    class Config:
        from_attributes = True


class SearchResponse(BaseModel):
    message: str
    total: int
    images: list[ImageSearchResult]


@router.get("/images/search", response_model=SearchResponse)
async def search_images(
    query: str = Query("", description="Search prompt, keywords, and description"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=100, description="Pagination limit"),
    db: Session = Depends(get_db),
):
    try:
        search_query = db.query(ImageModel)

        if query and query.strip():
            search_term = f"%{query}%"
            search_query = search_query.filter(
                or_(
                    ImageModel.prompt.ilike(search_term),
                    ImageModel.keywords.ilike(search_term),
                    ImageModel.description.ilike(search_term),
                )
            )

        total = search_query.count()
        images = (
            search_query.order_by(desc(ImageModel.created_at))
            .offset(skip)
            .limit(limit)
            .all()
        )

        results = [
            ImageSearchResult(
                id=image.id,
                prompt=image.prompt,
                keywords=image.keywords,
                description=image.description,
                preview_url=image.preview_url,
                download_url=f"/api/images/{image.id}/download",
                created_at=image.created_at,
            )
            for image in images
        ]

        return SearchResponse(message="Search succeeded", total=total, images=results)
    except Exception as e:
        print(f"Request error: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")


@router.get("/images/{image_id}/download")
async def download_image(image_id: int, db: Session = Depends(get_db)):
    try:
        image = db.query(ImageModel).filter(ImageModel.id == image_id).first()

        if not image:
            raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

        file_path = get_full_image_path(image.file_path)

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Image file not found")

        return FileResponse(
            path=file_path,
            media_type="image/png",
            filename=f"image_{image_id}.png",
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Request error: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {e}")
