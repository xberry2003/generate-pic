# Text2Image Workspace Deployment Guide

This guide deploys the text-to-image workspace to Tencent Cloud Linux.

Target server:

- IP: `43.142.31.198`
- Deploy root: `/www/wwwroot/text2image-workspace`
- Frontend: Vite build served by Nginx
- Backend: FastAPI served on `127.0.0.1:8000`
- Process manager: PM2
- Database: local SQLite
- Images: Tencent COS

Do not commit real `.env` files, API keys, COS keys, SSH private keys, or SQLite database files.

## Directory Structure

Recommended server layout:

```text
/www/wwwroot/text2image-workspace/
  frontend/
    dist/
  backend/
    app/
    requirements.txt
    .env
    venv/
    data/
      app.db
  deploy/
    ecosystem.config.js
    nginx-text2image.conf
  logs/
```

SQLite should stay on the server local disk:

```text
/www/wwwroot/text2image-workspace/backend/data/app.db
```

Do not put SQLite under a COS mount directory.

## Server Requirements

Checked server environment is suitable:

- OpenCloudOS 9.4
- Node.js 20+
- npm 10+
- Python 3.11+
- pip3
- Nginx 1.26+
- PM2 6+

Useful checks:

```bash
node -v
npm -v
python3 --version
pip3 --version
nginx -v
pm2 -v
df -h
```

Disk warning: the server was around 86% used during inspection. Keep enough free space for dependencies, logs, and SQLite.

## Environment File

Create this file on the server:

```text
/www/wwwroot/text2image-workspace/backend/.env
```

Use `deploy/.env.production.example` as a template. Fill in real values only on the server.

Important project variables:

```env
DATABASE_URL=sqlite:////www/wwwroot/text2image-workspace/backend/data/app.db

ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_me
AUTH_SECRET_KEY=change_me_random_session_secret

MINIMAX_API_BASE_URL=https://api.minimax.chat
MINIMAX_API_KEY=change_me
MINIMAX_MODEL=image-01
MINIMAX_IMAGE_ENDPOINT=/v1/image_generation
MINIMAX_RESPONSE_FORMAT=base64
MINIMAX_ASPECT_RATIO=1:1
MINIMAX_PROMPT_OPTIMIZER=true
MINIMAX_TIMEOUT_SECONDS=180
MINIMAX_SAVE_DIR=uploads/images

STORAGE_PROVIDER=cos
COS_SECRET_ID=change_me
COS_SECRET_KEY=change_me
COS_REGION=ap-shanghai
COS_BUCKET=change_me
COS_KEY_PREFIX=ppt-素材/图片素材/
COS_PUBLIC_BASE_URL=
```

Keep `COS_KEY_PREFIX` exactly as:

```text
ppt-素材/图片素材/
```

Make sure the server `.env` is saved as UTF-8. The deploy script validates this before it builds or restarts the service. It also checks that `COS_KEY_PREFIX` is exactly:

```text
ppt-素材/图片素材/
```

If the file is not UTF-8 or the prefix is wrong, `deploy/deploy.sh` stops immediately.

## Frontend Build

Run on the server:

```bash
cd /www/wwwroot/text2image-workspace/frontend
npm install
npm run build
```

The build output is:

```text
/www/wwwroot/text2image-workspace/frontend/dist
```

The frontend uses same-origin `/api` by default, so production requires Nginx to proxy `/api` to the FastAPI backend.

## Backend Setup

Run on the server:

```bash
cd /www/wwwroot/text2image-workspace/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
mkdir -p data
```

Manual backend start for testing:

```bash
cd /www/wwwroot/text2image-workspace/backend
source venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Do not expose backend port `8000` directly to the public internet. Keep it behind Nginx.

## PM2 Start

Copy `deploy/ecosystem.config.js` to the server with the project, then run:

```bash
cd /www/wwwroot/text2image-workspace/deploy
pm2 start ecosystem.config.js
pm2 save
pm2 status
pm2 logs text2image-api
```

Restart after code updates:

```bash
cd /www/wwwroot/text2image-workspace/deploy
pm2 reload ecosystem.config.js --only text2image-api --update-env
```

## Nginx Configuration

Use `deploy/nginx-text2image.conf` as the site config template.

Typical install location on this server may be one of:

```text
/www/server/panel/vhost/nginx/text2image-workspace.conf
/www/server/nginx/conf/vhost/text2image-workspace.conf
/etc/nginx/conf.d/text2image-workspace.conf
```

The config serves:

- `/` from `frontend/dist`
- `/api/` through `http://127.0.0.1:8000/api/`
- optional `/health` through `http://127.0.0.1:8000/health`

After adding the config:

```bash
nginx -t
systemctl reload nginx
```

If using a domain, update `server_name` in the Nginx config. If testing by IP, use `server_name 43.142.31.198;`.

## Automated Deploy Script

`deploy/deploy.sh` is a helper script intended to run on the server from the project root:

```bash
cd /www/wwwroot/text2image-workspace
bash deploy/deploy.sh
```

It will:

- check Node/npm/Python/pip/PM2
- install frontend dependencies
- build frontend
- create backend virtualenv
- install backend requirements
- create `backend/data`
- create `.env` from example only if `.env` does not exist
- preserve existing SQLite database
- start or reload PM2 service

It will not:

- write real API keys
- delete existing server files
- overwrite existing `.env`
- overwrite existing SQLite database
- change Nginx configuration automatically

## Rollback

Recommended rollback approach:

1. Before replacing files, backup the current deployed directory:

```bash
cd /www/wwwroot
tar -czf text2image-workspace-backup-$(date +%Y%m%d-%H%M%S).tar.gz text2image-workspace
```

2. Preserve database:

```bash
cp /www/wwwroot/text2image-workspace/backend/data/app.db \
   /www/wwwroot/text2image-workspace/backend/data/app.db.bak-$(date +%Y%m%d-%H%M%S)
```

3. To rollback code, restore the backup directory or switch back to the previous release.

4. Restart backend:

```bash
cd /www/wwwroot/text2image-workspace/deploy
pm2 reload ecosystem.config.js --only text2image-api --update-env
```

5. Reload Nginx only if Nginx config changed:

```bash
nginx -t && systemctl reload nginx
```

## Troubleshooting

Frontend opens but login fails:

- Check Nginx `/api/` proxy.
- Check backend PM2 status.
- Check browser request path is `/api/auth/login`.

Backend cannot start:

```bash
pm2 logs text2image-api
cd /www/wwwroot/text2image-workspace/backend
source venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

SQLite errors:

- Check `DATABASE_URL`.
- Check `backend/data` exists.
- Check write permission for the backend process user.
- Avoid multiple backend workers with SQLite.

COS upload fails:

- Check `STORAGE_PROVIDER=cos`.
- Check `COS_SECRET_ID`, `COS_SECRET_KEY`, `COS_REGION`, `COS_BUCKET`.
- Check `COS_KEY_PREFIX=ppt-素材/图片素材/`.
- Confirm the server `.env` file is UTF-8. `deploy/deploy.sh` now performs this check automatically.

MiniMax generation fails:

- Check `MINIMAX_API_KEY`.
- Check network access from server.
- Check `MINIMAX_TIMEOUT_SECONDS`.

Login resets after restart:

- Make sure `AUTH_SECRET_KEY` is fixed and does not change between deploys.

Nginx config fails:

```bash
nginx -t
systemctl status nginx --no-pager
```

Port conflict:

```bash
ss -tulpn | grep -E ':80|:443|:8000|:3000|:5173'
```
