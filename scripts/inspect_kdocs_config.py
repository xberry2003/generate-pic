from __future__ import annotations

from deploy_admin_monitor import ENV_PATH, connect, read_env, run


def main() -> int:
    client = connect(read_env(ENV_PATH))
    try:
        commands = [
            "sed -n '1,220p' /www/server/panel/vhost/nginx/extension/43.142.31.198/kdocs-sync.conf 2>/dev/null || true",
            "sed -n '1,220p' /www/server/panel/vhost/nginx/text2image-monitor.conf 2>/dev/null || true",
            "pm2 describe kdocs-airscript-sync || true",
            "find /www/wwwroot -maxdepth 4 -type f \\( -name 'package.json' -o -name '*.py' -o -name 'ecosystem*.js' \\) | grep -i 'kdocs\\|sync\\|product' | head -120 || true",
            "ss -tulpn | grep -E 'kdocs|1722642|:30|:40|:50|:80|:9875' || true",
        ]
        for command in commands:
            run(client, command, check=False)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
