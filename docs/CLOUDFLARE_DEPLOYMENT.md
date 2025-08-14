# 🚀 Cloudflare Pages 完整部署指南

本指南详细介绍如何将IP地址纯净度检查工具部署到Cloudflare Pages，包括Web界面、定时任务和自动更新功能。

## 📋 部署架构概览

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Cloudflare Pages  │    │ Cloudflare Workers  │    │   GitHub Actions    │
│                     │    │                     │    │                     │
│  • Web界面          │    │  • 定时任务         │    │  • 自动更新         │
│  • API Functions    │    │  • 后台处理         │    │  • 配置保护         │
│  • 静态资源         │    │  • KV存储管理       │    │  • CI/CD流程        │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
           │                           │                           │
           └───────────────────────────┼───────────────────────────┘
                                       │
                              ┌─────────────────────┐
                              │     KV 存储         │
                              │                     │
                              │  • IP检测缓存       │
                              │  • 定时任务结果     │
                              │  • 配置数据         │
                              └─────────────────────┘
```

## 🎯 为什么选择Cloudflare Pages？

### 技术优势
- **零冷启动**: 边缘计算，毫秒级响应
- **全球分布**: 200+边缘节点，就近访问
- **无服务器**: 按需计费，自动扩缩容
- **高可用性**: 99.9%+ SLA保证

### 成本优势
- **免费额度**: 100,000请求/天，足够个人使用
- **无隐藏费用**: 超出免费额度按量计费
- **KV存储**: 每月1GB免费存储

### 功能优势
- **定时任务**: 原生Cron支持
- **KV存储**: 持久化数据存储
- **Functions**: 边缘计算API
- **自动部署**: Git集成，推送即部署

## 🚀 快速部署

### 方法一：一键部署（推荐）

1. **点击部署按钮**
   [![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/twj0/ip-address-purity-checker)

2. **授权GitHub**
   - 登录您的GitHub账户
   - 授权Cloudflare访问仓库

3. **配置项目**
   - 项目名称: `ip-purity-checker`
   - 生产分支: `main`
   - 构建命令: 留空
   - 输出目录: `public`

4. **等待部署完成**
   - 自动创建KV命名空间
   - 部署Pages和Workers
   - 配置域名和SSL

### 方法二：手动部署

#### 前置要求
- Node.js 18+
- Git
- Cloudflare账户

#### 步骤详解

1. **Fork仓库**
   ```bash
   # 在GitHub上Fork仓库
   # https://github.com/twj0/ip-address-purity-checker
   ```

2. **克隆到本地**
   ```bash
   git clone https://github.com/YOUR_USERNAME/ip-address-purity-checker.git
   cd ip-address-purity-checker
   ```

3. **安装Wrangler CLI**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

4. **运行部署脚本**
   ```bash
   chmod +x scripts/deploy-cloudflare.sh
   ./scripts/deploy-cloudflare.sh
   ```

5. **配置API密钥**
   ```bash
   # ProxyCheck.io API密钥（推荐）
   wrangler secret put PROXYCHECK_API_KEY
   
   # IPinfo.io Token（备用）
   wrangler secret put IPINFO_TOKEN
   ```

## ⚙️ 详细配置

### KV命名空间配置

KV存储用于缓存IP检测结果和保存定时任务数据：

```toml
# wrangler.toml
[[kv_namespaces]]
binding = "IP_CACHE"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

**创建KV命名空间：**
```bash
# 生产环境
wrangler kv:namespace create "IP_CACHE"

# 预览环境
wrangler kv:namespace create "IP_CACHE" --preview
```

### 环境变量配置

支持的环境变量：

| 变量名 | 说明 | 必需 | 示例 |
|--------|------|------|------|
| `PROXYCHECK_API_KEY` | ProxyCheck.io API密钥 | 推荐 | `abc123...` |
| `IPINFO_TOKEN` | IPinfo.io访问令牌 | 可选 | `def456...` |
| `SUBSCRIPTION_URLS` | 自定义订阅链接 | 可选 | `["url1","url2"]` |
| `ENVIRONMENT` | 环境标识 | 自动 | `production` |

**设置环境变量：**
```bash
# 通过Wrangler CLI
wrangler secret put PROXYCHECK_API_KEY

# 通过Cloudflare Dashboard
# 进入Workers & Pages > 选择项目 > Settings > Environment variables
```

### 定时任务配置

定时任务配置在 `wrangler.toml` 中：

```toml
# 每日UTC 16:00执行（北京时间00:00）
[[triggers]]
crons = ["0 16 * * *"]
```

**常用Cron表达式：**
- `0 16 * * *` - 每日UTC 16:00
- `0 */6 * * *` - 每6小时执行一次
- `0 8,20 * * *` - 每日UTC 8:00和20:00

### 自定义域名配置

1. **在Cloudflare Dashboard中**
   - 进入 Pages > 项目设置
   - 点击 "Custom domains"
   - 添加您的域名

2. **DNS配置**
   ```
   CNAME  your-domain.com  ip-purity-checker.pages.dev
   ```

## 🔧 高级配置

### 性能优化

#### 缓存策略
```javascript
// functions/api/check-ip.js
const CACHE_TTL = {
  IP_RESULT: 3600,      // IP检测结果缓存1小时
  SUBSCRIPTION: 86400,   // 订阅解析缓存24小时
  ERROR: 300            // 错误结果缓存5分钟
};
```

#### 并发控制
```javascript
// 限制并发请求数避免速率限制
const MAX_CONCURRENT = 5;
const BATCH_DELAY = 1000; // 1秒延迟
```

### 监控和日志

#### 实时日志
```bash
# 查看Worker实时日志
wrangler tail

# 查看特定时间段日志
wrangler tail --since 1h
```

#### 性能监控
- Cloudflare Analytics
- Worker Analytics
- Pages Analytics

### 安全配置

#### API密钥保护
- 使用Wrangler Secrets存储敏感信息
- 不要在代码中硬编码密钥
- 定期轮换API密钥

#### CORS配置
```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-ProxyCheck-Key'
};
```

## 🔄 自动更新配置

### GitHub Actions设置

Fork仓库后自动获得自动更新功能：

1. **自动同步**: 每日检查上游更新
2. **配置保护**: 保留个人配置不被覆盖
3. **智能合并**: 自动解决大部分冲突
4. **手动触发**: 支持手动触发更新

### 配置保护机制

自动更新会保护以下配置：
- KV命名空间ID
- API密钥和Token
- 自定义订阅链接
- wrangler.toml个人配置
- 环境变量设置

### 手动触发更新

```bash
# 在GitHub仓库页面
# Actions > Auto Update Fork > Run workflow
```

## 🐛 故障排除

### 常见问题

#### 1. 部署失败：权限错误
```bash
# 重新登录Cloudflare
wrangler logout
wrangler login
```

#### 2. KV命名空间错误
```bash
# 检查KV命名空间
wrangler kv:namespace list

# 重新创建
wrangler kv:namespace create "IP_CACHE"
```

#### 3. API检测失败
- 检查API密钥配置
- 确认网络连接
- 查看Worker日志

#### 4. 定时任务不执行
```bash
# 检查cron配置
wrangler cron trigger --cron "0 16 * * *"

# 查看触发器状态
wrangler triggers list
```

### 调试技巧

#### 本地开发
```bash
# 启动本地开发服务器
wrangler dev

# 测试特定函数
wrangler dev --local
```

#### 日志分析
```bash
# 实时日志
wrangler tail --format pretty

# 过滤错误日志
wrangler tail --status error
```

#### KV存储调试
```bash
# 列出所有键
wrangler kv:key list --binding IP_CACHE

# 查看特定键值
wrangler kv:key get "ip:8.8.8.8" --binding IP_CACHE

# 删除键值
wrangler kv:key delete "ip:8.8.8.8" --binding IP_CACHE
```

## 📊 性能监控

### 关键指标

- **响应时间**: < 200ms (全球平均)
- **成功率**: > 99.5%
- **缓存命中率**: > 80%
- **API调用成功率**: > 95%

### 监控工具

1. **Cloudflare Analytics**
   - 请求量统计
   - 响应时间分析
   - 错误率监控

2. **Worker Analytics**
   - CPU使用时间
   - 内存使用情况
   - 执行次数统计

3. **自定义监控**
   ```javascript
   // 在Worker中添加自定义指标
   console.log(JSON.stringify({
     timestamp: Date.now(),
     ip: ip,
     response_time: responseTime,
     cache_hit: cacheHit
   }));
   ```

## 🎯 最佳实践

### 开发流程
1. 本地开发和测试
2. 提交到GitHub
3. 自动部署到预览环境
4. 测试通过后合并到主分支
5. 自动部署到生产环境

### 配置管理
- 使用环境变量管理配置
- 敏感信息使用Secrets
- 版本控制配置文件

### 监控和维护
- 定期检查日志
- 监控API使用量
- 及时更新依赖

---

🎉 **现在您已经掌握了Cloudflare Pages的完整部署流程！享受高性能的IP纯净度检测服务吧！**
