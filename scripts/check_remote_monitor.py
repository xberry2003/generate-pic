from __future__ import annotations

import sys

from deploy_admin_monitor import connect, read_env, run, ENV_PATH


def main() -> int:
    client = connect(read_env(ENV_PATH))
    try:
        commands = [
            "ss -tulpn | grep -E ':9875|:8000' || true",
            "firewall-cmd --state 2>/dev/null || true",
            "firewall-cmd --list-ports 2>/dev/null || true",
            "iptables -S 2>/dev/null | grep 9875 || true",
            "nginx -T 2>/dev/null | grep -n \"9875\\|text2image-monitor\\|admin-frontend\" || true",
            "curl -I --max-time 10 http://127.0.0.1:9875/ || true",
            "curl -s --max-time 10 http://127.0.0.1:9875/api/admin/usage/daily | head -c 500 || true",
            "pm2 status text2image-api || true",
            "tail -n 80 /www/wwwroot/text2image-workspace/logs/text2image-api.err.log || true",
            "tail -n 80 /www/wwwroot/text2image-workspace/logs/monitor-nginx-error.log || true",
        ]
        for command in commands:
            run(client, command, check=False)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
