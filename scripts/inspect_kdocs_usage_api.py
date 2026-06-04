from __future__ import annotations

from deploy_admin_monitor import ENV_PATH, connect, read_env, run


def main() -> int:
    client = connect(read_env(ENV_PATH))
    try:
        commands = [
            "curl -sS -i --max-time 10 'http://127.0.0.1/kdocs-sync/api/products/usage-stats?basis=events' | head -120 || true",
            "curl -sS -i --max-time 10 'http://127.0.0.1/kdocs-sync/api/products/usage-stats?basis=manual' | head -120 || true",
            "curl -sS -i --max-time 10 'http://127.0.0.1/kdocs-sync/api/products' | head -80 || true",
            "nginx -T 2>/dev/null | grep -n 'kdocs-sync\\|9875\\|text2image-monitor' | head -160 || true",
            "pm2 list | grep -i 'kdocs\\|sync\\|product' || true",
        ]
        for command in commands:
            run(client, command, check=False)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
