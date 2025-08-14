#!/bin/bash

# Cloudflare部署问题快速修复脚本
# 解决免费计划CPU限制和配置格式问题

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

# 修复wrangler.toml配置
fix_wrangler_config() {
    log_info "修复wrangler.toml配置..."
    
    # 备份原配置
    if [ -f "wrangler.toml" ]; then
        cp wrangler.toml wrangler.toml.backup
        log_info "已备份原配置到wrangler.toml.backup"
    fi
    
    # 创建免费计划兼容的配置
    cat > wrangler.toml << 'EOF'
name = "ip-purity-checker"
main = "cloudflare/scheduled-worker.js"
compatibility_date = "2024-01-01"

# 环境变量
[vars]
ENVIRONMENT = "production"

# KV存储绑定
[[kv_namespaces]]
binding = "IP_CACHE"
id = "e0f261583d9c4eb59802ed2f4374a1e8"
preview_id = ""

# 定时任务配置 - 北京时间00:00 (UTC 16:00)
[triggers]
crons = ["0 16 * * *"]
EOF
    
    log_success "wrangler.toml配置已修复"
}

# 检查KV命名空间
check_kv_namespace() {
    log_info "检查KV命名空间..."
    
    # 列出现有的KV命名空间
    KV_LIST=$(wrangler kv:namespace list 2>/dev/null || echo "")
    
    if echo "$KV_LIST" | grep -q "IP_CACHE"; then
        log_success "找到现有的IP_CACHE命名空间"
        
        # 提取KV命名空间ID
        KV_ID=$(echo "$KV_LIST" | grep "IP_CACHE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | head -1)
        
        if [ -n "$KV_ID" ]; then
            log_info "KV命名空间ID: $KV_ID"
            
            # 更新wrangler.toml中的ID
            sed -i.bak "s/id = \"[^\"]*\"/id = \"$KV_ID\"/" wrangler.toml
            log_success "已更新wrangler.toml中的KV命名空间ID"
        fi
    else
        log_warning "未找到IP_CACHE命名空间，尝试创建..."
        
        # 创建新的KV命名空间
        CREATE_OUTPUT=$(wrangler kv:namespace create "IP_CACHE" 2>/dev/null || echo "")
        
        if echo "$CREATE_OUTPUT" | grep -q "id ="; then
            NEW_KV_ID=$(echo "$CREATE_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
            log_success "创建新的KV命名空间: $NEW_KV_ID"
            
            # 更新配置
            sed -i.bak "s/id = \"[^\"]*\"/id = \"$NEW_KV_ID\"/" wrangler.toml
        else
            log_error "创建KV命名空间失败"
            return 1
        fi
    fi
}

# 验证Worker代码
verify_worker_code() {
    log_info "验证Worker代码..."
    
    if [ ! -f "cloudflare/scheduled-worker.js" ]; then
        log_error "Worker代码文件不存在: cloudflare/scheduled-worker.js"
        return 1
    fi
    
    # 检查代码语法
    if node -c cloudflare/scheduled-worker.js 2>/dev/null; then
        log_success "Worker代码语法检查通过"
    else
        log_warning "Worker代码语法检查失败，但可能仍可部署"
    fi
}

# 尝试部署
attempt_deploy() {
    log_info "尝试部署Worker..."
    
    # 首次部署尝试
    if wrangler deploy; then
        log_success "Worker部署成功！"
        return 0
    else
        log_warning "部署失败，可能是免费计划限制"
        
        # 检查是否是CPU限制问题
        log_info "移除可能的CPU限制配置..."
        
        # 确保配置中没有limits部分
        if grep -q "\[limits\]" wrangler.toml; then
            sed -i.bak '/\[limits\]/,/^$/d' wrangler.toml
            log_info "已移除limits配置"
        fi
        
        # 再次尝试部署
        if wrangler deploy; then
            log_success "修复后部署成功！"
            return 0
        else
            log_error "部署仍然失败"
            return 1
        fi
    fi
}

# 测试部署结果
test_deployment() {
    log_info "测试部署结果..."
    
    # 获取Worker URL
    WORKER_URL="https://ip-purity-checker.$(wrangler whoami | grep 'Account ID' | awk '{print $3}').workers.dev"
    
    log_info "Worker URL: $WORKER_URL"
    
    # 测试状态API
    if curl -s --max-time 10 "$WORKER_URL/api/status" > /dev/null; then
        log_success "Worker状态API测试通过"
    else
        log_warning "Worker状态API测试失败，但Worker可能仍在启动中"
    fi
    
    # 测试首页
    if curl -s --max-time 10 "$WORKER_URL" > /dev/null; then
        log_success "Worker首页访问正常"
    else
        log_warning "Worker首页访问失败"
    fi
}

# 显示部署信息
show_deployment_info() {
    echo ""
    echo "=========================================="
    echo "  🎉 部署修复完成！"
    echo "=========================================="
    echo ""
    
    ACCOUNT_ID=$(wrangler whoami | grep 'Account ID' | awk '{print $3}' || echo "YOUR_ACCOUNT")
    WORKER_URL="https://ip-purity-checker.${ACCOUNT_ID}.workers.dev"
    
    echo "🔧 修复的问题："
    echo "   ✅ 移除了免费计划不支持的CPU限制"
    echo "   ✅ 修复了wrangler.toml配置格式"
    echo "   ✅ 确保了KV命名空间正确配置"
    echo ""
    echo "⏰ 定时任务服务："
    echo "   🌐 访问地址: $WORKER_URL"
    echo "   📊 状态查询: $WORKER_URL/api/status"
    echo "   🔄 手动触发: $WORKER_URL/api/manual-check"
    echo ""
    echo "📅 定时任务配置："
    echo "   ⏰ 执行时间: 每日UTC 16:00 (北京时间00:00)"
    echo "   📦 数据存储: Cloudflare KV (保留7天)"
    echo "   🔍 检测范围: 所有配置的订阅链接"
    echo ""
    echo "🔑 环境变量配置："
    echo "   wrangler secret put PROXYCHECK_API_KEY"
    echo "   wrangler secret put IPINFO_TOKEN"
    echo ""
}

# 主函数
main() {
    echo "=========================================="
    echo "  🔧 Cloudflare部署问题修复工具"
    echo "=========================================="
    echo ""
    
    # 检查Wrangler CLI
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI未安装，请先安装："
        echo "npm install -g wrangler"
        exit 1
    fi
    
    # 检查登录状态
    if ! wrangler whoami &> /dev/null; then
        log_error "请先登录Cloudflare："
        echo "wrangler login"
        exit 1
    fi
    
    # 执行修复步骤
    fix_wrangler_config
    check_kv_namespace
    verify_worker_code
    
    # 尝试部署
    if attempt_deploy; then
        test_deployment
        show_deployment_info
    else
        echo ""
        echo "=========================================="
        echo "  ❌ 部署修复失败"
        echo "=========================================="
        echo ""
        echo "可能的原因："
        echo "1. 网络连接问题"
        echo "2. Cloudflare账户权限不足"
        echo "3. 配置文件仍有问题"
        echo ""
        echo "建议操作："
        echo "1. 检查网络连接"
        echo "2. 确认Cloudflare账户状态"
        echo "3. 查看详细错误日志"
        echo "4. 联系技术支持"
        echo ""
        exit 1
    fi
}

# 脚本入口
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
