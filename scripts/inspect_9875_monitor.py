from __future__ import annotations

from deploy_admin_monitor import ENV_PATH, connect, read_env, run


def main() -> int:
    client = connect(read_env(ENV_PATH))
    try:
        commands = [
            "nginx -T 2>/dev/null | grep -n '9875\\|text2image-monitor\\|admin-frontend\\|kdocs-sync' | head -120 || true",
            "find /www/wwwroot -maxdepth 3 -type d \\( -name '*admin*' -o -name '*kdocs*' -o -name '*sync*' -o -name '*monitor*' \\) | sort",
            "curl -sS -i --max-time 10 http://127.0.0.1/kdocs-sync/api/products/usage-stats | head -80 || true",
            "curl -sS -i --max-time 10 http://127.0.0.1:9875/kdocs-sync/api/products/usage-stats | head -80 || true",
            "curl -sS -i --max-time 10 http://127.0.0.1:9875/api/products/usage-stats | head -80 || true",
            "pm2 list | grep -i 'kdocs\\|sync\\|product\\|text2image' || true",
        ]
        for command in commands:
            run(client, command, check=False)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
