from __future__ import annotations

from deploy_admin_monitor import ENV_PATH, connect, read_env, run


def main() -> int:
    client = connect(read_env(ENV_PATH))
    try:
        commands = [
            "curl -sS -i --max-time 10 'http://127.0.0.1:18792/api/products/usage-stats?basis=events' | head -120 || true",
            "curl -sS -i --max-time 10 'http://127.0.0.1:18792/api/products/usage-stats?basis=manual' | head -120 || true",
            "curl -sS -i --max-time 10 'http://127.0.0.1:18792/api/products' | head -80 || true",
            "curl -sS -i --max-time 10 -X POST 'http://127.0.0.1:18792/api/products/usage-events' -H 'Content-Type: application/json' -d '{\"product_name\":\"__codex_nonexistent_product__\"}' | head -80 || true",
        ]
        for command in commands:
            run(client, command, check=False)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
