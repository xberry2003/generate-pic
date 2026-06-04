from __future__ import annotations

from deploy_admin_monitor import ENV_PATH, connect, read_env, run


def main() -> int:
    client = connect(read_env(ENV_PATH))
    try:
        commands = [
            "curl -sS -I --max-time 10 'http://127.0.0.1:9875/' || true",
            "curl -sS --max-time 10 'http://127.0.0.1:9875/api/admin/usage/daily' | head -c 400 || true",
            "curl -sS -i --max-time 10 'http://127.0.0.1:9875/kdocs-sync/api/products/usage-stats?basis=events' | head -120 || true",
            "nginx -T 2>/dev/null | grep -n '9875\\|kdocs-sync\\|127.0.0.1:18792\\|127.0.0.1:8000' | head -120 || true",
        ]
        for command in commands:
            run(client, command, check=False)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
