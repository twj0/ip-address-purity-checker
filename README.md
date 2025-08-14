# IP地址纯净度检查工具

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-enabled-brightgreen.svg)](https://github.com/features/actions)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-supported-orange.svg)](https://workers.cloudflare.com/)
[![Vercel](https://img.shields.io/badge/Vercel-deployable-black.svg)](https://vercel.com/)

一个强大的工具，用于检测代理节点IP地址的纯净度，自动筛选出非数据中心/代理/VPN的纯净IP地址，并生成优化的Clash配置文件。

[English](README-en.md) | 中文

## ✨ 主要功能

- 🔍 **智能IP检测**: 使用IPinfo.io和ip-api.com双重检测机制
- 📡 **多格式订阅支持**: 支持vmess、vless、trojan、ss、ssr等协议
- 🎯 **纯净度筛选**: 自动识别并过滤数据中心、CDN、代理服务器IP
- ⚡ **Clash配置生成**: 自动生成按国家和纯净度分组的Clash配置
- 🤖 **自动化检查**: 支持GitHub Actions定时检查
- ☁️ **多平台部署**: 支持Cloudflare Workers和Vercel部署
- 📊 **详细报告**: 生成包含IP信息和纯净度的CSV报告

## 📋 目录

- [快速开始](#-快速开始)
- [安装](#-安装)
- [配置](#-配置)
- [使用方法](#-使用方法)
- [API配置](#-api配置)
- [部署选项](#-部署选项)
- [项目结构](#-项目结构)
- [故障排除](#-故障排除)
- [常见问题](#-常见问题)
- [贡献指南](#-贡献指南)

## 🚀 快速开始

想要立即体验？按照以下步骤快速开始：

```bash
# 1. 克隆项目
git clone https://github.com/your-username/ip-address-purity-checker.git
cd ip-address-purity-checker

# 2. 安装依赖
pip install -r requirements.txt

# 3. 环境检查
python scripts/check_environment.py

# 4. 小批量测试（推荐首次使用）
python scripts/test_small_batch.py

# 5. 运行完整检查（需要IPinfo.io token以获得最佳效果）
export IPINFO_TOKEN="your_token_here"  # 可选但推荐
python scripts/run_purity_check.py
```

**⚡ 一分钟体验版：**
```bash
# 仅测试基本功能，无需token
python scripts/test_small_batch.py
```

**🎯 生产环境版：**
```bash
# 获取IPinfo.io免费token: https://ipinfo.io/signup
export IPINFO_TOKEN="your_token_here"
python scripts/dedup_purity_to_yaml.py
```

## 🚀 安装

### 环境要求

- Python 3.8+
- pip包管理器

### 快速安装

```bash
# 克隆项目
git clone https://github.com/your-username/ip-address-purity-checker.git
cd ip-address-purity-checker

# 安装依赖
pip install -r requirements.txt

# 环境检查
python scripts/check_environment.py
```

### 依赖包

```
requests>=2.28.0
lxml>=4.9.0
PyYAML>=6.0
tqdm>=4.64.0
ipinfo>=4.4.0
```

## ⚙️ 配置

### 1. 订阅链接配置

创建或编辑 `汇聚订阅.txt` 文件，每行一个订阅链接：

```
https://example.com/subscription1
https://example.com/subscription2
# 这是注释行，会被忽略
```

### 2. 配置文件

`config.json` 包含所有配置选项：

```json
{
  "external_controller": "http://127.0.0.1:9090",
  "secret": "",
  "select_proxy_group": "GLOBAL",
  "port_start": 42000,
  "max_threads": 20,
  "ip_info": {
    "primary_provider": "ipinfo",
    "fallback_provider": "ip-api",
    "max_concurrent_requests": 10,
    "ipinfo": {
      "base_url": "https://ipinfo.io",
      "rate_limit_per_minute": 1000,
      "timeout": 10,
      "max_retries": 2,
      "retry_delay": 1.0
    },
    "ip_api": {
      "base_url": "http://ip-api.com",
      "rate_limit_per_minute": 45,
      "timeout": 8,
      "max_retries": 2,
      "retry_delay": 1.5
    }
  }
}
```

## 🔑 API配置

### IPinfo.io Token（强烈推荐）

获取免费的IPinfo.io API token可以大幅提升性能：

1. 访问 [IPinfo.io](https://ipinfo.io/signup) 注册账户
2. 获取API token（免费账户每月50,000次请求）
3. 配置token：

**方法1：环境变量**
```bash
export IPINFO_TOKEN="your_token_here"
```

**方法2：文件配置**
```bash
echo "your_token_here" > ipinfo-token.txt
```

**方法3：GitHub Secrets（用于Actions）**
在GitHub仓库设置中添加 `IPINFO_TOKEN` secret。

### 性能对比

| 配置 | 速率限制 | 并发数 | 准确性 |
|------|----------|--------|--------|
| 无Token | 45次/分钟 | 2-5 | 基础 |
| 有Token | 1000次/分钟 | 10-20 | 增强 |

## 📖 使用方法

### 基本使用

```bash
# 环境检查
python scripts/check_environment.py

# 小批量测试
python scripts/test_small_batch.py

# 运行IP纯净度检查
python scripts/run_purity_check.py

# 生成去重的Clash配置
python scripts/dedup_purity_to_yaml.py
```

### 输出文件

- `subscription_ip_report.csv`: 详细的IP检查报告
- `dedup_purity_clash.yml`: 优化的Clash配置文件

### 高级用法

```bash
# 批量处理脚本
python scripts/ipinfo_batch_processor.py

# 生成排序配置
python scripts/generate_sorted_config.py

# 调试模式运行
PYTHONPATH=. python -c "
import logging
logging.basicConfig(level=logging.DEBUG)
from scripts.run_purity_check import main
main()
"
```

### 输出示例

**CSV报告格式：**
```csv
host,ip,pure,country,regionName,city,isp,org,as
example.com,1.2.3.4,yes,United States,California,Los Angeles,ISP Name,Organization,AS12345
```

**Clash配置结构：**
```yaml
proxies:
  - name: "节点名称"
    type: vmess
    server: 1.2.3.4
    port: 443
    # ... 其他配置

proxy-groups:
  - name: "✈️ PROXY"
    type: select
    proxies: ["⚡ URL-TEST", "✅ PURE", "AUTO-US"]

  - name: "⚡ URL-TEST"
    type: url-test
    proxies: ["纯净节点1", "纯净节点2"]

  - name: "✅ PURE"
    type: select
    proxies: ["所有纯净节点"]
```

## 🌐 部署选项

### GitHub Actions

项目包含预配置的GitHub Actions工作流：

```yaml
# .github/workflows/ipinfo-purity-check.yml
name: IPinfo.io IP Purity Check
on:
  schedule:
    - cron: '0 16 * * *'  # 每天UTC 16:00运行
  workflow_dispatch:
```

配置步骤：
1. Fork此仓库
2. 在Settings > Secrets中添加 `IPINFO_TOKEN`
3. 启用Actions
4. 查看Artifacts获取结果

### Cloudflare Workers

```bash
# 安装Wrangler CLI
npm install -g wrangler

# 登录Cloudflare
wrangler login

# 部署Worker
wrangler deploy
```

### Vercel部署

```bash
# 安装Vercel CLI
npm install -g vercel

# 部署到Vercel
vercel --prod
```

或者点击一键部署：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/ip-address-purity-checker)

## 📁 项目结构

```
ip-address-purity-checker/
├── src/
│   └── ip_checker/
│       ├── __init__.py
│       ├── config.py          # 配置管理
│       ├── ip_utils.py        # IP检查核心逻辑
│       ├── ipinfo_provider.py # IPinfo.io API封装
│       ├── subscription.py    # 订阅解析
│       └── clash.py          # Clash配置生成
├── scripts/
│   ├── run_purity_check.py   # 主检查脚本
│   ├── dedup_purity_to_yaml.py # 配置生成脚本
│   ├── check_environment.py  # 环境检查
│   └── test_*.py             # 测试脚本
├── api/
│   ├── check-ip.py           # Vercel API端点
│   └── scheduled-check.py    # 定时检查API
├── cloudflare/
│   └── worker.js             # Cloudflare Worker
├── .github/workflows/        # GitHub Actions
├── config.json              # 主配置文件
├── requirements.txt          # Python依赖
├── wrangler.toml            # Cloudflare配置
├── vercel.json              # Vercel配置
└── 汇聚订阅.txt              # 订阅链接文件
```

## ❓ 常见问题

### Q: 遇到429错误（速率限制）怎么办？

A: 这是API速率限制导致的，解决方案：
1. 获取IPinfo.io token（推荐）
2. 降低并发数
3. 增加请求间隔

### Q: 为什么有些IP检测失败？

A: 可能的原因：
- 网络连接问题
- API服务暂时不可用
- IP地址无效或私有地址

### Q: 如何提高检测准确性？

A: 建议：
1. 使用IPinfo.io付费token获得隐私数据
2. 定期更新黑名单关键词
3. 结合多个数据源进行验证

### Q: 支持哪些代理协议？

A: 支持主流协议：
- VMess
- VLESS
- Trojan
- Shadowsocks (SS)
- ShadowsocksR (SSR)
- Clash YAML格式

### Q: 如何优化大批量处理性能？

A: 性能优化建议：
1. **获取IPinfo.io付费token**: 提升速率限制到50,000次/月
2. **调整并发数**: 根据网络环境调整 `max_concurrent_requests`
3. **分批处理**: 将大量IP分成小批次处理
4. **缓存结果**: 避免重复查询相同IP
5. **使用代理**: 在网络受限环境下使用代理

### Q: 纯净度判定标准是什么？

A: 判定标准包括：
1. **IPinfo.io隐私数据**: hosting、vpn、proxy、tor字段
2. **关键词匹配**: ISP/组织名称中的数据中心关键词
3. **黑名单**: 已知的云服务商和CDN提供商

**黑名单关键词示例：**
```
alibaba, aws, google, microsoft, azure, cloudflare,
akamai, ovh, hetzner, digitalocean, vultr, linode
```

### Q: 如何自定义纯净度规则？

A: 可以通过修改 `src/ip_checker/ip_utils.py` 中的 `is_pure_ip` 函数：

```python
def is_pure_ip(ip_info: Optional[Dict]) -> bool:
    # 添加自定义规则
    custom_blacklist = ["your_custom_keyword"]

    # 现有逻辑...
    for kw in custom_blacklist:
        if kw in text.lower():
            return False

    return True
```

## 🔧 故障排除

### 常见错误及解决方案

**1. 连接超时错误**
```
requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='ipinfo.io', port=443)
```
解决方案：
- 检查网络连接
- 配置代理设置
- 增加超时时间

**2. 速率限制错误**
```
HTTP 429: Too Many Requests
```
解决方案：
- 获取IPinfo.io token
- 降低并发数
- 增加请求间隔

**3. 模块导入错误**
```
ModuleNotFoundError: No module named 'src'
```
解决方案：
```bash
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
# 或者
python -m scripts.run_purity_check
```

### 性能监控

**监控脚本示例：**
```bash
#!/bin/bash
# monitor_performance.sh

echo "开始性能监控..."
start_time=$(date +%s)

python scripts/run_purity_check.py 2>&1 | tee performance.log

end_time=$(date +%s)
duration=$((end_time - start_time))

echo "执行时间: ${duration}秒"
echo "成功率: $(grep -c "成功" performance.log)"
echo "失败率: $(grep -c "失败" performance.log)"
```

**日志分析：**
```bash
# 查看错误统计
grep "ERROR" logs/*.log | cut -d: -f3 | sort | uniq -c

# 查看API响应时间
grep "response_time" logs/*.log | awk '{sum+=$NF; count++} END {print "平均响应时间:", sum/count, "ms"}'
```

## 🤝 贡献指南

我们欢迎各种形式的贡献！

### 如何贡献

1. Fork此仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

### 开发环境设置

```bash
# 克隆你的fork
git clone https://github.com/your-username/ip-address-purity-checker.git
cd ip-address-purity-checker

# 安装开发依赖
pip install -r requirements.txt
pip install -r requirements-dev.txt  # 如果存在

# 运行测试
python -m pytest tests/

# 代码格式化
black src/ scripts/
flake8 src/ scripts/
```

### 报告问题

请使用GitHub Issues报告bug或请求新功能。提供以下信息：
- 操作系统和Python版本
- 错误信息和堆栈跟踪
- 重现步骤
- 预期行为

## 📄 许可证

本项目采用MIT许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [IPinfo.io](https://ipinfo.io/) - 提供高质量的IP地理位置数据
- [ip-api.com](http://ip-api.com/) - 免费的IP信息API
- 所有贡献者和用户的支持

## 📞 联系方式

- 项目主页: [GitHub Repository](https://github.com/your-username/ip-address-purity-checker)
- 问题反馈: [GitHub Issues](https://github.com/your-username/ip-address-purity-checker/issues)
- 讨论交流: [GitHub Discussions](https://github.com/your-username/ip-address-purity-checker/discussions)

---

⭐ 如果这个项目对你有帮助，请给它一个星标！
