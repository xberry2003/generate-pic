from __future__ import annotations

import posixpath
import shlex
import sys
import time
from pathlib import Path

import paramiko

from deploy_admin_monitor import ENV_PATH, REMOTE_ADMIN, REMOTE_ROOT, SERVER_NAME, connect, read_env, run


ROOT = Path(__file__).resolve().parents[1]
MONITOR_PORT = 9875


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

    location = /kdocs-sync {{
        return 301 /kdocs-sync/;
    }}

    location ^~ /kdocs-sync/ {{
        proxy_pass http://127.0.0.1:18792/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        client_max_body_size 8m;
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

    location / {{
        try_files $uri $uri/ /index.html;
    }}
}}
"""


def main() -> int:
    dist_dir = ROOT / "admin-frontend" / "dist"
    if not dist_dir.exists():
        raise SystemExit("admin-frontend/dist is missing. Run npm run build first.")

    client = connect(read_env(ENV_PATH))
    try:
        sftp = client.open_sftp()
        try:
            timestamp = time.strftime("%Y%m%d-%H%M%S")
            run(client, f"mkdir -p {shlex.quote(REMOTE_ADMIN + '/dist')} {shlex.quote(REMOTE_ROOT + '/logs')}")
            upload_tree(sftp, dist_dir, f"{REMOTE_ADMIN}/dist")

            nginx_dir = run(
                client,
                "for d in /www/server/panel/vhost/nginx /www/server/nginx/conf/vhost /etc/nginx/conf.d; do "
                "if [ -d \"$d\" ]; then echo \"$d\"; exit 0; fi; done; exit 1",
            ).strip().splitlines()[-1]
            remote_conf = posixpath.join(nginx_dir, "text2image-monitor.conf")
            backup_conf = f"{remote_conf}.bak-{timestamp}"
            run(client, f"if [ -f {shlex.quote(remote_conf)} ]; then cp {shlex.quote(remote_conf)} {shlex.quote(backup_conf)}; fi")
            tmp_conf = f"/tmp/text2image-monitor-{timestamp}.conf"
            with sftp.file(tmp_conf, "w") as fp:
                fp.write(nginx_config())
            run(client, f"mv {shlex.quote(tmp_conf)} {shlex.quote(remote_conf)}")
            run(client, "nginx -t")
            run(client, "nginx -s reload || systemctl reload nginx")
            print(f"Deployment complete: http://{SERVER_NAME}:{MONITOR_PORT}/")
            return 0
        finally:
            sftp.close()
    finally:
        client.close()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, paramiko.SSHException, RuntimeError) as exc:
        print(f"Deployment failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
