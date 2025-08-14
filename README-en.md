# IP Address Purity Checker

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-enabled-brightgreen.svg)](https://github.com/features/actions)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-supported-orange.svg)](https://workers.cloudflare.com/)
[![Vercel](https://img.shields.io/badge/Vercel-deployable-black.svg)](https://vercel.com/)

A powerful tool for detecting the purity of proxy node IP addresses, automatically filtering out clean IPs that are not from data centers/proxies/VPNs, and generating optimized Clash configuration files.

English | [中文](README.md)

## ✨ Key Features

- 🔍 **Smart IP Detection**: Dual detection mechanism using IPinfo.io and ip-api.com
- 📡 **Multi-format Subscription Support**: Supports vmess, vless, trojan, ss, ssr protocols
- 🎯 **Purity Filtering**: Automatically identifies and filters data center, CDN, proxy server IPs
- ⚡ **Clash Config Generation**: Auto-generates Clash configs grouped by country and purity
- 🤖 **Automated Checking**: Supports GitHub Actions scheduled checks
- ☁️ **Multi-platform Deployment**: Supports Cloudflare Workers and Vercel deployment
- 📊 **Detailed Reports**: Generates CSV reports with IP information and purity status

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [API Configuration](#-api-configuration)
- [Deployment Options](#-deployment-options)
- [Project Structure](#-project-structure)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-faq)
- [Contributing](#-contributing)

## 🚀 Quick Start

Want to try it immediately? Follow these steps for a quick start:

```bash
# 1. Clone the repository
git clone https://github.com/your-username/ip-address-purity-checker.git
cd ip-address-purity-checker

# 2. Install dependencies
pip install -r requirements.txt

# 3. Environment check
python scripts/check_environment.py

# 4. Small batch test (recommended for first use)
python scripts/test_small_batch.py

# 5. Run full check (IPinfo.io token recommended for best results)
export IPINFO_TOKEN="your_token_here"  # Optional but recommended
python scripts/run_purity_check.py
```

**⚡ One-minute trial version:**
```bash
# Test basic functionality only, no token required
python scripts/test_small_batch.py
```

**🎯 Production version:**
```bash
# Get free IPinfo.io token: https://ipinfo.io/signup
export IPINFO_TOKEN="your_token_here"
python scripts/dedup_purity_to_yaml.py
```

## 🚀 Installation

### Requirements

- Python 3.8+
- pip package manager

### Quick Install

```bash
# Clone the repository
git clone https://github.com/your-username/ip-address-purity-checker.git
cd ip-address-purity-checker

# Install dependencies
pip install -r requirements.txt

# Environment check
python scripts/check_environment.py
```

### Dependencies

```
requests>=2.28.0
lxml>=4.9.0
PyYAML>=6.0
tqdm>=4.64.0
ipinfo>=4.4.0
```

## ⚙️ Configuration

### 1. Subscription Links Configuration

Create or edit the `汇聚订阅.txt` file with one subscription link per line:

```
https://example.com/subscription1
https://example.com/subscription2
# This is a comment line, will be ignored
```

### 2. Configuration File

`config.json` contains all configuration options:

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

## 🔑 API Configuration

### IPinfo.io Token (Highly Recommended)

Getting a free IPinfo.io API token can significantly improve performance:

1. Visit [IPinfo.io](https://ipinfo.io/signup) to register an account
2. Get API token (free account: 50,000 requests/month)
3. Configure the token:

**Method 1: Environment Variable**
```bash
export IPINFO_TOKEN="your_token_here"
```

**Method 2: File Configuration**
```bash
echo "your_token_here" > ipinfo-token.txt
```

**Method 3: GitHub Secrets (for Actions)**
Add `IPINFO_TOKEN` secret in your GitHub repository settings.

### Performance Comparison

| Configuration | Rate Limit | Concurrency | Accuracy |
|---------------|------------|-------------|----------|
| No Token | 45/minute | 2-5 | Basic |
| With Token | 1000/minute | 10-20 | Enhanced |

## 📖 Usage

### Basic Usage

```bash
# Environment check
python scripts/check_environment.py

# Small batch test
python scripts/test_small_batch.py

# Run IP purity check
python scripts/run_purity_check.py

# Generate deduplicated Clash config
python scripts/dedup_purity_to_yaml.py
```

### Output Files

- `subscription_ip_report.csv`: Detailed IP check report
- `dedup_purity_clash.yml`: Optimized Clash configuration file

### Advanced Usage

```bash
# Batch processing script
python scripts/ipinfo_batch_processor.py

# Generate sorted configuration
python scripts/generate_sorted_config.py

# Debug mode execution
PYTHONPATH=. python -c "
import logging
logging.basicConfig(level=logging.DEBUG)
from scripts.run_purity_check import main
main()
"
```

### Output Examples

**CSV Report Format:**
```csv
host,ip,pure,country,regionName,city,isp,org,as
example.com,1.2.3.4,yes,United States,California,Los Angeles,ISP Name,Organization,AS12345
```

**Clash Configuration Structure:**
```yaml
proxies:
  - name: "Node Name"
    type: vmess
    server: 1.2.3.4
    port: 443
    # ... other configurations

proxy-groups:
  - name: "✈️ PROXY"
    type: select
    proxies: ["⚡ URL-TEST", "✅ PURE", "AUTO-US"]

  - name: "⚡ URL-TEST"
    type: url-test
    proxies: ["Pure Node 1", "Pure Node 2"]

  - name: "✅ PURE"
    type: select
    proxies: ["All Pure Nodes"]
```

## 🌐 Deployment Options

### GitHub Actions

The project includes pre-configured GitHub Actions workflows:

```yaml
# .github/workflows/ipinfo-purity-check.yml
name: IPinfo.io IP Purity Check
on:
  schedule:
    - cron: '0 16 * * *'  # Run daily at UTC 16:00
  workflow_dispatch:
```

Setup steps:
1. Fork this repository
2. Add `IPINFO_TOKEN` in Settings > Secrets
3. Enable Actions
4. Check Artifacts for results

### Cloudflare Workers

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy Worker
wrangler deploy
```

### Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel --prod
```

Or click for one-click deployment:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/ip-address-purity-checker)

## 📁 Project Structure

```
ip-address-purity-checker/
├── src/
│   └── ip_checker/
│       ├── __init__.py
│       ├── config.py          # Configuration management
│       ├── ip_utils.py        # IP checking core logic
│       ├── ipinfo_provider.py # IPinfo.io API wrapper
│       ├── subscription.py    # Subscription parsing
│       └── clash.py          # Clash config generation
├── scripts/
│   ├── run_purity_check.py   # Main checking script
│   ├── dedup_purity_to_yaml.py # Config generation script
│   ├── check_environment.py  # Environment check
│   └── test_*.py             # Test scripts
├── api/
│   ├── check-ip.py           # Vercel API endpoint
│   └── scheduled-check.py    # Scheduled check API
├── cloudflare/
│   └── worker.js             # Cloudflare Worker
├── .github/workflows/        # GitHub Actions
├── config.json              # Main configuration file
├── requirements.txt          # Python dependencies
├── wrangler.toml            # Cloudflare configuration
├── vercel.json              # Vercel configuration
└── 汇聚订阅.txt              # Subscription links file
```

## ❓ FAQ

### Q: What to do when encountering 429 errors (rate limiting)?

A: This is caused by API rate limiting. Solutions:
1. Get an IPinfo.io token (recommended)
2. Reduce concurrency
3. Increase request intervals

### Q: Why do some IP detections fail?

A: Possible reasons:
- Network connection issues
- API service temporarily unavailable
- Invalid or private IP addresses

### Q: How to improve detection accuracy?

A: Recommendations:
1. Use IPinfo.io paid token for privacy data
2. Regularly update blacklist keywords
3. Combine multiple data sources for verification

### Q: Which proxy protocols are supported?

A: Supports mainstream protocols:
- VMess
- VLESS
- Trojan
- Shadowsocks (SS)
- ShadowsocksR (SSR)
- Clash YAML format

### Q: How to optimize performance for large batch processing?

A: Performance optimization recommendations:
1. **Get IPinfo.io paid token**: Increase rate limit to 50,000/month
2. **Adjust concurrency**: Tune `max_concurrent_requests` based on network environment
3. **Batch processing**: Split large IP sets into smaller batches
4. **Cache results**: Avoid duplicate queries for same IPs
5. **Use proxy**: Use proxy in network-restricted environments

### Q: What are the purity determination criteria?

A: Determination criteria include:
1. **IPinfo.io privacy data**: hosting, vpn, proxy, tor fields
2. **Keyword matching**: Data center keywords in ISP/organization names
3. **Blacklist**: Known cloud service providers and CDN providers

**Blacklist keyword examples:**
```
alibaba, aws, google, microsoft, azure, cloudflare,
akamai, ovh, hetzner, digitalocean, vultr, linode
```

### Q: How to customize purity rules?

A: You can modify the `is_pure_ip` function in `src/ip_checker/ip_utils.py`:

```python
def is_pure_ip(ip_info: Optional[Dict]) -> bool:
    # Add custom rules
    custom_blacklist = ["your_custom_keyword"]

    # Existing logic...
    for kw in custom_blacklist:
        if kw in text.lower():
            return False

    return True
```

## 🔧 Troubleshooting

### Common Errors and Solutions

**1. Connection Timeout Error**
```
requests.exceptions.ConnectTimeout: HTTPSConnectionPool(host='ipinfo.io', port=443)
```
Solutions:
- Check network connection
- Configure proxy settings
- Increase timeout duration

**2. Rate Limiting Error**
```
HTTP 429: Too Many Requests
```
Solutions:
- Get IPinfo.io token
- Reduce concurrency
- Increase request intervals

**3. Module Import Error**
```
ModuleNotFoundError: No module named 'src'
```
Solutions:
```bash
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
# or
python -m scripts.run_purity_check
```

### Performance Monitoring

**Monitoring Script Example:**
```bash
#!/bin/bash
# monitor_performance.sh

echo "Starting performance monitoring..."
start_time=$(date +%s)

python scripts/run_purity_check.py 2>&1 | tee performance.log

end_time=$(date +%s)
duration=$((end_time - start_time))

echo "Execution time: ${duration} seconds"
echo "Success rate: $(grep -c "success" performance.log)"
echo "Failure rate: $(grep -c "failed" performance.log)"
```

**Log Analysis:**
```bash
# View error statistics
grep "ERROR" logs/*.log | cut -d: -f3 | sort | uniq -c

# View API response times
grep "response_time" logs/*.log | awk '{sum+=$NF; count++} END {print "Average response time:", sum/count, "ms"}'
```

## 🤝 Contributing

We welcome all forms of contributions!

### How to Contribute

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Environment Setup

```bash
# Clone your fork
git clone https://github.com/your-username/ip-address-purity-checker.git
cd ip-address-purity-checker

# Install development dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt  # if exists

# Run tests
python -m pytest tests/

# Code formatting
black src/ scripts/
flake8 src/ scripts/
```

### Reporting Issues

Please use GitHub Issues to report bugs or request new features. Provide:
- Operating system and Python version
- Error messages and stack traces
- Steps to reproduce
- Expected behavior

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [IPinfo.io](https://ipinfo.io/) - For providing high-quality IP geolocation data
- [ip-api.com](http://ip-api.com/) - For free IP information API
- All contributors and users for their support

## 📞 Contact

- Project Homepage: [GitHub Repository](https://github.com/your-username/ip-address-purity-checker)
- Issue Reports: [GitHub Issues](https://github.com/your-username/ip-address-purity-checker/issues)
- Discussions: [GitHub Discussions](https://github.com/your-username/ip-address-purity-checker/discussions)

---

⭐ If this project helps you, please give it a star!
