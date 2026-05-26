# 部署指南

本文档说明如何将项目部署到生产环境。

## 📋 前置检查清单

- [ ] Python 3.8+ 已安装
- [ ] Node.js 16+ 已安装
- [ ] 数据库配置已准备（PostgreSQL 推荐用于生产）
- [ ] 外部生图 API 密钥已获取
- [ ] 服务器或云服务已准备
- [ ] 域名已注册
- [ ] SSL/TLS 证书已准备（HTTPS）

## 🔧 前端部署

### 1. 构建生产版本

```bash
cd frontend

# 安装依赖
npm install

# 构建优化版本
npm run build

# 输出目录：frontend/dist/
```

### 2. 配置 API 地址

编辑 `frontend/vite.config.js`，修改生产环境的 API 地址：

```javascript
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://your-domain.com',  // 改为生产 API 地址
        changeOrigin: true,
      }
    }
  }
})
```

或在 `frontend/src/services/api.js` 中：

```javascript
const apiClient = axios.create({
  baseURL: process.env.VITE_API_URL || 'http://localhost:8000/api',
  // ...
})
```

创建 `frontend/.env.production`：

```env
VITE_API_URL=https://your-domain.com/api
```

### 3. 部署到 Web 服务器

#### 选项 A：使用 Nginx

```bash
# 将 dist 目录复制到服务器
scp -r frontend/dist user@your-server:/var/www/generate-pic

# 配置 Nginx
sudo nano /etc/nginx/sites-available/generate-pic
```

Nginx 配置文件：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书配置
    ssl_certificate /etc/ssl/certs/your-domain.com.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.com.key;

    # 前端文件
    root /var/www/generate-pic;
    index index.html;

    # 代理 API 请求到后端
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 静态文件
    location /uploads {
        proxy_pass http://localhost:8000;
    }

    # SPA 路由配置
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 缓存配置
    location ~* \.(js|css|png|jpg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/generate-pic /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 选项 B：使用 Docker

创建 `frontend/Dockerfile`：

```dockerfile
# 构建阶段
FROM node:18 as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 运行阶段
FROM nginx:latest
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

构建镜像：

```bash
docker build -t generate-pic-frontend:latest .
docker run -d -p 80:80 generate-pic-frontend:latest
```

## ⚙️ 后端部署

### 1. 准备生产环境

```bash
cd backend

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Linux/macOS
# 或
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 安装生产服务器
pip install gunicorn
```

### 2. 配置数据库

编辑 `backend/app/database.py`：

```python
# 改用 PostgreSQL
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://user:password@db-server:5432/generate_pic"
)
```

创建 `.env` 文件：

```env
# 数据库配置
DATABASE_URL=postgresql://user:password@db-server:5432/generate_pic

# 应用配置
DEBUG=False
ENV=production

# 生图 API 配置
IMAGE_API_KEY=your_api_key
IMAGE_API_ENDPOINT=https://your-api-endpoint.com

# CORS 配置（允许的域名）
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

### 3. 修改 CORS 配置

编辑 `backend/app/main.py`：

```python
import os
from fastapi.middleware.cors import CORSMiddleware

# 从环境变量读取允许的源
allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # 改用环境变量
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 4. 启动生产服务

#### 使用 Gunicorn（推荐）

```bash
gunicorn app.main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --access-logfile - \
    --error-logfile -
```

#### 创建 Systemd 服务

创建 `/etc/systemd/system/generate-pic-backend.service`：

```ini
[Unit]
Description=Generate-Pic API Service
After=network.target

[Service]
Type=notify
User=www-data
WorkingDirectory=/opt/generate-pic/backend
Environment="PATH=/opt/generate-pic/backend/venv/bin"
ExecStart=/opt/generate-pic/backend/venv/bin/gunicorn app.main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable generate-pic-backend
sudo systemctl start generate-pic-backend
sudo systemctl status generate-pic-backend
```

#### 使用 Docker

创建 `backend/Dockerfile`：

```dockerfile
FROM python:3.9-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY . .

# 创建上传目录
RUN mkdir -p uploads/images

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV DEBUG=False

# 启动应用
CMD ["gunicorn", "app.main:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]

EXPOSE 8000
```

构建和运行：

```bash
docker build -t generate-pic-backend:latest .
docker run -d \
  -p 8000:8000 \
  -e DATABASE_URL=postgresql://... \
  -e IMAGE_API_KEY=... \
  -v /mnt/uploads:/app/uploads \
  generate-pic-backend:latest
```

### 5. 使用 Docker Compose

创建项目根目录的 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  # PostgreSQL 数据库
  db:
    image: postgres:15
    container_name: generate-pic-db
    environment:
      POSTGRES_DB: generate_pic
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # FastAPI 后端
  backend:
    build: ./backend
    container_name: generate-pic-backend
    environment:
      DATABASE_URL: postgresql://postgres:your_secure_password@db:5432/generate_pic
      IMAGE_API_KEY: ${IMAGE_API_KEY}
      IMAGE_API_ENDPOINT: ${IMAGE_API_ENDPOINT}
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./backend/uploads:/app/uploads
    restart: always

  # React 前端 (Nginx)
  frontend:
    build: ./frontend
    container_name: generate-pic-frontend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - backend
    restart: always

volumes:
  postgres_data:

networks:
  default:
    name: generate-pic-network
```

启动：

```bash
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

## 🔒 安全配置

### 1. 使用 HTTPS

使用 Let's Encrypt 获取免费 SSL 证书：

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com
```

### 2. 设置环境变量

```bash
# 后端环境变量
export DATABASE_URL="postgresql://user:password@localhost/generate_pic"
export DEBUG=False
export IMAGE_API_KEY="your-key"

# 前端环境变量
export VITE_API_URL="https://your-domain.com/api"
```

### 3. 配置防火墙

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 4. 隐藏 API 版本信息

在 `backend/app/main.py` 中：

```python
app = FastAPI(
    title="文生图图片库 API",
    docs_url="/docs" if os.getenv("DEBUG") == "True" else None,
    openapi_url="/openapi.json" if os.getenv("DEBUG") == "True" else None,
)
```

## 📊 监控和日志

### 1. 日志配置

在 `backend/app/main.py` 中：

```python
import logging
from logging.handlers import RotatingFileHandler

# 创建日志处理器
log_handler = RotatingFileHandler(
    'logs/app.log',
    maxBytes=10485760,  # 10MB
    backupCount=5
)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[log_handler]
)
```

### 2. 性能监控

使用 Prometheus 和 Grafana：

```python
from prometheus_client import Counter, Histogram, make_asgi_app

# 指标
request_count = Counter('api_requests_total', 'Total API requests')
request_duration = Histogram('api_request_duration_seconds', 'API request duration')
```

### 3. 错误追踪

集成 Sentry：

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn="your-sentry-dsn",
    integrations=[FastApiIntegration()]
)
```

## 🚀 持续集成/部署 (CI/CD)

### GitHub Actions 示例

创建 `.github/workflows/deploy.yml`：

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Build and push Docker image
        run: |
          docker build -t registry.example.com/generate-pic-backend:latest ./backend
          docker push registry.example.com/generate-pic-backend:latest

      - name: Deploy to server
        run: |
          ssh user@your-server 'cd /opt/generate-pic && docker-compose pull && docker-compose up -d'
```

## ✅ 部署检查清单

- [ ] 数据库已创建和备份
- [ ] 环境变量已配置
- [ ] SSL 证书已安装
- [ ] Nginx/Apache 已配置
- [ ] 后端服务已启动
- [ ] 前端已构建和部署
- [ ] API 接口测试通过
- [ ] 日志记录已启用
- [ ] 监控系统已配置
- [ ] 备份计划已制定
- [ ] 性能测试已进行
- [ ] 安全审计已完成

## 🆘 故障排查

### 问题：无法连接数据库

```bash
# 检查数据库连接
psql -h db-server -U user -d generate_pic -c "SELECT 1"

# 检查环境变量
echo $DATABASE_URL
```

### 问题：静态文件 404

```bash
# 检查上传目录权限
ls -la backend/uploads/
chmod -R 755 backend/uploads/
```

### 问题：CORS 错误

检查 CORS 配置中的 `ALLOWED_ORIGINS`

### 问题：生成图片缓慢

1. 增加 Gunicorn workers
2. 使用更强大的服务器
3. 配置生成超时

---

**部署完成后，访问你的域名即可使用！** 🎉
