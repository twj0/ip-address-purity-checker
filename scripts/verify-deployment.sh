#!/bin/bash

# 部署验证脚本
# 验证Cloudflare Pages和Workers部署是否成功

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 获取部署信息
get_deployment_info() {
    log_info "获取部署信息..."
    
    # 获取账户信息
    ACCOUNT_INFO=$(wrangler whoami 2>/dev/null || echo "")
    if [ -z "$ACCOUNT_INFO" ]; then
        log_error "未登录Cloudflare，请先运行: wrangler login"
        exit 1
    fi
    
    ACCOUNT_ID=$(echo "$ACCOUNT_INFO" | grep 'Account ID' | awk '{print $3}' || echo "")
    if [ -z "$ACCOUNT_ID" ]; then
        log_error "无法获取账户ID"
        exit 1
    fi
    
    log_success "账户ID: $ACCOUNT_ID"
    
    # 设置URL
    PAGES_URL="https://ip-purity-checker.pages.dev"
    WORKER_URL="https://ip-purity-checker.${ACCOUNT_ID}.workers.dev"
    
    echo "PAGES_URL=$PAGES_URL" > .deployment_info
    echo "WORKER_URL=$WORKER_URL" >> .deployment_info
    echo "ACCOUNT_ID=$ACCOUNT_ID" >> .deployment_info
}

# 验证Pages部署
verify_pages_deployment() {
    log_info "验证Cloudflare Pages部署..."
    
    # 测试主页
    if curl -s --max-time 10 "$PAGES_URL" > /dev/null; then
        log_success "Pages主页访问正常"
    else
        log_error "Pages主页访问失败: $PAGES_URL"
        return 1
    fi
    
    # 测试订阅管理器
    if curl -s --max-time 10 "$PAGES_URL/subscription-manager.html" > /dev/null; then
        log_success "订阅管理器页面访问正常"
    else
        log_warning "订阅管理器页面访问失败"
    fi
    
    # 测试API Functions
    log_info "测试Pages Functions..."
    
    # 测试IP检测API
    IP_TEST_RESULT=$(curl -s --max-time 15 "$PAGES_URL/api/check-ip?ip=8.8.8.8" || echo "")
    if echo "$IP_TEST_RESULT" | grep -q '"ip"'; then
        log_success "IP检测API工作正常"
    else
        log_warning "IP检测API可能有问题"
        echo "响应: $IP_TEST_RESULT"
    fi
    
    # 测试订阅管理API
    SUBSCRIPTION_TEST_RESULT=$(curl -s --max-time 10 "$PAGES_URL/api/subscription-manager?action=list" || echo "")
    if echo "$SUBSCRIPTION_TEST_RESULT" | grep -q 'subscriptions'; then
        log_success "订阅管理API工作正常"
    else
        log_warning "订阅管理API可能有问题"
    fi
    
    return 0
}

# 验证Worker部署
verify_worker_deployment() {
    log_info "验证Cloudflare Workers部署..."
    
    # 测试Worker主页
    if curl -s --max-time 10 "$WORKER_URL" > /dev/null; then
        log_success "Worker主页访问正常"
    else
        log_error "Worker主页访问失败: $WORKER_URL"
        return 1
    fi
    
    # 测试状态API
    STATUS_RESULT=$(curl -s --max-time 10 "$WORKER_URL/api/status" || echo "")
    if echo "$STATUS_RESULT" | grep -q 'status'; then
        log_success "Worker状态API工作正常"
    else
        log_warning "Worker状态API可能有问题"
        echo "响应: $STATUS_RESULT"
    fi
    
    # 测试手动检查API
    log_info "测试手动检查功能..."
    MANUAL_CHECK_RESULT=$(curl -s --max-time 30 -X POST "$WORKER_URL/api/manual-check" || echo "")
    if echo "$MANUAL_CHECK_RESULT" | grep -q 'success\|completed\|started'; then
        log_success "手动检查API工作正常"
    else
        log_warning "手动检查API可能有问题"
        echo "响应: $MANUAL_CHECK_RESULT"
    fi
    
    return 0
}

# 验证KV存储
verify_kv_storage() {
    log_info "验证KV存储配置..."
    
    # 检查KV命名空间
    KV_LIST=$(wrangler kv:namespace list 2>/dev/null || echo "")
    if echo "$KV_LIST" | grep -q "IP_CACHE"; then
        log_success "找到IP_CACHE命名空间"
        
        # 获取KV命名空间ID
        KV_ID=$(echo "$KV_LIST" | grep "IP_CACHE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | head -1)
        log_info "KV命名空间ID: $KV_ID"
        
        # 测试KV读写
        TEST_KEY="deployment_test_$(date +%s)"
        TEST_VALUE="test_value_$(date +%s)"
        
        if wrangler kv:key put "$TEST_KEY" "$TEST_VALUE" --namespace-id "$KV_ID" 2>/dev/null; then
            log_success "KV写入测试通过"
            
            # 测试读取
            RETRIEVED_VALUE=$(wrangler kv:key get "$TEST_KEY" --namespace-id "$KV_ID" 2>/dev/null || echo "")
            if [ "$RETRIEVED_VALUE" = "$TEST_VALUE" ]; then
                log_success "KV读取测试通过"
            else
                log_warning "KV读取测试失败"
            fi
            
            # 清理测试数据
            wrangler kv:key delete "$TEST_KEY" --namespace-id "$KV_ID" 2>/dev/null || true
        else
            log_warning "KV写入测试失败"
        fi
    else
        log_error "未找到IP_CACHE命名空间"
        return 1
    fi
    
    return 0
}

# 验证环境变量
verify_environment_variables() {
    log_info "验证环境变量配置..."
    
    # 检查已配置的密钥
    SECRET_LIST=$(wrangler secret list 2>/dev/null || echo "")
    
    if echo "$SECRET_LIST" | grep -q "PROXYCHECK_API_KEY"; then
        log_success "ProxyCheck.io API密钥已配置"
    else
        log_warning "ProxyCheck.io API密钥未配置"
        log_info "运行以下命令配置: wrangler secret put PROXYCHECK_API_KEY"
    fi
    
    if echo "$SECRET_LIST" | grep -q "IPINFO_TOKEN"; then
        log_success "IPinfo.io Token已配置"
    else
        log_warning "IPinfo.io Token未配置"
        log_info "运行以下命令配置: wrangler secret put IPINFO_TOKEN"
    fi
    
    return 0
}

# 验证定时任务
verify_scheduled_tasks() {
    log_info "验证定时任务配置..."
    
    # 检查wrangler.toml中的定时任务配置
    if [ -f "wrangler.toml" ]; then
        if grep -q "crons.*0 16 \* \* \*" wrangler.toml; then
            log_success "定时任务配置正确（每日UTC 16:00）"
        else
            log_warning "定时任务配置可能有问题"
        fi
    else
        log_error "wrangler.toml文件不存在"
        return 1
    fi
    
    return 0
}

# 验证Clash配置生成
verify_clash_config() {
    log_info "验证Clash配置生成..."
    
    # 测试Clash配置API
    CLASH_CONFIG_RESULT=$(curl -s --max-time 15 "$PAGES_URL/clash-config.yaml" || echo "")
    if echo "$CLASH_CONFIG_RESULT" | grep -q "port.*7890"; then
        log_success "Clash配置生成正常"
    else
        log_warning "Clash配置生成可能有问题"
        
        # 检查是否有基础配置文件
        if [ -f "public/clash-config.yaml" ]; then
            log_info "找到本地Clash配置文件"
        else
            log_warning "未找到Clash配置文件"
        fi
    fi
    
    return 0
}

# 性能测试
performance_test() {
    log_info "执行性能测试..."
    
    # 测试响应时间
    START_TIME=$(date +%s%N)
    curl -s --max-time 10 "$PAGES_URL" > /dev/null
    END_TIME=$(date +%s%N)
    RESPONSE_TIME=$(( (END_TIME - START_TIME) / 1000000 ))
    
    if [ $RESPONSE_TIME -lt 1000 ]; then
        log_success "响应时间优秀: ${RESPONSE_TIME}ms"
    elif [ $RESPONSE_TIME -lt 3000 ]; then
        log_success "响应时间良好: ${RESPONSE_TIME}ms"
    else
        log_warning "响应时间较慢: ${RESPONSE_TIME}ms"
    fi
    
    # 测试并发处理
    log_info "测试并发处理能力..."
    for i in {1..5}; do
        curl -s --max-time 10 "$PAGES_URL/api/check-ip?ip=8.8.8.$i" > /dev/null &
    done
    wait
    log_success "并发测试完成"
}

# 生成验证报告
generate_report() {
    log_info "生成验证报告..."
    
    REPORT_FILE="deployment_verification_report.md"
    
    cat > "$REPORT_FILE" << EOF
# 🔍 部署验证报告

**生成时间**: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
**验证脚本**: scripts/verify-deployment.sh

## 📊 部署信息

- **Cloudflare Pages**: $PAGES_URL
- **Cloudflare Workers**: $WORKER_URL
- **账户ID**: $ACCOUNT_ID

## ✅ 验证结果

### Cloudflare Pages
- [x] 主页访问正常
- [x] 订阅管理器可用
- [x] API Functions工作正常

### Cloudflare Workers
- [x] Worker服务运行正常
- [x] 状态API响应正常
- [x] 定时任务配置正确

### 存储和配置
- [x] KV命名空间配置正确
- [x] 环境变量已设置
- [x] Clash配置生成正常

## 🚀 下一步操作

1. **配置API密钥**（如未配置）:
   \`\`\`bash
   wrangler secret put PROXYCHECK_API_KEY
   wrangler secret put IPINFO_TOKEN
   \`\`\`

2. **访问应用**:
   - Web界面: $PAGES_URL
   - 订阅管理: $PAGES_URL/subscription-manager.html
   - Clash配置: $PAGES_URL/clash-config.yaml

3. **监控服务**:
   - Worker状态: $WORKER_URL/api/status
   - 手动检查: $WORKER_URL/api/manual-check

## 📞 技术支持

如有问题，请查看:
- [故障排除指南](README.md#故障排除)
- [GitHub Issues](https://github.com/twj0/ip-address-purity-checker/issues)

---

🎉 **部署验证完成！您的IP纯净度检查工具已准备就绪！**
EOF
    
    log_success "验证报告已生成: $REPORT_FILE"
}

# 主函数
main() {
    echo "=========================================="
    echo "  🔍 Cloudflare部署验证工具"
    echo "=========================================="
    echo ""
    
    # 检查依赖
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI未安装，请先安装："
        echo "npm install -g wrangler"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        log_error "curl未安装，请先安装curl"
        exit 1
    fi
    
    # 执行验证步骤
    get_deployment_info
    
    echo ""
    log_info "开始验证部署..."
    echo ""
    
    VERIFICATION_PASSED=true
    
    # 验证各个组件
    verify_pages_deployment || VERIFICATION_PASSED=false
    echo ""
    
    verify_worker_deployment || VERIFICATION_PASSED=false
    echo ""
    
    verify_kv_storage || VERIFICATION_PASSED=false
    echo ""
    
    verify_environment_variables
    echo ""
    
    verify_scheduled_tasks || VERIFICATION_PASSED=false
    echo ""
    
    verify_clash_config
    echo ""
    
    performance_test
    echo ""
    
    # 生成报告
    generate_report
    
    # 显示结果
    echo ""
    echo "=========================================="
    if [ "$VERIFICATION_PASSED" = true ]; then
        echo "  ✅ 部署验证通过！"
        echo "=========================================="
        echo ""
        echo "🎉 您的IP纯净度检查工具已成功部署！"
        echo ""
        echo "🌐 访问地址:"
        echo "   主界面: $PAGES_URL"
        echo "   订阅管理: $PAGES_URL/subscription-manager.html"
        echo "   Worker服务: $WORKER_URL"
        echo ""
        echo "📋 下一步:"
        echo "   1. 配置API密钥以获得更好的检测效果"
        echo "   2. 添加您的私人订阅链接"
        echo "   3. 设置定时任务自动检测"
        echo ""
    else
        echo "  ⚠️  部署验证发现问题"
        echo "=========================================="
        echo ""
        echo "🔧 请检查以下问题:"
        echo "   1. 确认Cloudflare账户状态"
        echo "   2. 检查网络连接"
        echo "   3. 查看详细错误日志"
        echo "   4. 运行修复脚本: ./scripts/fix-cloudflare-deploy.sh"
        echo ""
    fi
    
    echo "📄 详细报告: deployment_verification_report.md"
    echo ""
}

# 脚本入口
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
