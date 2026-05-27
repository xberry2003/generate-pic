"""
FastAPI 搴旂敤閰嶇疆鍜屽垵濮嬪寲鏂囦欢

鏈枃浠跺寘鍚細
1. FastAPI 搴旂敤瀹炰緥鍒涘缓
2. CORS 璺ㄥ煙璧勬簮鍏变韩閰嶇疆
3. 璺敱娉ㄥ唽
4. 涓棿浠堕厤缃?
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import init_db
from app.routes import generate, images, upload, storage

# 鍒涘缓 FastAPI 搴旂敤瀹炰緥
app = FastAPI(
    title="鏂囩敓鍥惧浘鐗囧簱 API",
    description="鎻愪緵鏂囩敓鍥惧拰鍥剧墖搴撶鐞嗙殑 RESTful API",
    version="1.0.0"
)

# ========== CORS 璺ㄥ煙閰嶇疆 ==========
# 閰嶇疆 CORS锛屽厑璁稿墠绔湰鍦板紑鍙戞椂鐨勮法鍩熻姹?
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",      # Vite 鍓嶇寮€鍙戞湇鍔″櫒
        "http://localhost:3000",      # 鍏朵粬鍙兘鐨勫墠绔鍙?
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,           # 鍏佽鍙戦€佽璇佷俊鎭紙濡?cookies锛?
    allow_methods=["*"],              # 鍏佽鎵€鏈?HTTP 鏂规硶
    allow_headers=["*"],              # 鍏佽鎵€鏈夎姹傚ご
)

# ========== 闈欐€佹枃浠堕厤缃?==========
# 灏嗕笂浼犵殑鍥剧墖鐩綍鏄犲皠涓洪潤鎬佹枃浠舵湇鍔?
uploads_dir = os.path.join(os.path.dirname(__file__), '..', 'uploads')
if not os.path.exists(uploads_dir):
    os.makedirs(uploads_dir, exist_ok=True)

app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# ========== 璺敱娉ㄥ唽 ==========
# 娉ㄥ唽鍚勪釜妯″潡鐨勮矾鐢?
app.include_router(generate.router, prefix="/api", tags=["generation"])
app.include_router(images.router, prefix="/api", tags=["images"])
app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(storage.router, prefix="/api", tags=["storage"])

# ========== 搴旂敤浜嬩欢澶勭悊 ==========
@app.on_event("startup")
async def startup_event():
    """
    搴旂敤鍚姩浜嬩欢
    鍒濆鍖栨暟鎹簱锛屽垱寤鸿〃
    """
    print("Application starting, initializing database...")
    init_db()
    print("Database initialized")

@app.on_event("shutdown")
async def shutdown_event():
    """
    搴旂敤鍏抽棴浜嬩欢
    """
    print("Application shutdown")

@app.get("/")
async def root():
    """
    鏍硅矾鐢憋紝鐢ㄤ簬鍋ュ悍妫€鏌?
    """
    return {
        "message": "娆㈣繋浣跨敤鏂囩敓鍥惧浘鐗囧簱 API",
        "status": "running",
        "docs_url": "/docs",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """
    鍋ュ悍妫€鏌ョ鐐?
    鐢ㄤ簬鐩戞帶搴旂敤鏄惁姝ｅ父杩愯
    """
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    # 浣跨敤 uvicorn 杩愯 FastAPI 搴旂敤
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True  # 寮€鍙戞ā寮忎笅鑷姩閲嶈浇
    )
