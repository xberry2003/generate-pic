# 集成真实生图 API 指南

本文档说明如何将项目中的 MOCK 生图 API 替换为真实的生图 API。

## 📝 核心修改文件

主要修改文件：`backend/app/services/image_generation_service.py`

## 🔄 替换流程概览

1. 获取外部 API 的密钥和端点
2. 修改 `call_image_generation_api()` 函数
3. 处理 API 响应数据
4. 测试集成
5. 生产环境配置

## 📌 示例 1：使用 OpenAI API（DALL-E）

### 第一步：安装依赖

```bash
pip install openai aiohttp
```

### 第二步：配置 API 密钥

编辑 `backend/.env`：

```env
OPENAI_API_KEY=your_api_key_here
```

### 第三步：修改生图函数

编辑 `backend/app/services/image_generation_service.py`：

```python
import os
import asyncio
import aiohttp
import base64
from openai import AsyncOpenAI

async def call_image_generation_api(prompt: str, keywords: str = "", count: int = 1):
    """
    使用 OpenAI DALL-E API 生成图片
    """
    
    # 获取 API 密钥
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("未设置 OPENAI_API_KEY 环境变量")
    
    # 创建客户端
    client = AsyncOpenAI(api_key=api_key)
    
    # 构建完整的提示词
    full_prompt = f"{prompt}"
    if keywords:
        full_prompt += f" (keywords: {keywords})"
    
    try:
        print(f"📡 调用 OpenAI DALL-E API...")
        print(f"   Prompt: {prompt}")
        print(f"   Keywords: {keywords}")
        
        # 调用 DALL-E API
        response = await client.images.generate(
            model="dall-e-3",  # 或使用 "dall-e-2"
            prompt=full_prompt,
            n=count,
            size="1024x1024",
            quality="standard"
        )
        
        # 下载图片
        images = []
        for image_data in response.data:
            # 获取图片 URL
            image_url = image_data.url
            
            # 下载图片
            async with aiohttp.ClientSession() as session:
                async with session.get(image_url) as resp:
                    image_bytes = await resp.read()
                    images.append(image_bytes)
        
        print(f"✅ 成功生成了 {len(images)} 张图片")
        return images
        
    except Exception as e:
        print(f"❌ API 调用失败: {e}")
        raise

```

## 📌 示例 2：使用 Stability AI API

### 第一步：安装依赖

```bash
pip install stability-sdk aiohttp
```

### 第二步：配置 API 密钥

编辑 `backend/.env`：

```env
STABILITY_API_KEY=your_api_key_here
STABILITY_API_HOST=api.stability.ai
```

### 第三步：修改生图函数

```python
import os
import asyncio
import aiohttp
import base64

async def call_image_generation_api(prompt: str, keywords: str = "", count: int = 1):
    """
    使用 Stability AI API 生成图片
    """
    
    # 获取配置
    api_key = os.getenv("STABILITY_API_KEY")
    api_host = os.getenv("STABILITY_API_HOST", "api.stability.ai")
    
    if not api_key:
        raise ValueError("未设置 STABILITY_API_KEY 环境变量")
    
    try:
        print(f"📡 调用 Stability AI API...")
        
        # 使用 aiohttp 发送异步请求
        async with aiohttp.ClientSession() as session:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json"
            }
            
            data = {
                "text_prompts": [
                    {
                        "text": prompt,
                        "weight": 1
                    }
                ],
                "cfg_scale": 7,
                "height": 512,
                "width": 512,
                "samples": count,
                "steps": 30,
            }
            
            # 发送请求
            async with session.post(
                f"https://{api_host}/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
                headers=headers,
                json=data
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    raise Exception(f"API 返回错误: {error_text}")
                
                response = await resp.json()
                
                # 处理响应中的图片
                images = []
                for result in response.get("artifacts", []):
                    # 图片数据是 base64 编码的
                    image_data = base64.b64decode(result["base64"])
                    images.append(image_data)
                
                print(f"✅ 成功生成了 {len(images)} 张图片")
                return images
                
    except Exception as e:
        print(f"❌ API 调用失败: {e}")
        raise
```

## 📌 示例 3：使用自定义本地 API 或其他服务

```python
import asyncio
import aiohttp

async def call_image_generation_api(prompt: str, keywords: str = "", count: int = 1):
    """
    调用自定义的生图 API
    """
    
    # 定义 API 端点
    api_endpoint = os.getenv(
        "CUSTOM_IMAGE_API_ENDPOINT",
        "http://localhost:5000/generate"
    )
    api_key = os.getenv("CUSTOM_IMAGE_API_KEY")
    
    try:
        print(f"📡 调用自定义 API: {api_endpoint}")
        
        async with aiohttp.ClientSession() as session:
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            
            payload = {
                "prompt": prompt,
                "keywords": keywords,
                "count": count
            }
            
            async with session.post(
                api_endpoint,
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=300)  # 5 分钟超时
            ) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    raise Exception(f"API 返回错误: {error_text}")
                
                result = await resp.json()
                
                # 假设 API 返回 base64 编码的图片列表
                images = []
                for img_data in result.get("images", []):
                    if isinstance(img_data, str):
                        # base64 编码的图片
                        image_bytes = base64.b64decode(img_data)
                    else:
                        # 图片 URL
                        image_bytes = await download_image(img_data)
                    
                    images.append(image_bytes)
                
                print(f"✅ 成功生成了 {len(images)} 张图片")
                return images
                
    except Exception as e:
        print(f"❌ API 调用失败: {e}")
        raise

async def download_image(url: str) -> bytes:
    """下载图片"""
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            return await resp.read()
```

## 🧪 测试步骤

### 1. 单元测试

创建 `backend/test_api_integration.py`：

```python
import asyncio
from app.services.image_generation_service import call_image_generation_api

async def test_image_generation():
    """测试生图 API"""
    try:
        # 调用生图函数
        images = await call_image_generation_api(
            prompt="一只可爱的小猫",
            keywords="可爱,温暖",
            count=1
        )
        
        # 检查结果
        assert len(images) == 1, f"期望 1 张图片，实际 {len(images)} 张"
        assert len(images[0]) > 0, "图片数据为空"
        assert isinstance(images[0], bytes), "图片数据不是字节串"
        
        print(f"✅ 测试通过！生成了 {len(images[0])} 字节的图片")
        
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        raise

# 运行测试
if __name__ == "__main__":
    asyncio.run(test_image_generation())
```

运行测试：
```bash
cd backend
python test_api_integration.py
```

### 2. 集成测试

通过 API 端点测试：

```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "一只可爱的小猫",
    "keywords": "可爱,温暖",
    "count": 1
  }'
```

## 🛡️ 错误处理最佳实践

```python
import asyncio
from typing import List

async def call_image_generation_api(prompt: str, keywords: str = "", count: int = 1) -> List[bytes]:
    """
    调用生图 API，包含完整的错误处理
    """
    
    max_retries = 3
    retry_delay = 5  # 秒
    
    for attempt in range(max_retries):
        try:
            # API 调用逻辑
            images = await _call_api(prompt, keywords, count)
            
            if not images:
                raise ValueError("API 未返回任何图片")
            
            return images
            
        except asyncio.TimeoutError:
            print(f"⏱️ 第 {attempt + 1} 次尝试超时")
            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay)
                continue
            raise
            
        except ConnectionError as e:
            print(f"🌐 连接失败: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay)
                continue
            raise
            
        except Exception as e:
            print(f"❌ API 调用出错: {e}")
            raise
    
    raise RuntimeError("超过最大重试次数")
```

## 📊 性能优化

### 1. 缓存已生成的图片

```python
from functools import lru_cache
from hashlib import md5

@lru_cache(maxsize=100)
async def get_cached_image(prompt_hash: str):
    """缓存已生成的图片"""
    # 实现缓存逻辑
    pass

async def call_image_generation_api(prompt: str, keywords: str = "", count: int = 1):
    # 计算 prompt 的哈希值
    prompt_hash = md5(f"{prompt}_{keywords}".encode()).hexdigest()
    
    # 检查缓存
    cached = await get_cached_image(prompt_hash)
    if cached:
        return cached
    
    # 调用 API...
```

### 2. 并发请求优化

```python
import asyncio

async def call_image_generation_api(prompt: str, keywords: str = "", count: int = 1):
    """
    使用并发请求生成多张图片
    """
    
    # 如果需要生成多张图片，可以并发请求
    if count > 1:
        tasks = [
            _generate_single_image(prompt, keywords)
            for _ in range(count)
        ]
        images = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 过滤错误
        images = [img for img in images if isinstance(img, bytes)]
        return images
    else:
        return await _generate_single_image(prompt, keywords)

async def _generate_single_image(prompt: str, keywords: str) -> bytes:
    """生成单张图片"""
    # 实现具体逻辑
    pass
```

## ✅ 集成检查清单

- [ ] 获得 API 密钥和端点
- [ ] 安装必要的依赖包
- [ ] 配置环境变量 (.env 文件)
- [ ] 修改 `call_image_generation_api()` 函数
- [ ] 实现错误处理和重试逻辑
- [ ] 编写单元测试
- [ ] 测试 API 端点
- [ ] 验证图片质量和格式
- [ ] 测试并发请求
- [ ] 监控性能和成本

## 🚀 生产环境建议

1. **设置 API 速率限制**
   ```python
   from aiolimiter import AsyncLimiter
   
   limiter = AsyncLimiter(max_rate=10, time_period=60)  # 每分钟 10 个请求
   async with limiter.acquire():
       # API 调用
   ```

2. **实现请求超时**
   ```python
   timeout = aiohttp.ClientTimeout(total=300)  # 5 分钟
   async with aiohttp.ClientSession(timeout=timeout) as session:
       # API 调用
   ```

3. **记录详细日志**
   ```python
   import logging
   
   logger = logging.getLogger(__name__)
   logger.info(f"生成图片: {prompt}")
   logger.error(f"生成失败: {error}")
   ```

4. **监控成本**
   ```python
   # 记录每个请求的成本
   cost = count * 0.02  # 假设每张 $0.02
   logger.info(f"本次请求成本: ${cost}")
   ```

---

**需要帮助？** 查看各 API 的官方文档获取更多信息。
