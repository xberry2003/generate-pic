import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Image as ImageModel
from app.services.image_generation_service import save_image_file

router = APIRouter()


class UploadImageResponse(BaseModel):
    id: int
    preview_url: str
    download_url: str
    message: str


@router.post("/images/upload", response_model=UploadImageResponse)
async def upload_image(
    file: UploadFile = File(..., description="Image file"),
    prompt: str = Form("", description="Image prompt"),
    keywords: str = Form("", description="Image keywords"),
    description: str = Form("", description="Image description"),
    db: Session = Depends(get_db),
):
    try:
        file_content = await file.read()
        if not file_content:
            raise HTTPException(status_code=400, detail="File is empty")

        max_file_size = 50 * 1024 * 1024
        if len(file_content) > max_file_size:
            raise HTTPException(status_code=413, detail="File is larger than 50MB")

        allowed_extensions = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
        file_extension = os.path.splitext(file.filename or "")[1].lower()
        if file_extension not in allowed_extensions:
            allowed = ", ".join(sorted(allowed_extensions))
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format. Supported formats: {allowed}",
            )

        file_path = save_image_file(file_content, file.filename)

        db_image = ImageModel(
            prompt=prompt or "User upload",
            keywords=keywords,
            description=description or f"Uploaded image: {file.filename}",
            file_path=file_path,
            preview_url=file_path,
            created_at=datetime.utcnow(),
        )

        db.add(db_image)
        db.commit()
        db.refresh(db_image)

        return UploadImageResponse(
            id=db_image.id,
            preview_url=file_path,
            download_url=f"/api/images/{db_image.id}/download",
            message="Upload succeeded",
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Request error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")
