#!/bin/bash

# Cloudflare Workers 专用部署脚本
# 包含完整的定时任务、Clash配置生成和GitHub集成功能

set -e

echo "🚀 Cloudflare Workers 专用部署脚本"
echo "=================================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查环境
check_environment() {
    print_status "检查部署环境..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js 未安装，请先安装 Node.js"
        exit 1
    fi
    
    if ! command -v wrangler &> /dev/null; then
        print_status "安装 Wrangler CLI..."
        npm install -g wrangler
    fi
    
    if [ ! -f "wrangler.toml" ]; then
        print_error "请在项目根目录运行此脚本"
        exit 1
    fi
    
    print_success "环境检查完成"
}

# 登录Cloudflare
login_cloudflare() {
    print_status "检查Cloudflare登录状态..."
    
    if ! wrangler whoami &> /dev/null; then
        print_status "需要登录Cloudflare账户"
        wrangler auth login
    else
        print_success "已登录Cloudflare账户"
    fi
}

# 配置KV存储
setup_kv_storage() {
    print_status "配置KV存储..."
    
    # 检查是否已配置
    if grep -q "id.*=" wrangler.toml; then
        print_success "KV存储已配置"
        return
    fi
    
    print_status "创建KV命名空间..."
    KV_OUTPUT=$(wrangler kv:namespace create "IP_CACHE")
    KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
    
    if [ -z "$KV_ID" ]; then
        print_error "创建KV存储失败"
        exit 1
    fi
    
    print_success "KV存储创建成功，ID: $KV_ID"
    
    # 更新配置
    sed -i.bak "s/# id = \"your-kv-namespace-id\"/id = \"$KV_ID\"/" wrangler.toml
    sed -i.bak "s/# \[\[kv_namespaces\]\]/[[kv_namespaces]]/" wrangler.toml
    sed -i.bak "s/# binding = \"IP_CACHE\"/binding = \"IP_CACHE\"/" wrangler.toml
    
    print_success "KV配置已更新"
}

# 配置GitHub集成
setup_github_integration() {
    print_status "配置GitHub集成..."
    
    echo "GitHub集成功能说明："
    echo "- 自动将生成的Clash配置提交到GitHub仓库"
    echo "- 提供公开的配置文件访问URL"
    echo "- 保留历史版本和更新日志"
    echo ""
    
    read -p "是否配置GitHub集成？(y/N): " setup_github
    
    if [[ $setup_github =~ ^[Yy]$ ]]; then
        echo ""
        echo "GitHub Token配置步骤："
        echo "1. 访问 https://github.com/settings/tokens"
        echo "2. 点击 'Generate new token (classic)'"
        echo "3. 权限选择: repo (完整仓库权限)"
        echo "4. 复制生成的Token"
        echo ""
        
        read -p "请输入GitHub Token: " -s github_token
        echo ""
        
        if [ -n "$github_token" ]; then
            echo "$github_token" | wrangler secret put GITHUB_TOKEN
            print_success "GitHub Token设置成功"
            
            read -p "GitHub仓库名 (格式: username/repo, 默认: twj0/clash-config): " github_repo
            github_repo=${github_repo:-"twj0/clash-config"}
            
            sed -i.bak "s/GITHUB_REPO = \".*\"/GITHUB_REPO = \"$github_repo\"/" wrangler.toml
            print_success "GitHub仓库配置: $github_repo"
        fi
    else
        print_warning "跳过GitHub集成配置"
    fi
}

# 部署Worker
deploy_worker() {
    print_status "部署Cloudflare Worker..."
    
    if wrangler deploy; then
        print_success "Worker部署成功"
        
        # 获取部署信息
        WORKER_NAME=$(grep "name" wrangler.toml | head -1 | cut -d'"' -f2)
        ACCOUNT_ID=$(wrangler whoami 2>/dev/null | grep "Account ID" | awk '{print $3}' || echo "")
        
        if [ -n "$WORKER_NAME" ]; then
            WORKER_URL="https://$WORKER_NAME.workers.dev"
            print_success "Worker URL: $WORKER_URL"
        fi
    else
        print_error "Worker部署失败"
        exit 1
    fi
}

# 测试部署
test_deployment() {
    print_status "测试部署结果..."
    
    WORKER_NAME=$(grep "name" wrangler.toml | head -1 | cut -d'"' -f2)
    WORKER_URL="https://$WORKER_NAME.workers.dev"
    
    # 测试主页面
    if curl -s -f "$WORKER_URL" > /dev/null; then
        print_success "主页面访问正常"
    else
        print_warning "主页面访问可能有问题"
    fi
    
    # 测试API
    if curl -s -f "$WORKER_URL/api/status" > /dev/null; then
        print_success "API接口正常"
    else
        print_warning "API接口可能有问题"
    fi
    
    # 运行详细测试
    if [ -f "scripts/test-complete-system.js" ]; then
        print_status "运行完整功能测试..."
        if command -v node &> /dev/null; then
            node scripts/test-complete-system.js
        fi
    fi
}

# 显示使用指南
show_usage_guide() {
    WORKER_NAME=$(grep "name" wrangler.toml | head -1 | cut -d'"' -f2)
    WORKER_URL="https://$WORKER_NAME.workers.dev"
    
    echo ""
    echo "🎉 部署完成！"
    echo "=================================================="
    echo ""
    echo "📋 接下来的步骤："
    echo "1. 访问Web界面: $WORKER_URL"
    echo "2. 在'设置'页面添加API密钥："
    echo "   - ProxyCheck.io (免费1000次/天): https://proxycheck.io/api/"
    echo "   - IPinfo.io (免费50000次/月): https://ipinfo.io/signup"
    echo "3. 在'订阅管理'页面添加您的订阅链接"
    echo "4. 系统将每日自动执行IP纯净度检查"
    echo ""
    echo "🔗 重要链接："
    echo "- Web管理界面: $WORKER_URL"
    echo "- Clash配置下载: $WORKER_URL/api/clash-config"
    echo "- 手动触发检查: $WORKER_URL/api/manual-check (POST)"
    echo "- 任务统计查看: $WORKER_URL/api/task-stats"
    echo ""
    echo "⏰ 定时任务："
    echo "- 执行时间: 每日北京时间00:00 (UTC 16:00)"
    echo "- 修改时间: 编辑 wrangler.toml 中的 crons 配置"
    echo ""
    echo "📊 功能特性："
    echo "✅ 定时任务 - 每日自动检查所有订阅节点"
    echo "✅ 智能筛选 - 基于纯净度评分筛选最优IP"
    echo "✅ Clash配置 - 自动生成优化的YAML配置文件"
    echo "✅ GitHub集成 - 自动提交更新到仓库 (如已配置)"
    echo "✅ 多API轮换 - 避免单个API密钥限制"
    echo "✅ 订阅解析 - 支持Clash、V2Ray、SS等多种格式"
    echo "✅ Web管理 - 完整的订阅和API密钥管理界面"
    echo ""
    echo "🔧 维护命令："
    echo "- 查看日志: wrangler tail"
    echo "- 重新部署: wrangler deploy"
    echo "- 更新密钥: wrangler secret put GITHUB_TOKEN"
    echo "- 测试功能: node scripts/test-complete-system.js"
    echo ""
    echo "📞 故障排除："
    echo "如遇问题请检查："
    echo "1. KV存储是否正确配置"
    echo "2. API密钥是否有效"
    echo "3. 订阅链接是否可访问"
    echo "4. GitHub Token权限是否足够"
}

# 主函数
main() {
    echo "开始部署IP纯净度检查工具到Cloudflare Workers..."
    echo ""
    
    check_environment
    login_cloudflare
    setup_kv_storage
    setup_github_integration
    deploy_worker
    test_deployment
    show_usage_guide
    
    print_success "部署流程完成！"
}

# 运行主函数
main "$@"
