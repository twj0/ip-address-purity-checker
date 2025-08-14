# 🔍 IP地址纯净度检查工具

专业的IP纯净度检测服务，基于Cloudflare Pages部署，支持ProxyCheck.io专业检测算法。

[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/twj0/ip-address-purity-checker)

## ✨ 主要特性

- 🔍 **专业代理检测**: 集成ProxyCheck.io专业代理检测API，提供0-100风险评分
- 📊 **多数据源保障**: ProxyCheck.io + IPinfo.io + ip-api.com 三重检测机制
- 📡 **多格式订阅支持**: 支持vmess、vless、trojan、ss、ssr等协议
- 🎯 **智能纯净度筛选**: 专业算法识别数据中心、VPN、代理服务器IP
- ⚡ **Clash配置生成**: 自动生成按国家和纯净度分组的Clash配置
- 🌐 **Web界面**: 响应式设计，支持桌面和移动设备
- ⏰ **定时任务**: Cloudflare Workers每日自动检测
- ☁️ **全球加速**: 基于Cloudflare边缘网络，毫秒级响应
- 🔄 **自动更新**: Fork仓库自动同步上游更新

## 🚀 一键部署

### 方法一：一键部署按钮

点击下面的按钮直接部署到您的Cloudflare账户：

[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/twj0/ip-address-purity-checker)

### 方法二：Fork + 自动部署

1. **Fork本仓库**
   ```
   点击右上角的 "Fork" 按钮
   ```

2. **克隆您的Fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/ip-address-purity-checker.git
   cd ip-address-purity-checker
   ```

3. **运行一键部署脚本**
   ```bash
   chmod +x scripts/deploy-cloudflare.sh
   ./scripts/deploy-cloudflare.sh
   ```

4. **配置API密钥（推荐）**
   - ProxyCheck.io API Key: [免费注册](https://proxycheck.io/api/) (1000次/天)
   - IPinfo.io Token: [免费注册](https://ipinfo.io/signup) (50000次/月)

## 🎯 部署后功能

部署完成后，您将获得两个服务：

### 🌐 Web界面 (Cloudflare Pages)
- **访问地址**: `https://ip-purity-checker.pages.dev`
- **功能**:
  - 单IP检测：输入IP地址获得详细检测结果
  - 批量检测：同时检测多个IP地址
  - 订阅检测：解析代理订阅并检测所有节点
  - Clash配置生成：自动生成纯净节点配置

### ⏰ 定时任务 (Cloudflare Workers)
- **访问地址**: `https://ip-purity-checker.YOUR_ACCOUNT.workers.dev`
- **功能**:
  - 每日UTC 16:00（北京时间00:00）自动执行
  - 检查所有配置的订阅链接
  - 结果保存到KV存储，保留7天
  - 支持手动触发检测

## 🔧 配置说明

### API密钥配置

#### ProxyCheck.io API Key（推荐）
- **获取方式**: [https://proxycheck.io/api/](https://proxycheck.io/api/)
- **免费额度**: 1000次/天
- **优势**: 专业代理检测，0-100风险评分
- **配置方式**: 
  - Web界面输入
  - 环境变量: `PROXYCHECK_API_KEY`
  - 部署时自动配置

#### IPinfo.io Token（备用）
- **获取方式**: [https://ipinfo.io/signup](https://ipinfo.io/signup)
- **免费额度**: 50000次/月
- **优势**: 隐私标签，地理位置信息
- **配置方式**:
  - Web界面输入
  - 环境变量: `IPINFO_TOKEN`
  - 部署时自动配置

### 自定义订阅链接

可以通过环境变量 `SUBSCRIPTION_URLS` 配置自定义订阅链接：

```bash
# JSON格式的订阅链接数组
export SUBSCRIPTION_URLS='[
  "https://example.com/subscription1",
  "https://example.com/subscription2"
]'
```

## 🔄 自动更新功能

Fork仓库后，您的项目会自动获得以下更新功能：

### GitHub Actions自动同步
- **触发时机**: 每日UTC 02:00（北京时间10:00）
- **更新内容**: 自动同步上游仓库的最新代码
- **配置保护**: 自动保留您的个人配置
  - KV命名空间ID
  - API密钥和Token
  - 自定义订阅链接
  - 个人设置

### 手动触发更新
```bash
# 在您的仓库页面，进入 Actions 标签页
# 选择 "Auto Update Fork" 工作流
# 点击 "Run workflow" 手动触发
```

## 📊 使用指南

### Web界面使用

1. **访问Web界面**
   ```
   https://ip-purity-checker.pages.dev
   ```

2. **单IP检测**
   - 输入IP地址
   - 可选输入API密钥提升检测精度
   - 查看详细检测结果和风险评分

3. **批量检测**
   - 每行输入一个IP地址
   - 支持数百个IP同时检测
   - 下载CSV格式检测报告

4. **订阅检测**
   - 输入订阅链接（支持多个）
   - 自动解析所有节点IP
   - 可选生成纯净节点Clash配置

### API使用

#### 检测单个IP
```bash
curl "https://ip-purity-checker.pages.dev/api/check-ip?ip=8.8.8.8" \
  -H "X-ProxyCheck-Key: YOUR_API_KEY"
```

#### 检测订阅链接
```bash
curl -X POST "https://ip-purity-checker.pages.dev/api/check-subscription" \
  -H "X-ProxyCheck-Key: YOUR_API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "urls=https://example.com/subscription"
```

### 定时任务管理

#### 查看任务状态
```bash
curl "https://ip-purity-checker.YOUR_ACCOUNT.workers.dev/api/status"
```

#### 手动触发检测
```bash
curl -X POST "https://ip-purity-checker.YOUR_ACCOUNT.workers.dev/api/manual-check"
```

## 🛠️ 高级配置

### 自定义KV命名空间

如果您已有KV命名空间，可以在 `wrangler.toml` 中配置：

```toml
[[kv_namespaces]]
binding = "IP_CACHE"
id = "your-existing-kv-id"
preview_id = "your-preview-kv-id"
```

### 修改定时任务时间

在 `wrangler.toml` 中修改cron表达式：

```toml
[[triggers]]
crons = ["0 8 * * *"]  # 改为UTC 08:00执行
```

### 环境变量配置

支持的环境变量：

- `PROXYCHECK_API_KEY`: ProxyCheck.io API密钥
- `IPINFO_TOKEN`: IPinfo.io访问令牌
- `SUBSCRIPTION_URLS`: 自定义订阅链接（JSON数组）
- `ENVIRONMENT`: 环境标识（production/development）

## 🐛 故障排除

### 常见问题

#### 1. 部署失败：KV命名空间错误
```bash
# 手动创建KV命名空间
wrangler kv:namespace create "IP_CACHE"
wrangler kv:namespace create "IP_CACHE" --preview

# 更新wrangler.toml中的ID
```

#### 2. API检测失败
- 检查API密钥是否正确配置
- 确认网络连接正常
- 查看浏览器控制台错误信息

#### 3. 定时任务不执行
- 检查Worker部署状态
- 确认cron触发器配置正确
- 查看Worker日志

### 调试方法

#### 查看Worker日志
```bash
wrangler tail
```

#### 测试本地开发
```bash
wrangler dev
```

#### 检查KV存储
```bash
wrangler kv:key list --binding IP_CACHE
```

## 📈 性能优化

### 速率限制管理
- ProxyCheck.io: 免费2次/秒，付费10次/秒
- IPinfo.io: 免费1000次/分钟，付费更高
- 自动智能速率控制，避免触发限制

### 缓存策略
- IP检测结果缓存1小时
- 订阅解析结果缓存24小时
- KV存储自动过期清理

## 🤝 贡献指南

欢迎提交Issue和Pull Request！

1. Fork本仓库
2. 创建功能分支
3. 提交更改
4. 发起Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🔗 相关链接

- [ProxyCheck.io API文档](https://proxycheck.io/api/)
- [IPinfo.io API文档](https://ipinfo.io/developers)
- [Cloudflare Pages文档](https://developers.cloudflare.com/pages/)
- [Cloudflare Workers文档](https://developers.cloudflare.com/workers/)

---

🎉 **立即部署，享受专业级IP纯净度检测服务！**
