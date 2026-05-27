import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.remote_storage_service import SFTPStorageClient


def main():
    """
    本地 SFTP 连通性测试。
    只打印 host、remote_dir、can_connect，不打印私钥内容。
    """

    load_dotenv(BACKEND_DIR / ".env")
    result = SFTPStorageClient().health()
    print(result)


if __name__ == "__main__":
    main()
