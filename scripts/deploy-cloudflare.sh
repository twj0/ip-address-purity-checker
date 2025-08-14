#!/bin/bash

# Cloudflare Pages 一键部署脚本
# 自动创建KV命名空间、配置环境变量、部署Pages和Workers

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

# 检查必需的工具
check_requirements() {
    log_info "检查部署环境..."
    
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI 未安装"
        log_info "安装方法: npm install -g wrangler"
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        log_error "Git 未安装"
        exit 1
    fi
    
    log_success "环境检查通过"
}

# 登录Cloudflare
login_cloudflare() {
    log_info "检查Cloudflare登录状态..."
    
    if ! wrangler whoami &> /dev/null; then
        log_info "请登录Cloudflare账户..."
        wrangler login
    fi
    
    # 获取账户信息
    ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | awk '{print $3}' || echo "")
    if [ -z "$ACCOUNT_ID" ]; then
        log_warning "无法获取账户ID，请手动设置"
        read -p "请输入您的Cloudflare账户ID: " ACCOUNT_ID
    fi
    
    log_success "已登录Cloudflare，账户ID: $ACCOUNT_ID"
}

# 创建KV命名空间
create_kv_namespaces() {
    log_info "创建KV命名空间..."
    
    # 创建生产环境KV命名空间
    PROD_KV_ID=$(wrangler kv:namespace create "IP_CACHE" --preview false 2>/dev/null | grep -o 'id = "[^"]*"' | cut -d'"' -f2 || echo "")
    
    if [ -z "$PROD_KV_ID" ]; then
        log_warning "生产环境KV命名空间创建失败，尝试查找现有的..."
        # 尝试列出现有的KV命名空间
        EXISTING_KV=$(wrangler kv:namespace list 2>/dev/null | grep "IP_CACHE" || echo "")
        if [ -n "$EXISTING_KV" ]; then
            PROD_KV_ID=$(echo "$EXISTING_KV" | grep -o '"id":"[^"]*"' | cut -d'"' -f4 | head -1)
            log_info "找到现有KV命名空间: $PROD_KV_ID"
        fi
    fi
    
    # 创建预览环境KV命名空间
    PREVIEW_KV_ID=$(wrangler kv:namespace create "IP_CACHE" --preview true 2>/dev/null | grep -o 'id = "[^"]*"' | cut -d'"' -f2 || echo "")
    
    if [ -n "$PROD_KV_ID" ]; then
        log_success "生产环境KV命名空间ID: $PROD_KV_ID"
        
        # 更新wrangler.toml
        sed -i.bak "s/id = \"\"/id = \"$PROD_KV_ID\"/" wrangler.toml
        
        if [ -n "$PREVIEW_KV_ID" ]; then
            log_success "预览环境KV命名空间ID: $PREVIEW_KV_ID"
            sed -i.bak "s/preview_id = \"\"/preview_id = \"$PREVIEW_KV_ID\"/" wrangler.toml
        fi
        
        # 删除备份文件
        rm -f wrangler.toml.bak
    else
        log_error "无法创建KV命名空间，请手动创建"
        exit 1
    fi
}

# 设置环境变量
setup_environment_variables() {
    log_info "配置环境变量..."
    
    # ProxyCheck.io API密钥
    if [ -z "$PROXYCHECK_API_KEY" ]; then
        log_warning "未设置PROXYCHECK_API_KEY环境变量"
        read -p "请输入ProxyCheck.io API密钥（可选，直接回车跳过）: " PROXYCHECK_API_KEY
    fi
    
    if [ -n "$PROXYCHECK_API_KEY" ]; then
        echo "$PROXYCHECK_API_KEY" | wrangler secret put PROXYCHECK_API_KEY
        log_success "已设置ProxyCheck.io API密钥"
    fi
    
    # IPinfo.io Token
    if [ -z "$IPINFO_TOKEN" ]; then
        log_warning "未设置IPINFO_TOKEN环境变量"
        read -p "请输入IPinfo.io Token（可选，直接回车跳过）: " IPINFO_TOKEN
    fi
    
    if [ -n "$IPINFO_TOKEN" ]; then
        echo "$IPINFO_TOKEN" | wrangler secret put IPINFO_TOKEN
        log_success "已设置IPinfo.io Token"
    fi
    
    # 自定义订阅链接
    if [ -z "$SUBSCRIPTION_URLS" ]; then
        log_info "使用默认订阅链接，如需自定义请设置SUBSCRIPTION_URLS环境变量"
    else
        echo "$SUBSCRIPTION_URLS" | wrangler secret put SUBSCRIPTION_URLS
        log_success "已设置自定义订阅链接"
    fi
}

# 部署Cloudflare Pages
deploy_pages() {
    log_info "部署Cloudflare Pages..."
    
    # 确保public目录存在
    if [ ! -d "public" ]; then
        log_error "public目录不存在，请确保项目结构正确"
        exit 1
    fi
    
    # 部署Pages
    wrangler pages deploy public --project-name ip-purity-checker --compatibility-date 2024-01-01
    
    if [ $? -eq 0 ]; then
        log_success "Cloudflare Pages部署成功！"
        
        # 获取Pages URL
        PAGES_URL=$(wrangler pages deployment list --project-name ip-purity-checker --compatibility-date 2024-01-01 2>/dev/null | head -2 | tail -1 | awk '{print $4}' || echo "")
        
        if [ -n "$PAGES_URL" ]; then
            log_success "Pages访问地址: $PAGES_URL"
        fi
    else
        log_error "Cloudflare Pages部署失败"
        return 1
    fi
}

# 部署Cloudflare Workers（定时任务）
deploy_workers() {
    log_info "部署Cloudflare Workers（定时任务）..."
    
    # 部署Worker
    wrangler deploy
    
    if [ $? -eq 0 ]; then
        log_success "Cloudflare Workers部署成功！"
        
        # 获取Worker URL
        WORKER_URL="https://ip-purity-checker.${ACCOUNT_ID}.workers.dev"
        log_success "Worker访问地址: $WORKER_URL"
        
        return 0
    else
        log_error "Cloudflare Workers部署失败"
        return 1
    fi
}

# 验证部署
verify_deployment() {
    log_info "验证部署结果..."
    
    # 测试Pages
    if [ -n "$PAGES_URL" ]; then
        log_info "测试Pages访问..."
        if curl -s --max-time 10 "$PAGES_URL" > /dev/null; then
            log_success "Pages访问正常"
        else
            log_warning "Pages访问可能有问题"
        fi
    fi
    
    # 测试Worker
    if [ -n "$WORKER_URL" ]; then
        log_info "测试Worker访问..."
        if curl -s --max-time 10 "$WORKER_URL/api/status" > /dev/null; then
            log_success "Worker访问正常"
        else
            log_warning "Worker访问可能有问题"
        fi
    fi
    
    log_success "部署验证完成！"
}

# 显示部署信息
show_deployment_info() {
    echo ""
    echo "=========================================="
    echo "  🎉 部署完成！"
    echo "=========================================="
    echo ""
    echo "📱 Web界面（Cloudflare Pages）:"
    echo "   $PAGES_URL"
    echo ""
    echo "⏰ 定时任务服务（Cloudflare Workers）:"
    echo "   $WORKER_URL"
    echo ""
    echo "🔧 功能说明:"
    echo "   • Web界面：IP检测、批量检测、订阅检测"
    echo "   • 定时任务：每日UTC 16:00自动执行完整检测"
    echo "   • 数据存储：结果保存到KV存储，保留7天"
    echo ""
    echo "🔑 API密钥配置:"
    if [ -n "$PROXYCHECK_API_KEY" ]; then
        echo "   ✅ ProxyCheck.io API密钥已配置"
    else
        echo "   ⚠️  ProxyCheck.io API密钥未配置（建议配置以提升检测精度）"
    fi
    
    if [ -n "$IPINFO_TOKEN" ]; then
        echo "   ✅ IPinfo.io Token已配置"
    else
        echo "   ⚠️  IPinfo.io Token未配置（作为备用数据源）"
    fi
    echo ""
    echo "📚 使用指南:"
    echo "   • 访问Web界面进行IP检测"
    echo "   • 在界面中输入API密钥以获得更好的检测效果"
    echo "   • 定时任务会自动运行，无需手动干预"
    echo "   • 查看Worker状态：$WORKER_URL/api/status"
    echo ""
    echo "🔄 后续更新:"
    echo "   • 运行 'wrangler deploy' 更新Worker"
    echo "   • 运行 'wrangler pages deploy public --project-name ip-purity-checker' 更新Pages"
    echo ""
}

# 主函数
main() {
    echo "=========================================="
    echo "  🚀 Cloudflare Pages 一键部署"
    echo "  IP地址纯净度检查工具"
    echo "=========================================="
    echo ""
    
    # 执行部署步骤
    check_requirements
    login_cloudflare
    create_kv_namespaces
    setup_environment_variables
    
    # 部署服务
    if deploy_pages; then
        PAGES_DEPLOYED=true
    fi
    
    if deploy_workers; then
        WORKERS_DEPLOYED=true
    fi
    
    # 验证和显示结果
    if [ "$PAGES_DEPLOYED" = true ] || [ "$WORKERS_DEPLOYED" = true ]; then
        verify_deployment
        show_deployment_info
    else
        log_error "部署失败，请检查错误信息"
        exit 1
    fi
}

# 脚本入口
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
