# 🚀 快速部署指南

## 一键部署到 Vercel（推荐）

### 方法1：使用部署脚本（最简单）

```bash
# 1. 确保在项目根目录
cd ip-address-purity-checker

# 2. 运行部署脚本
./scripts/deploy.sh vercel

# 3. 按提示操作
# - 首次使用会要求登录 Vercel
# - 输入 IPinfo.io token（可选但推荐）
# - 选择部署环境（开发/生产）
```

### 方法2：手动部署

```bash
# 1. 安装 Vercel CLI
npm install -g vercel

# 2. 登录 Vercel
vercel login

# 3. 部署项目
vercel

# 4. 设置环境变量（可选）
vercel env add IPINFO_TOKEN
# 输入你的 IPinfo.io token

# 5. 部署到生产环境
vercel --prod
```

### 方法3：GitHub 集成（推荐生产环境）

1. **Fork 项目到你的 GitHub**
2. **连接 Vercel**：
   - 访问 [vercel.com](https://vercel.com)
   - 点击 "Import Project"
   - 选择你的 GitHub 仓库
3. **配置环境变量**：
   - 在 Vercel Dashboard 中添加 `IPINFO_TOKEN`
4. **自动部署**：
   - 每次推送到 main 分支自动部署

## 部署到 Cloudflare Workers

### 前置准备

```bash
# 1. 安装 Wrangler CLI
npm install -g wrangler

# 2. 登录 Cloudflare
wrangler login

# 3. 创建 KV 命名空间
wrangler kv:namespace create "IP_CACHE"
# 记录返回的 namespace ID

wrangler kv:namespace create "IP_CACHE" --preview
# 记录返回的 preview ID
```

### 配置和部署

```bash
# 1. 更新 wrangler.toml
# 将 your-kv-namespace-id 替换为实际的 namespace ID
# 将 your-preview-kv-namespace-id 替换为实际的 preview ID

# 2. 设置环境变量
wrangler secret put IPINFO_TOKEN
# 输入你的 IPinfo.io token

# 3. 部署 Worker
wrangler deploy

# 4. 测试部署
curl https://your-worker.your-subdomain.workers.dev/api/check-ip?ip=8.8.8.8
```

## 🔧 故障排除

### Vercel 常见问题

**问题1：模块导入错误**
```
Error: No module named 'src'
```
**解决方案：**
- 确保 `api/requirements.txt` 存在
- 检查 API 文件中的导入路径

**问题2：函数超时**
```
Error: Function execution timed out
```
**解决方案：**
- 检查 `vercel.json` 中的 `maxDuration` 设置
- 优化代码减少执行时间

**问题3：环境变量未生效**
```
Error: IPINFO_TOKEN is not defined
```
**解决方案：**
```bash
# 重新设置环境变量
vercel env add IPINFO_TOKEN production
vercel env add IPINFO_TOKEN development
```

### Cloudflare Workers 常见问题

**问题1：KV 绑定错误**
```
Error: IP_CACHE is not defined
```
**解决方案：**
- 检查 `wrangler.toml` 中的 KV 配置
- 确保 namespace ID 正确

**问题2：CPU 时间限制**
```
Error: Script exceeded CPU time limit
```
**解决方案：**
- 减少批处理大小
- 优化算法复杂度

## ✅ 部署验证

### 自动验证

```bash
# 使用验证脚本
python scripts/test_deployment.py https://your-deployment-url.com

# 预期输出：所有测试通过
```

### 手动验证

```bash
# 1. 测试首页
curl https://your-deployment-url.com

# 2. 测试 API
curl "https://your-deployment-url.com/api/check-ip?ip=8.8.8.8"

# 3. 预期响应
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

## 📊 性能优化

### IPinfo.io Token 配置

```bash
# 获取免费 token（推荐）
# 1. 访问 https://ipinfo.io/signup
# 2. 注册账户（免费 50,000 次/月）
# 3. 获取 API token
# 4. 设置环境变量

# Vercel
vercel env add IPINFO_TOKEN

# Cloudflare Workers
wrangler secret put IPINFO_TOKEN
```

### 缓存策略

- **Vercel**: 自动边缘缓存
- **Cloudflare Workers**: KV 存储缓存（24小时）

## 🔄 持续部署

### GitHub Actions（推荐）

创建 `.github/workflows/deploy.yml`：

```yaml
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

## 📈 监控和维护

### Vercel 监控

- 访问 Vercel Dashboard
- 查看 Functions 标签页
- 监控调用次数和错误率

### Cloudflare Workers 监控

```bash
# 实时日志
wrangler tail

# 查看分析数据
wrangler analytics
```

## 🎯 最佳实践

1. **使用 IPinfo.io token** - 提升速率限制和准确性
2. **启用 CORS** - 支持前端集成
3. **设置监控** - 及时发现问题
4. **定期更新** - 保持依赖最新
5. **备份配置** - 保存重要配置信息

## 📞 获取帮助

如果遇到部署问题：

1. **查看日志**：
   - Vercel: Dashboard > Functions > Logs
   - Cloudflare: `wrangler tail`

2. **运行诊断**：
   ```bash
   python scripts/test_deployment.py https://your-url.com
   ```

3. **检查配置**：
   - 验证 `vercel.json` 或 `wrangler.toml`
   - 确认环境变量设置

4. **社区支持**：
   - GitHub Issues
   - Vercel Discord
   - Cloudflare Community

---

🎉 **恭喜！** 按照以上步骤，你应该能够成功部署 IP 地址纯净度检查工具。
