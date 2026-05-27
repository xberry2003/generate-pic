import io
import base64
import os
import posixpath
import re
import tempfile
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Iterator

import paramiko
from qcloud_cos import CosConfig, CosS3Client
from qcloud_cos.cos_exception import CosClientError, CosServiceError
from dotenv import load_dotenv
from PIL import Image

load_dotenv()

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


class RemoteStorageError(Exception):
    """远程存储错误，路由层会把它转换成清晰的 HTTP 错误。"""


@dataclass
class RemoteFileInfo:
    """远程图片文件信息，上传成功、下载预览、远程目录同步都会使用这个结构。"""

    file_name: str
    remote_path: str
    file_size: int
    modified_at: datetime | None = None
    mime_type: str = "image/png"


def get_storage_config() -> dict:
    """
    从 .env 读取 SFTP 配置。
    注意：密码和私钥内容只在后端内存中使用，不会返回给前端，也不要在日志中打印。
    """

    return {
        "provider": os.getenv("STORAGE_PROVIDER", "sftp").strip() or "sftp",
        "cos_secret_id": os.getenv("COS_SECRET_ID", "").strip(),
        "cos_secret_key": os.getenv("COS_SECRET_KEY", "").strip(),
        "cos_region": os.getenv("COS_REGION", "ap-shanghai").strip(),
        "cos_bucket": os.getenv("COS_BUCKET", "").strip(),
        "cos_key_prefix": os.getenv("COS_KEY_PREFIX", "").strip().strip("/"),
        "cos_public_base_url": os.getenv("COS_PUBLIC_BASE_URL", "").strip().rstrip("/"),
        "host": os.getenv("SFTP_HOST", "").strip(),
        "port": int(os.getenv("SFTP_PORT", "22")),
        "username": os.getenv("SFTP_USERNAME", "").strip(),
        "private_key_path": os.getenv("SFTP_PRIVATE_KEY_PATH", "").strip(),
        "password": os.getenv("SFTP_PASSWORD", "").strip(),
        "remote_dir": os.getenv("SFTP_REMOTE_DIR", "/data/ppt-素材/图片素材").strip(),
        "sync_dirs": [
            item.strip()
            for item in os.getenv("SFTP_SYNC_DIRS", "").split(",")
            if item.strip()
        ],
        "public_base_url": os.getenv("IMAGE_PUBLIC_BASE_URL", "").strip().rstrip("/"),
    }


def storage_configured() -> bool:
    """
    判断 SFTP 是否已配置完成。
    支持两种认证方式：真实私钥文件或 SSH 登录密码；只要存在其中一种即可尝试连接。
    """

    config = get_storage_config()
    if config["provider"] == "cos":
        return bool(
            config["cos_secret_id"]
            and config["cos_secret_key"]
            and config["cos_region"]
            and config["cos_bucket"]
        )
    has_key = bool(
        config["private_key_path"]
        and os.path.exists(config["private_key_path"])
        and os.path.getsize(config["private_key_path"]) > 0
    )
    has_password = bool(config["password"])
    return bool(config["host"] and config["username"] and config["remote_dir"] and (has_key or has_password))


def load_private_key(private_key_path: str) -> paramiko.PKey:
    """
    加载本机 SSH 私钥文件。
    兼容 RSA、Ed25519、ECDSA、DSS 等常见格式；失败时只返回错误类型，不打印私钥内容。
    """

    key_classes = (
        paramiko.RSAKey,
        paramiko.Ed25519Key,
        paramiko.ECDSAKey,
        paramiko.DSSKey,
    )
    last_error: Exception | None = None
    for key_class in key_classes:
        try:
            return key_class.from_private_key_file(private_key_path)
        except Exception as exc:
            last_error = exc
    raise RemoteStorageError(f"无法读取 SFTP 私钥文件：{last_error.__class__.__name__}") from last_error


def generate_image_filename(description: str = "", prompt: str = "") -> str:
    """
    根据 description 或 prompt 生成安全文件名。
    数据流：前端描述 -> 清洗非法路径字符 -> 截断过长主体 -> 追加时间戳和短 uuid -> 固定 .png 后缀。
    """

    base_text = (description or prompt or "image").strip().lower()
    base_text = re.sub(r'[/\\:*?"<>|\r\n\t]+', " ", base_text)
    base_text = re.sub(r"[^a-z0-9_-]+", "-", base_text)
    base_text = re.sub(r"-+", "-", base_text).strip("-_")
    base_text = base_text[:60].strip("-_") or "image"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    short_id = uuid.uuid4().hex[:6]
    return f"{base_text}_{timestamp}_{short_id}.png"


def description_from_filename(file_name: str) -> str:
    """
    远程目录同步时，从文件名反推出描述。
    规则：去掉扩展名、去掉本项目生成时追加的时间戳和短 uuid，并把下划线整理成可搜索的自然描述。
    """

    stem = os.path.splitext(file_name)[0]
    stem = re.sub(r"_\d{8}_\d{6}_[0-9a-fA-F]{6,8}$", "", stem)
    stem = re.sub(r"[_\s]+", " ", stem).strip()
    return stem or file_name


def normalize_image_to_png_bytes(image_bytes: bytes) -> bytes:
    """
    统一把生成或上传的图片转换成 PNG bytes。
    这样无论上游返回 jpg、webp 还是 png，最终上传到公司挂载目录的格式都稳定为 png。
    """

    with Image.open(io.BytesIO(image_bytes)) as image:
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        output = io.BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()


class SFTPStorageClient:
    """
    SFTP 存储客户端。
    每次上传、下载、列举都临时建立连接，用完立即关闭，避免长连接断开影响后续生成任务。
    """

    def __init__(self, config: dict | None = None):
        self.config = config or get_storage_config()

    def ensure_configured(self) -> None:
        """在真实连接前做本地配置校验，缺 host、用户名、目录或认证信息时直接给清晰错误。"""

        if not storage_configured():
            raise RemoteStorageError(f"{self.config['provider'].upper()} storage is not configured")

    def cos_client(self) -> CosS3Client:
        self.ensure_configured()
        config = CosConfig(
            Region=self.config["cos_region"],
            SecretId=self.config["cos_secret_id"],
            SecretKey=self.config["cos_secret_key"],
            Scheme="https",
        )
        return CosS3Client(config)

    def cos_key_for(self, remote_filename: str) -> str:
        safe_name = posixpath.basename(remote_filename)
        prefix = self.config["cos_key_prefix"]
        return posixpath.join(prefix, safe_name) if prefix else safe_name

    def upload_bytes_to_cos(self, data: bytes, remote_filename: str) -> RemoteFileInfo:
        key = self.cos_key_for(remote_filename)
        try:
            self.cos_client().put_object(
                Bucket=self.config["cos_bucket"],
                Body=data,
                Key=key,
                ContentType="image/png",
            )
        except (CosClientError, CosServiceError) as exc:
            raise RemoteStorageError(f"COS upload failed for {key}: {exc.__class__.__name__}: {exc}") from exc

        return RemoteFileInfo(
            file_name=posixpath.basename(remote_filename),
            remote_path=key,
            file_size=len(data),
            modified_at=datetime.utcnow(),
            mime_type="image/png",
        )

    @contextmanager
    def ssh_connect(self) -> Iterator[paramiko.SSHClient]:
        self.ensure_configured()
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        private_key_path = self.config.get("private_key_path", "")
        try:
            connect_kwargs = {
                "hostname": self.config["host"],
                "port": self.config["port"],
                "username": self.config["username"],
                "timeout": 30,
            }
            if private_key_path and os.path.exists(private_key_path) and os.path.getsize(private_key_path) > 0:
                connect_kwargs["pkey"] = load_private_key(private_key_path)
            else:
                connect_kwargs["password"] = self.config["password"]
            ssh.connect(**connect_kwargs)
            yield ssh
        except Exception as exc:
            raise RemoteStorageError(f"SSH operation failed: {exc.__class__.__name__}: {exc}") from exc
        finally:
            ssh.close()

    @contextmanager
    def connect(self) -> Iterator[paramiko.SFTPClient]:
        """
        创建 SFTP 连接。
        优先使用私钥文件；如果私钥路径为空或文件不存在，则使用 SFTP_PASSWORD 密码登录。
        """

        self.ensure_configured()
        transport = None
        sftp = None
        try:
            transport = paramiko.Transport((self.config["host"], self.config["port"]))
            private_key_path = self.config.get("private_key_path", "")
            if private_key_path and os.path.exists(private_key_path) and os.path.getsize(private_key_path) > 0:
                key = load_private_key(private_key_path)
                transport.connect(username=self.config["username"], pkey=key)
            else:
                transport.connect(username=self.config["username"], password=self.config["password"])
            sftp = paramiko.SFTPClient.from_transport(transport)
            yield sftp
        except Exception as exc:
            raise RemoteStorageError(f"SFTP operation failed: {exc.__class__.__name__}: {exc}") from exc
        finally:
            if sftp:
                sftp.close()
            if transport:
                transport.close()

    def ensure_remote_dir(self, sftp: paramiko.SFTPClient | None = None) -> None:
        """递归创建远程目录，统一使用 POSIX 路径，避免 Windows 反斜杠进入远程路径。"""

        def create_dirs(active_sftp: paramiko.SFTPClient):
            remote_dir = self.config["remote_dir"].replace("\\", "/")
            parts = [part for part in remote_dir.split("/") if part]
            current = "/" if remote_dir.startswith("/") else "."
            for part in parts:
                current = posixpath.join(current, part)
                try:
                    active_sftp.stat(current)
                except IOError:
                    active_sftp.mkdir(current)

        if sftp:
            create_dirs(sftp)
            return
        with self.connect() as active_sftp:
            create_dirs(active_sftp)

    def upload_bytes(self, data: bytes, remote_filename: str) -> RemoteFileInfo:
        """
        上传图片 bytes 到远程目录。
        先写临时文件，再 rename 成最终文件名，避免前端同步时读到半个文件。
        """

        if self.config["provider"] == "cos":
            return self.upload_bytes_to_cos(data, remote_filename)

        safe_name = posixpath.basename(remote_filename)
        remote_dir = self.config["remote_dir"].replace("\\", "/")
        remote_path = posixpath.join(remote_dir, safe_name)
        with self.connect() as sftp:
            self.ensure_remote_dir(sftp)

        try:
            stat = self.upload_bytes_via_ssh(data, remote_path)
        except RemoteStorageError:
            raise
        return RemoteFileInfo(
            file_name=safe_name,
            remote_path=remote_path,
            file_size=stat.st_size,
            modified_at=datetime.fromtimestamp(stat.st_mtime),
            mime_type="image/png",
        )

    def upload_bytes_via_ssh(self, data: bytes, remote_path: str):
        try:
            with self.ssh_connect() as ssh:
                escaped_path = "'" + remote_path.replace("'", "'\"'\"'") + "'"
                command = f"base64 -d > {escaped_path} && stat -c %s {escaped_path}"
                stdin, stdout, stderr = ssh.exec_command(command)
                stdin.write(base64.b64encode(data).decode("ascii"))
                stdin.channel.shutdown_write()
                exit_status = stdout.channel.recv_exit_status()
                stdout_text = stdout.read().decode("utf-8", errors="replace").strip()
                stderr_text = stderr.read().decode("utf-8", errors="replace").strip()
                if exit_status != 0:
                    raise RemoteStorageError(
                        f"SSH upload command failed for {remote_path}: exit {exit_status}: {stderr_text}"
                    )
                remote_size = int(stdout_text.splitlines()[-1])
                if remote_size != len(data):
                    raise RemoteStorageError(
                        f"SSH upload size mismatch for {remote_path}: {remote_size} != {len(data)}"
                    )
                with self.connect() as sftp:
                    return sftp.stat(remote_path)
        except RemoteStorageError:
            raise
        except Exception as exc:
            raise RemoteStorageError(
                f"SSH upload failed for {remote_path}: {exc.__class__.__name__}: {exc}"
            ) from exc

    def download_bytes(self, remote_path: str) -> bytes:
        """
        通过数据库记录中的 remote_path 下载远程图片。
        路由层只接收图片 id，不允许前端直接传任意路径，避免任意文件读取风险。
        """

        if self.config["provider"] == "cos":
            try:
                response = self.cos_client().get_object(
                    Bucket=self.config["cos_bucket"],
                    Key=remote_path,
                )
                return response["Body"].get_raw_stream().read()
            except (CosClientError, CosServiceError) as exc:
                raise RemoteStorageError(f"COS download failed for {remote_path}: {exc.__class__.__name__}: {exc}") from exc

        with self.connect() as sftp:
            with sftp.file(remote_path, "rb") as remote_file:
                return remote_file.read()

    def list_images(self) -> list[RemoteFileInfo]:
        """
        列举远程目录里的图片文件，用于 GET /api/images?sync_remote=true 同步数据库。
        默认扫描 SFTP_REMOTE_DIR；如果配置了 SFTP_SYNC_DIRS，则额外扫描这些服务器目录。
        只接受 png、jpg、jpeg、webp，跳过其他文件。
        """

        raw_dirs = [self.config["remote_dir"], *self.config.get("sync_dirs", [])]
        remote_dirs = []
        for raw_dir in raw_dirs:
            remote_dir = raw_dir.replace("\\", "/").rstrip("/")
            if remote_dir and remote_dir not in remote_dirs:
                remote_dirs.append(remote_dir)

        with self.connect() as sftp:
            results = []
            for remote_dir in remote_dirs:
                # 主上传目录不存在时尝试创建；额外同步目录不存在时跳过，避免一个旧目录影响整个图库。
                if remote_dir == self.config["remote_dir"].replace("\\", "/").rstrip("/"):
                    self.ensure_remote_dir(sftp)
                try:
                    attrs = sftp.listdir_attr(remote_dir)
                except IOError:
                    continue

                for attr in attrs:
                    file_name = attr.filename
                    ext = os.path.splitext(file_name)[1].lower()
                    if ext not in ALLOWED_IMAGE_EXTENSIONS:
                        continue
                    remote_path = posixpath.join(remote_dir, file_name)
                    mime_type = "image/png" if ext == ".png" else f"image/{ext.lstrip('.')}"
                    results.append(
                        RemoteFileInfo(
                            file_name=file_name,
                            remote_path=remote_path,
                            file_size=attr.st_size,
                            modified_at=datetime.fromtimestamp(attr.st_mtime),
                            mime_type=mime_type,
                        )
                    )
            return results

    def health(self) -> dict:
        """
        存储健康检查。
        返回 host、remote_dir、是否配置、是否能连通；不返回密码、私钥路径内容或私钥文本。
        """

        configured = storage_configured()
        result = {
            "success": True,
            "provider": self.config["provider"],
            "configured": configured,
            "host": self.config["host"] if self.config["provider"] != "cos" else self.config["cos_bucket"],
            "remote_dir": self.config["remote_dir"] if self.config["provider"] != "cos" else self.config["cos_key_prefix"],
            "can_connect": False,
        }
        if not configured:
            result["error"] = f"{self.config['provider'].upper()} storage is not configured"
            return result
        try:
            if self.config["provider"] == "cos":
                self.cos_client().head_bucket(Bucket=self.config["cos_bucket"])
            else:
                with self.connect() as sftp:
                    self.ensure_remote_dir(sftp)
            result["can_connect"] = True
        except RemoteStorageError as exc:
            result["error"] = str(exc)
        return result
