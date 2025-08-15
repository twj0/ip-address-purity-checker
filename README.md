[English](README-en.md) | 中文

# 🔍 IP地址纯净度检查工具

基于Cloudflare Worker部署，支持ProxyCheck.io专业检测算法，提供完整的订阅链接管理和自动化检测功能。

## 🚀 一键部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/twj0/ip-address-purity-checker)

点击上面的按钮，几分钟内即可完成部署！


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
wrangler kv namespace create "IP_CACHE"

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


