"""
鏁版嵁搴撻厤缃拰鍒濆鍖栨枃浠?

鏈枃浠跺寘鍚細
1. SQLAlchemy 鏁版嵁搴撹繛鎺ラ厤缃?
2. 鏁版嵁搴撲細璇濈鐞?
3. 鏁版嵁搴撹〃鍒濆鍖?
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import StaticPool

# ========== 鏁版嵁搴撻厤缃?==========
# 鑾峰彇椤圭洰鏍圭洰褰?
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# SQLite 鏁版嵁搴撴枃浠惰矾寰?
# 鍙互閫氳繃鐜鍙橀噺 DATABASE_URL 鑷畾涔夋暟鎹簱浣嶇疆
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{os.path.join(BASE_DIR, 'generate_pic.db')}"
)

# 鍒涘缓 SQLAlchemy 寮曟搸
# 浣跨敤 StaticPool 鍦?SQLite 涓幏寰楁洿濂界殑绾跨▼鏀寔
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    poolclass=StaticPool if "sqlite" in DATABASE_URL else None,
)

# 鍒涘缓浼氳瘽宸ュ巶
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 鍒涘缓澹版槑鍩虹被锛岀敤浜庡畾涔?ORM 妯″瀷
Base = declarative_base()

# ========== 鏁版嵁搴撲細璇濅緷璧?==========
def get_db():
    """
    鑾峰彇鏁版嵁搴撲細璇?
    
    杩欐槸涓€涓緷璧栧嚱鏁帮紝鐢ㄤ簬 FastAPI 鐨勪緷璧栨敞鍏ョ郴缁?
    纭繚姣忎釜璇锋眰閮芥湁鐙珛鐨勬暟鎹簱浼氳瘽
    
    浣跨敤鏂瑰紡锛?
        def my_endpoint(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ========== 鏁版嵁搴撳垵濮嬪寲鍑芥暟 ==========
def init_db():
    """
    鍒濆鍖栨暟鎹簱
    
    鍔熻兘锛?
    1. 鍒涘缓鎵€鏈夊畾涔夌殑琛?
    2. 鍦ㄥ簲鐢ㄥ惎鍔ㄦ椂璋冪敤
    
    娉ㄦ剰锛?
    - 濡傛灉琛ㄥ凡瀛樺湪锛孲QLAlchemy 涓嶄細閲嶆柊鍒涘缓
    - 杩欐槸涓€涓畨鍏ㄧ殑鎿嶄綔锛屼笉浼氳鐩栫幇鏈夋暟鎹?
    """
    # 瀵煎叆鎵€鏈夋ā鍨嬶紝纭繚瀹冧滑琚敞鍐屽埌 Base
    from app import models
    
    # 鍒涘缓鎵€鏈夎〃
    Base.metadata.create_all(bind=engine)
    print(f"Database initialized: {DATABASE_URL}")
