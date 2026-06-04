#!/usr/bin/env bash
set -euo pipefail
export LANG="${LANG:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"

APP_NAME="text2image-workspace"
PM2_NAME="text2image-api"
DEPLOY_DIR="/www/wwwroot/${APP_NAME}"
FRONTEND_DIR="${DEPLOY_DIR}/frontend"
BACKEND_DIR="${DEPLOY_DIR}/backend"
DATA_DIR="${BACKEND_DIR}/data"
LOG_DIR="${DEPLOY_DIR}/logs"
ENV_FILE="${BACKEND_DIR}/.env"
ENV_EXAMPLE="${DEPLOY_DIR}/deploy/.env.production.example"
DB_FILE="${DATA_DIR}/app.db"
EXPECTED_COS_PREFIX="ppt-素材/图片素材/"

echo "== Text2Image Workspace deploy =="
echo "Deploy dir: ${DEPLOY_DIR}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

require_command node
require_command npm
require_command python3
require_command pip3
require_command pm2

if [ ! -d "${DEPLOY_DIR}" ]; then
  echo "Deploy directory does not exist: ${DEPLOY_DIR}"
  echo "Upload the project to this directory first, then rerun this script."
  exit 1
fi

if [ ! -d "${FRONTEND_DIR}" ]; then
  echo "Frontend directory missing: ${FRONTEND_DIR}"
  exit 1
fi

if [ ! -d "${BACKEND_DIR}" ]; then
  echo "Backend directory missing: ${BACKEND_DIR}"
  exit 1
fi

mkdir -p "${DATA_DIR}" "${LOG_DIR}"

if [ -f "${DB_FILE}" ]; then
  echo "SQLite database exists and will be preserved: ${DB_FILE}"
else
  echo "SQLite database does not exist yet. The backend will create it on first startup: ${DB_FILE}"
fi

if [ ! -f "${ENV_FILE}" ]; then
  if [ -f "${ENV_EXAMPLE}" ]; then
    cp "${ENV_EXAMPLE}" "${ENV_FILE}"
    chmod 600 "${ENV_FILE}"
    echo "Created ${ENV_FILE} from example."
    echo "Edit real secrets in ${ENV_FILE}, then rerun this script."
    exit 1
  fi
  echo "Missing ${ENV_FILE}. Create it before deployment."
  exit 1
fi

echo "Validating backend .env encoding and COS prefix..."
python3 - "${ENV_FILE}" "${EXPECTED_COS_PREFIX}" <<'PY'
import sys
from pathlib import Path

env_path = Path(sys.argv[1])
expected_prefix = sys.argv[2]

try:
    text = env_path.read_text(encoding="utf-8")
except UnicodeDecodeError:
    print(f"{env_path} is not valid UTF-8. Save it as UTF-8 before deploying.")
    sys.exit(1)

values = {}
for raw_line in text.splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    values[key.strip()] = value.strip().strip('"').strip("'")

cos_prefix = values.get("COS_KEY_PREFIX") or values.get("COS_PREFIX") or ""
if cos_prefix != expected_prefix:
    print("Invalid COS prefix.")
    print(f"Expected: {expected_prefix}")
    print(f"Actual:   {cos_prefix or '<empty>'}")
    print("Keep COS_KEY_PREFIX exactly as UTF-8 text: ppt-素材/图片素材/")
    sys.exit(1)
PY

echo "Installing frontend dependencies..."
cd "${FRONTEND_DIR}"
npm install

echo "Building frontend..."
npm run build

echo "Preparing backend virtual environment..."
cd "${BACKEND_DIR}"
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi

source venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
deactivate

echo "Starting or reloading PM2 service..."
cd "${DEPLOY_DIR}/deploy"
if pm2 describe "${PM2_NAME}" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --only "${PM2_NAME}" --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save

echo "Deployment script completed."
echo "Frontend dist: ${FRONTEND_DIR}/dist"
echo "Backend API: http://127.0.0.1:8000"
echo "PM2 service: ${PM2_NAME}"
echo "Next steps:"
echo "1. Install/update Nginx site config from deploy/nginx-text2image.conf"
echo "2. Run: nginx -t"
echo "3. Reload Nginx after config is verified"
