# IP地址纯净度检查工具 - 详细部署指南

## 🎯 部署平台对比

| 特性 | Vercel | Cloudflare Workers |
|------|--------|-------------------|
| **免费额度** | 100GB带宽/月 | 100,000请求/天 |
| **冷启动时间** | ~100ms | ~0ms (边缘计算) |
| **全球分布** | 多区域 | 200+边缘节点 |
| **Python支持** | ✅ 原生支持 | ❌ 需要JS重写 |
| **定时任务** | ✅ Cron Jobs | ✅ Cron Triggers |
| **存储** | 临时文件系统 | KV存储 |
| **推荐场景** | Python项目 | 高性能API |

**推荐：** 对于此项目，建议优先使用 **Vercel**，因为项目主要使用Python编写。

## 🚀 Vercel部署（推荐）

### 前置准备

1. **安装Vercel CLI**
```bash
npm install -g vercel
```

2. **登录Vercel**
```bash
vercel login
```

3. **获取IPinfo.io Token**
- 访问 https://ipinfo.io/signup
- 注册免费账户（50,000次/月）
- 获取API token

### 步骤1：修复配置文件

当前的 `vercel.json` 存在一些问题，需要修复：

```json
{
  "version": 2,
  "name": "ip-purity-checker",
  "builds": [
    {
      "src": "api/**/*.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "src": "/",
      "dest": "/api/index.py"
    }
  ],
  "env": {
    "IPINFO_TOKEN": "@ipinfo-token"
  },
  "functions": {
    "api/**/*.py": {
      "runtime": "python3.11",
      "maxDuration": 30
    }
  }
}
```

### 步骤2：创建requirements.txt（API专用）

```bash
# 创建API依赖文件
cat > api/requirements.txt << EOF
requests>=2.28.0
PyYAML>=6.0
EOF
```

### 步骤3：修复API文件

当前的API文件存在导入问题，需要修复：

### 步骤4：部署命令

```bash
# 在项目根目录执行
vercel

# 首次部署会询问配置
# Project name: ip-purity-checker
# Which scope: 选择你的账户
# Link to existing project: N
# In which directory is your code located: ./

# 设置环境变量
vercel env add IPINFO_TOKEN
# 输入你的IPinfo.io token

# 部署到生产环境
vercel --prod
```

### 步骤5：验证部署

```bash
# 测试API端点
curl "https://your-project.vercel.app/api/check-ip?ip=8.8.8.8"

# 预期响应
{
  "ip": "8.8.8.8",
  "country": "US",
  "city": "Mountain View",
  "org": "AS15169 Google LLC",
  "isPure": false,
  "privacy": {
    "hosting": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## ☁️ Cloudflare Workers部署

### 前置准备

1. **安装Wrangler CLI**
```bash
npm install -g wrangler
```

2. **登录Cloudflare**
```bash
wrangler login
```

3. **创建KV命名空间**
```bash
# 生产环境
wrangler kv:namespace create "IP_CACHE"
# 记录返回的namespace ID

# 预览环境
wrangler kv:namespace create "IP_CACHE" --preview
# 记录返回的preview ID
```

### 步骤1：修复wrangler.toml

```toml
name = "ip-purity-checker"
main = "cloudflare/worker.js"
compatibility_date = "2024-01-01"

# 环境变量
[vars]
ENVIRONMENT = "production"

# KV存储绑定
[[kv_namespaces]]
binding = "IP_CACHE"
id = "your-actual-kv-namespace-id"  # 替换为实际ID
preview_id = "your-preview-kv-namespace-id"  # 替换为实际预览ID

# 定时任务配置
[[triggers]]
crons = ["0 16 * * *"]  # 每日UTC 16:00执行

# 资源限制
[limits]
cpu_ms = 50000
```

### 步骤2：设置环境变量

```bash
# 设置IPinfo.io token
wrangler secret put IPINFO_TOKEN
# 输入你的token

# 查看已设置的secrets
wrangler secret list
```

### 步骤3：部署Worker

```bash
# 部署到生产环境
wrangler deploy

# 查看部署状态
wrangler tail

# 测试定时任务
wrangler cron trigger --cron="0 16 * * *"
```

### 步骤4：绑定自定义域名（可选）

```bash
# 添加自定义域名
wrangler route add "api.yourdomain.com/*" ip-purity-checker

# 或在Cloudflare Dashboard中配置
```

## 🔧 故障排除

### 常见Vercel部署错误

**1. 模块导入错误**
```
Error: No module named 'src'
```
**解决方案：**
- 确保API文件中的导入路径正确
- 使用相对导入或添加sys.path

**2. 依赖安装失败**
```
Error: Could not find a version that satisfies the requirement
```
**解决方案：**
```bash
# 在api目录创建requirements.txt
cd api
pip freeze > requirements.txt
```

**3. 超时错误**
```
Error: Function execution timed out
```
**解决方案：**
- 在vercel.json中增加maxDuration
- 优化代码减少执行时间

### 常见Cloudflare Workers错误

**1. KV绑定错误**
```
Error: IP_CACHE is not defined
```
**解决方案：**
- 检查wrangler.toml中的KV配置
- 确保namespace ID正确

**2. 环境变量未设置**
```
Error: IPINFO_TOKEN is not defined
```
**解决方案：**
```bash
wrangler secret put IPINFO_TOKEN
```

**3. CPU时间限制**
```
Error: Script exceeded CPU time limit
```
**解决方案：**
- 减少批处理大小
- 优化算法复杂度
- 使用异步处理

## 📋 部署前检查清单

### Vercel部署检查

- [ ] 安装Vercel CLI
- [ ] 获取IPinfo.io token
- [ ] 修复vercel.json配置
- [ ] 创建api/requirements.txt
- [ ] 修复API文件导入问题
- [ ] 测试本地API功能

### Cloudflare Workers检查

- [ ] 安装Wrangler CLI
- [ ] 创建KV命名空间
- [ ] 更新wrangler.toml配置
- [ ] 设置环境变量secrets
- [ ] 测试Worker脚本语法

## 🎯 部署后验证

### 功能测试脚本

```bash
#!/bin/bash
# test_deployment.sh

BASE_URL="https://your-project.vercel.app"  # 或你的Worker URL

echo "Testing deployment..."

# 测试IP检查API
echo "1. Testing IP check API..."
response=$(curl -s "$BASE_URL/api/check-ip?ip=8.8.8.8")
echo "Response: $response"

# 测试状态API
echo "2. Testing status API..."
curl -s "$BASE_URL/api/status" | jq .

# 测试CORS
echo "3. Testing CORS..."
curl -s -H "Origin: https://example.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS "$BASE_URL/api/check-ip"

echo "Deployment test completed!"
```

### 性能监控

```bash
# 监控API响应时间
for i in {1..10}; do
  time curl -s "$BASE_URL/api/check-ip?ip=1.1.1.$i" > /dev/null
done
```

## 🔄 持续集成/部署

### GitHub Actions自动部署

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

## 📊 监控和日志

### Vercel监控

- 访问 Vercel Dashboard
- 查看Functions标签页
- 监控调用次数和错误率

### Cloudflare Workers监控

```bash
# 实时日志
wrangler tail

# 查看分析数据
wrangler analytics
```

## 💡 最佳实践

1. **环境变量管理**
   - 使用平台提供的secrets管理
   - 不要在代码中硬编码敏感信息

2. **错误处理**
   - 实现完善的错误处理和重试机制
   - 记录详细的错误日志

3. **性能优化**
   - 使用缓存减少API调用
   - 实现请求去重
   - 合理设置超时时间

4. **安全考虑**
   - 实现速率限制
   - 验证输入参数
   - 设置适当的CORS策略

这个部署指南提供了完整的步骤和故障排除方案，应该能帮助您成功部署项目到任一平台。
