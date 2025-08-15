# 🔍 IP地址纯净度检查工具

专业的IP纯净度检测服务，基于Cloudflare Worker部署，支持ProxyCheck.io专业检测算法，提供完整的订阅链接管理和自动化检测功能。

## 🚀 一键部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/twj0/ip-address-purity-checker)

点击上面的按钮，几分钟内即可完成部署！

## ✨ 功能特性

- 🔍 **单IP检测**: 检测单个IP地址的纯净度和风险评分
- 📋 **批量检测**: 同时检测多个IP地址，支持CSV导出
- 📡 **订阅管理**: 管理和检测订阅链接中的IP地址
- ⏰ **定时任务**: 每日自动检测和更新IP列表
- 📊 **数据统计**: 详细的检测统计信息和历史记录
- 🔧 **API集成**: 支持ProxyCheck.io和IPinfo.io API
- 📱 **响应式设计**: 完美支持移动端和桌面端
- 🎨 **现代UI**: 简洁美观的纯白背景设计

## 🛠️ 手动部署

如果您希望手动部署或自定义配置：

### 步骤1: 准备环境
```bash
# 安装Node.js（如果未安装）
# 下载地址：https://nodejs.org/

# 安装Wrangler CLI
npm install -g wrangler

# 验证安装
wrangler --version
```

### 步骤2: 登录Cloudflare
```bash
# 登录到Cloudflare账户
wrangler login

# 验证登录状态
wrangler whoami
```

### 步骤3: 克隆和部署
```bash
# 克隆项目
git clone https://github.com/twj0/ip-address-purity-checker.git
cd ip-address-purity-checker

# 部署到Worker
wrangler deploy

# 查看部署状态
wrangler tail
```

### 步骤4: 配置KV存储（可选）
```bash
# 创建KV命名空间（可选，用于数据持久化）
wrangler kv:namespace create "IP_CACHE"

# 复制返回的ID，更新wrangler.toml中的KV配置
# 取消注释并填入ID，然后重新部署
wrangler deploy
```

> **注意**: KV存储是可选的。Worker在没有KV存储的情况下也能正常工作，只是无法保存检测历史和订阅数据。

## ⚙️ 配置说明

### API密钥配置（可选但推荐）

为了获得更高的检测精度（从70%提升到95%+），建议配置API密钥：

1. **ProxyCheck.io API密钥**
   - 免费额度：1000次/天
   - 获取地址：https://proxycheck.io/api/
   - 在网页界面的"设置"标签页中配置

2. **IPinfo.io Token**
   - 免费额度：50000次/月
   - 获取地址：https://ipinfo.io/signup
   - 在网页界面的"设置"标签页中配置

### 订阅管理

1. 在"订阅管理"标签页添加您的订阅链接
2. 系统会自动解析并检测其中的IP地址
3. 支持多种订阅格式（Clash、V2Ray、Shadowsocks等）
4. 数据安全存储在Cloudflare KV中

## 📖 使用指南

### 单IP检测
1. 在"单IP检测"标签页输入IP地址
2. 点击"检测IP"按钮
3. 查看详细的检测结果

### 批量检测
1. 在"批量检测"标签页输入多个IP地址（每行一个）
2. 点击"批量检测"按钮
3. 等待检测完成，可导出CSV结果

### 订阅管理
1. 添加订阅名称和链接
2. 点击"测试"按钮验证订阅
3. 使用"检查所有订阅"进行批量检测

### 定时任务
- 系统每天北京时间00:00自动执行检测
- 在"定时任务"标签页查看执行状态
- 支持手动触发检测

## 🔧 API接口

- `GET /api/check-ip?ip=<IP地址>` - 检测单个IP地址
- `POST /api/check-subscription` - 检测订阅链接
- `GET /api/status` - 获取系统运行状态
- `POST /api/manual-check` - 手动触发定时检测
- `GET /api/clash-config` - 获取Clash配置文件

## 🛠️ 技术栈

- **后端**: Cloudflare Worker
- **前端**: HTML5, CSS3, JavaScript (ES5兼容)
- **存储**: Cloudflare KV Storage
- **API**: ProxyCheck.io, IPinfo.io
- **部署**: Wrangler CLI

## 📞 故障排除

### 常见问题

1. **部署失败**
   - 检查Wrangler登录状态：`wrangler whoami`
   - 验证wrangler.toml配置格式
   - 查看详细错误：`wrangler deploy --verbose`

2. **JavaScript错误**
   - 清除浏览器缓存
   - 确认访问正确的Worker URL
   - 检查浏览器控制台错误

3. **API检测失败**
   - 检查网络连接
   - 验证API密钥配置
   - 查看API使用额度

### 获取帮助

如果遇到问题，请提供：
- 完整错误信息
- 浏览器控制台日志
- Worker部署日志
- 操作步骤

## 📚 文档

- [部署后配置指南](docs/POST_DEPLOYMENT_SETUP.md)
- [详细部署指南](docs/WORKER_DEPLOYMENT.md)
- [快速开始指南](docs/QUICK_START.md)

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个项目！

## 📄 许可证

MIT License

---

## 🎉 立即开始

点击一键部署按钮，几分钟内即可拥有您自己的IP纯净度检查工具！

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/twj0/ip-address-purity-checker)

部署完成后，您将获得一个类似这样的URL：
```
https://ip-purity-checker.your-username.workers.dev
```

开始享受专业的IP纯净度检测服务吧！
