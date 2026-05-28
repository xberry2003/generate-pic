"""
鏁版嵁搴撻厤缃拰鍒濆鍖栨枃浠?

鏈枃浠跺寘鍚細
1. SQLAlchemy 鏁版嵁搴撹繛鎺ラ厤缃?
2. 鏁版嵁搴撲細璇濈鐞?
3. 鏁版嵁搴撹〃鍒濆鍖?
"""

import os
from sqlalchemy import create_engine, text
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
    ensure_image_columns()
    ensure_workspace_row_columns()
    print(f"Database initialized: {DATABASE_URL}")


def ensure_image_columns():
    """
    兼容旧 SQLite 数据库。
    SQLAlchemy 的 create_all 不会给已存在表自动加列，所以这里用轻量 ALTER TABLE 补齐新增字段。
    """

    if "sqlite" not in DATABASE_URL:
        return

    expected_columns = {
        "file_name": "VARCHAR(255)",
        "storage_provider": "VARCHAR(50)",
        "remote_path": "VARCHAR(1000)",
        "download_url": "VARCHAR(255)",
        "mime_type": "VARCHAR(100)",
        "file_size": "INTEGER",
        "source": "VARCHAR(50)",
        "status": "VARCHAR(50)",
        "updated_at": "DATETIME",
    }
    with engine.begin() as connection:
        existing = {row[1] for row in connection.execute(text("PRAGMA table_info(images)"))}
        for column_name, column_type in expected_columns.items():
            if column_name not in existing:
                connection.execute(text(f"ALTER TABLE images ADD COLUMN {column_name} {column_type}"))


def ensure_workspace_row_columns():
    """
    Keep existing SQLite databases compatible after adding workspace draft rows.
    """

    if "sqlite" not in DATABASE_URL:
        return

    expected_columns = {
        "user_id": "VARCHAR(255)",
        "row_key": "VARCHAR(255)",
        "original_prompt": "TEXT",
        "expanded_prompt": "TEXT",
        "expanded_prompt_touched": "INTEGER DEFAULT 0",
        "keywords": "TEXT",
        "count": "INTEGER DEFAULT 1",
        "status": "VARCHAR(50)",
        "uploaded": "INTEGER DEFAULT 0",
        "cos_key": "VARCHAR(1000)",
        "preview_url": "VARCHAR(1000)",
        "download_url": "VARCHAR(1000)",
        "image_db_id": "INTEGER",
        "error_message": "TEXT",
        "generation_prompt_snapshot": "TEXT",
        "generated_at": "DATETIME",
        "created_at": "DATETIME",
        "updated_at": "DATETIME",
    }
    with engine.begin() as connection:
        tables = {row[0] for row in connection.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
        if "workspace_rows" not in tables:
            return
        existing = {row[1] for row in connection.execute(text("PRAGMA table_info(workspace_rows)"))}
        for column_name, column_type in expected_columns.items():
            if column_name not in existing:
                connection.execute(text(f"ALTER TABLE workspace_rows ADD COLUMN {column_name} {column_type}"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_workspace_rows_user_id ON workspace_rows (user_id)"))
