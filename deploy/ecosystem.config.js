module.exports = {
  apps: [
    {
      name: 'text2image-api',
      cwd: '/www/wwwroot/text2image-workspace/backend',
      script: 'venv/bin/python',
      args: '-m uvicorn app.main:app --host 127.0.0.1 --port 8000',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: '8000',
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      out_file: '/www/wwwroot/text2image-workspace/logs/text2image-api.out.log',
      error_file: '/www/wwwroot/text2image-workspace/logs/text2image-api.err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}

