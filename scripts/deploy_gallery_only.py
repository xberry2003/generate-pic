"""Deploy the standalone gallery and its required authorization endpoints only.

This intentionally does not copy ``frontend/`` or any generation/workspace route.
Pass the existing server directory that Nginx uses for ``/gallery/`` as
``--static-dir``. The script backs up every file it replaces before uploading.
"""

from __future__ import annotations

import argparse
import posixpath
import shlex
import socket
import sys
import time
from pathlib import Path

import paramiko

from deploy_admin_monitor import ENV_PATH, REMOTE_ROOT, connect, read_env, run, upload_file, upload_tree


ROOT = Path(__file__).resolve().parents[1]
BACKEND_FILES = (
    "backend/app/routes/images.py",
    "backend/app/services/auth_service.py",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy only the standalone AI gallery")
    parser.add_argument(
        "--static-dir",
        required=True,
        help="Existing server directory served by Nginx at /gallery/ (for example /www/wwwroot/ai-gallery)",
    )
    parser.add_argument(
        "--skip-backend",
        action="store_true",
        help="Upload static gallery files only; use only after the required backend files are already live.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dist_dir = ROOT / "standalone-gallery" / "dist"
    if not dist_dir.exists():
        raise SystemExit("standalone-gallery/dist is missing. Run npm run build first.")
    if not ENV_PATH.exists():
        raise SystemExit(f"Missing {ENV_PATH}")

    env = read_env(ENV_PATH)
    client = connect(env)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    try:
        sftp = client.open_sftp()
        try:
            static_dir = args.static_dir.rstrip("/")
            backup_dir = f"{REMOTE_ROOT}/backups/gallery-only-{timestamp}"
            run(client, f"test -d {shlex.quote(static_dir)}")
            run(client, f"mkdir -p {shlex.quote(backup_dir)}")
            run(client, f"cp -a {shlex.quote(static_dir)}/. {shlex.quote(backup_dir)}/static")
            upload_tree(sftp, dist_dir, static_dir)

            if not args.skip_backend:
                for relative_path in BACKEND_FILES:
                    local_path = ROOT / relative_path
                    if not local_path.exists():
                        raise FileNotFoundError(local_path)
                    remote_path = posixpath.join(REMOTE_ROOT, relative_path)
                    backup_path = posixpath.join(backup_dir, relative_path)
                    run(
                        client,
                        f"if [ -f {shlex.quote(remote_path)} ]; then "
                        f"mkdir -p {shlex.quote(posixpath.dirname(backup_path))} && "
                        f"cp {shlex.quote(remote_path)} {shlex.quote(backup_path)}; fi",
                    )
                    upload_file(sftp, local_path, remote_path)
                run(
                    client,
                    f"cd {shlex.quote(REMOTE_ROOT + '/deploy')} && "
                    "pm2 reload ecosystem.config.js --only text2image-api --update-env",
                )

            print("Gallery-only deployment complete.")
            print(f"Backup: {backup_dir}")
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
