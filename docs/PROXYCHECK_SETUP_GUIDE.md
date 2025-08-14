# 🔍 ProxyCheck.io 配置指南

## 📋 概述

ProxyCheck.io 是一个专业的代理/VPN检测服务，专门用于识别"非纯净"IP地址。相比其他通用IP信息服务，ProxyCheck.io 在代理检测方面更加精确和专业。

## 🎯 为什么选择 ProxyCheck.io？

### 专业优势
- **专业检测**：专门针对代理、VPN、Tor等匿名服务
- **精确评分**：提供0-100的风险评分，量化IP纯净度
- **详细分类**：区分VPN、托管、公共代理、企业代理等类型
- **实时更新**：数据库持续更新，检测最新的代理服务

### 与其他服务对比
| 特性 | ProxyCheck.io | IPinfo.io | ip-api.com |
|------|---------------|-----------|------------|
| 代理检测专业性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| 风险评分 | ✅ 0-100分 | ❌ 无 | ❌ 无 |
| 免费额度 | 1000次/天 | 50000次/月 | 1000次/月 |
| 检测准确性 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

## 🚀 快速开始

### 1. 注册免费账户

1. **访问注册页面**
   ```
   https://proxycheck.io/api/
   ```

2. **填写注册信息**
   - 邮箱地址
   - 密码
   - 验证邮箱

3. **获取API密钥**
   - 登录后在Dashboard中找到API Key
   - 复制密钥备用

### 2. 配置API密钥

#### 方法一：环境变量（推荐）
```bash
# Linux/macOS
export PROXYCHECK_API_KEY="your_api_key_here"

# Windows
set PROXYCHECK_API_KEY=your_api_key_here
```

#### 方法二：配置文件
创建文件 `proxycheck-api-key.txt`：
```
your_api_key_here
```

#### 方法三：Web界面输入
在Web界面的"ProxyCheck.io API Key"输入框中直接输入

### 3. 测试配置

运行测试脚本验证配置：
```bash
python scripts/test_proxycheck.py
```

## 📊 免费计划详情

### 免费额度
- **每日请求数**：1,000次
- **速率限制**：2次/秒
- **重置时间**：每日UTC午夜
- **功能限制**：无，享受完整功能

### 付费计划
- **Starter**：$10/月，10,000次/天
- **Professional**：$25/月，50,000次/天
- **Enterprise**：$100/月，500,000次/天

## 🔧 API使用详解

### 基本请求格式
```
GET http://proxycheck.io/v2/{ip}?key={api_key}&vpn=1&risk=1&asn=1
```

### 重要参数
- `vpn=1`：启用VPN检测
- `risk=1`：获取风险评分
- `asn=1`：获取ASN信息
- `key={api_key}`：API密钥（可选，但强烈推荐）

### 响应示例
```json
{
  "status": "ok",
  "8.8.8.8": {
    "proxy": "yes",
    "type": "Hosting",
    "risk": 85,
    "country": "US",
    "city": "Mountain View",
    "isp": "Google LLC",
    "asn": "AS15169"
  }
}
```

## 📈 风险评分解读

### 评分范围
- **0-33分**：低风险，可能是纯净住宅IP
- **34-65分**：中等风险，需要谨慎判断
- **66-100分**：高风险，很可能是代理/VPN

### 代理类型说明
- **VPN**：虚拟专用网络
- **Hosting**：数据中心/托管服务器
- **Public Proxy**：公共代理服务器
- **Corporate Proxy**：企业代理
- **Residential Proxy**：住宅代理（最难检测）

## 🛠️ 项目集成

### 在命令行工具中使用
```bash
# 设置API密钥
export PROXYCHECK_API_KEY="your_key"

# 检查单个IP
python -m src.ip_checker.cli check-ip 8.8.8.8

# 批量检查
python -m src.ip_checker.cli check-batch ips.txt
```

### 在Web界面中使用
1. 打开Web界面
2. 在"ProxyCheck.io API Key"输入框中输入密钥
3. 进行IP检测，享受专业级检测结果

### 在API中使用
```bash
# 单IP检测
curl -H "X-ProxyCheck-Key: your_key" \
     "https://your-domain.vercel.app/api/check-ip?ip=8.8.8.8"

# 订阅检测
curl -X POST \
     -H "X-ProxyCheck-Key: your_key" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "urls=https://example.com/subscription" \
     "https://your-domain.vercel.app/api/check-subscription"
```

## ⚡ 性能优化

### 速率限制管理
```python
# 项目已内置智能速率限制
# 免费用户：0.5秒间隔
# 付费用户：0.1秒间隔
```

### 批量检测建议
- **小批量**：< 100个IP，直接批量处理
- **中批量**：100-500个IP，分批处理
- **大批量**：> 500个IP，考虑升级付费计划

### 缓存策略
- IP检测结果可缓存1-24小时
- 代理状态变化相对较慢
- 建议根据使用场景调整缓存时间

## 🔒 安全最佳实践

### API密钥保护
- ✅ 使用环境变量存储
- ✅ 不要提交到版本控制
- ✅ 定期轮换密钥
- ❌ 不要硬编码在代码中

### 请求安全
- 使用HTTPS传输（生产环境）
- 验证响应数据完整性
- 处理API错误和超时

## 🐛 故障排除

### 常见错误

#### 1. API密钥无效
```json
{
  "status": "error",
  "message": "Invalid API key"
}
```
**解决方案**：检查API密钥是否正确，重新从Dashboard复制

#### 2. 超出速率限制
```json
{
  "status": "error", 
  "message": "Rate limit exceeded"
}
```
**解决方案**：
- 减慢请求频率
- 获取API密钥提升限制
- 升级付费计划

#### 3. 超出每日限制
```json
{
  "status": "error",
  "message": "Daily query limit exceeded"
}
```
**解决方案**：
- 等待UTC午夜重置
- 升级付费计划
- 优化检测策略

### 调试技巧
```bash
# 启用详细日志
export LOG_LEVEL=DEBUG

# 测试API连接
python scripts/test_proxycheck.py

# 检查配置
python -c "
import os
from src.ip_checker.proxycheck_provider import ProxyCheckProvider
provider = ProxyCheckProvider()
print(provider.test_connection())
"
```

## 📚 进阶使用

### 自定义纯净度阈值
```python
# 默认阈值：风险评分 >= 60 为非纯净
# 可根据需求调整：

# 严格模式：风险评分 >= 40
def is_pure_strict(risk_score):
    return risk_score < 40

# 宽松模式：风险评分 >= 80  
def is_pure_loose(risk_score):
    return risk_score < 80
```

### 结合多个数据源
```python
# 项目已实现多数据源回退：
# 1. ProxyCheck.io (主要)
# 2. IPinfo.io (备用)
# 3. ip-api.com (最后备用)
```

### 监控和告警
- 监控API使用量
- 设置使用量告警
- 跟踪检测准确性

## 🎯 最佳实践总结

1. **获取API密钥**：即使免费版也比无密钥版本更好
2. **合理使用**：根据实际需求选择检测频率
3. **错误处理**：妥善处理API错误和网络异常
4. **数据缓存**：避免重复检测相同IP
5. **监控使用**：跟踪API使用量和成本

---

🎉 **现在您已经完全配置好ProxyCheck.io，可以享受专业级的IP纯净度检测服务！**
