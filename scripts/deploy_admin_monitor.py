from __future__ import annotations

import os
import posixpath
import shlex
import socket
import sys
import time
from pathlib import Path

import paramiko


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "backend" / ".env"
REMOTE_ROOT = "/www/wwwroot/text2image-workspace"
REMOTE_BACKEND = f"{REMOTE_ROOT}/backend"
REMOTE_ADMIN = f"{REMOTE_ROOT}/admin-frontend"
SERVER_NAME = "43.142.31.198"
MONITOR_PORT = 9875


BACKEND_FILES = [
    "backend/app/database.py",
    "backend/app/main.py",
    "backend/app/models.py",
    "backend/app/routes/generate.py",
    "backend/app/routes/admin_usage.py",
    "backend/app/services/usage_monitor_service.py",
    "backend/app/services/employee_auth_service.py",
]


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def connect(env: dict[str, str]) -> paramiko.SSHClient:
    host = env.get("SFTP_HOST") or SERVER_NAME
    port = int(env.get("SFTP_PORT") or "22")
    username = env.get("SFTP_USERNAME") or "root"
    password = env.get("SFTP_PASSWORD") or None
    key_path = env.get("SFTP_PRIVATE_KEY_PATH") or ""

    kwargs = {
        "hostname": host,
        "port": port,
        "username": username,
        "timeout": 20,
        "banner_timeout": 20,
        "auth_timeout": 20,
    }
    if key_path and Path(key_path).exists():
        kwargs["key_filename"] = key_path
    if password:
        kwargs["password"] = password

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(**kwargs)
    return client


def run(client: paramiko.SSHClient, command: str, check: bool = True) -> str:
    print(f"$ {command}")
    stdin, stdout, stderr = client.exec_command(command)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        sys.stdout.buffer.write((out.rstrip() + "\n").encode("utf-8", "replace"))
    if err.strip():
        sys.stderr.buffer.write((err.rstrip() + "\n").encode("utf-8", "replace"))
    if check and code != 0:
        raise RuntimeError(f"Remote command failed ({code}): {command}")
    return out


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts = remote_dir.strip("/").split("/")
    current = ""
    for part in parts:
        current = f"{current}/{part}" if current else f"/{part}"
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload_file(sftp: paramiko.SFTPClient, local: Path, remote: str) -> None:
    ensure_remote_dir(sftp, posixpath.dirname(remote))
    sftp.put(str(local), remote)
    print(f"uploaded {local.relative_to(ROOT)} -> {remote}")


def upload_tree(sftp: paramiko.SFTPClient, local_dir: Path, remote_dir: str) -> None:
    for path in local_dir.rglob("*"):
        if path.is_dir():
            continue
        rel = path.relative_to(local_dir).as_posix()
        upload_file(sftp, path, posixpath.join(remote_dir, rel))


def nginx_config() -> str:
    return f"""server {{
    listen {MONITOR_PORT};
    server_name {SERVER_NAME};

    root {REMOTE_ADMIN}/dist;
    index index.html;

    client_max_body_size 50m;

    access_log {REMOTE_ROOT}/logs/monitor-nginx-access.log;
    error_log {REMOTE_ROOT}/logs/monitor-nginx-error.log;

    location / {{
        try_files $uri $uri/ /index.html;
    }}

    location /api/ {{
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_connect_timeout 60s;
        proxy_buffering off;
    }}
}}
"""


def main() -> int:
    if not ENV_PATH.exists():
        raise SystemExit(f"Missing {ENV_PATH}")
    dist_dir = ROOT / "admin-frontend" / "dist"
    if not dist_dir.exists():
        raise SystemExit("admin-frontend/dist is missing. Run npm run build first.")

    env = read_env(ENV_PATH)
    client = connect(env)
    try:
        sftp = client.open_sftp()
        try:
            run(client, f"mkdir -p {shlex.quote(REMOTE_ADMIN + '/dist')} {shlex.quote(REMOTE_ROOT + '/logs')}")
            timestamp = time.strftime("%Y%m%d-%H%M%S")
            run(
                client,
                "mkdir -p "
                f"{shlex.quote(REMOTE_ROOT + '/backups/admin-monitor-' + timestamp)}",
            )
            for rel in BACKEND_FILES:
                local = ROOT / rel
                if not local.exists():
                    raise FileNotFoundError(local)
                remote = posixpath.join(REMOTE_ROOT, rel.replace("\\", "/"))
                backup = posixpath.join(REMOTE_ROOT, "backups", f"admin-monitor-{timestamp}", rel.replace("\\", "/"))
                run(
                    client,
                    f"if [ -f {shlex.quote(remote)} ]; then mkdir -p {shlex.quote(posixpath.dirname(backup))} && cp {shlex.quote(remote)} {shlex.quote(backup)}; fi",
                )
                upload_file(sftp, local, remote)

            upload_tree(sftp, dist_dir, f"{REMOTE_ADMIN}/dist")

            nginx_dir = run(
                client,
                "for d in /www/server/panel/vhost/nginx /www/server/nginx/conf/vhost /etc/nginx/conf.d; do "
                "if [ -d \"$d\" ]; then echo \"$d\"; exit 0; fi; done; exit 1",
            ).strip().splitlines()[-1]
            remote_conf = posixpath.join(nginx_dir, "text2image-monitor.conf")
            tmp_conf = f"/tmp/text2image-monitor-{timestamp}.conf"
            with sftp.file(tmp_conf, "w") as fp:
                fp.write(nginx_config())
            run(client, f"mv {shlex.quote(tmp_conf)} {shlex.quote(remote_conf)}")

            run(client, f"cd {shlex.quote(REMOTE_ROOT + '/deploy')} && pm2 reload ecosystem.config.js --only text2image-api --update-env")
            run(client, "nginx -t")
            run(client, "nginx -s reload || systemctl reload nginx")

            print("Deployment complete.")
            print(f"Monitor URL: http://{SERVER_NAME}:{MONITOR_PORT}/")
            return 0
        finally:
            sftp.close()
    finally:
        client.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, socket.error, paramiko.SSHException, RuntimeError) as exc:
        print(f"Deployment failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
