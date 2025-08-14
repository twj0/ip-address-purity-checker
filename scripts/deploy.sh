#!/bin/bash

# IP地址纯净度检查工具 - 自动部署脚本
# 支持 Vercel 和 Cloudflare Workers 部署

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
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

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 命令未找到，请先安装"
        return 1
    fi
    return 0
}

# 检查环境变量
check_env_var() {
    if [ -z "${!1}" ]; then
        log_warning "环境变量 $1 未设置"
        return 1
    fi
    return 0
}

# Vercel 部署函数
deploy_vercel() {
    log_info "开始 Vercel 部署..."
    
    # 检查 Vercel CLI
    if ! check_command "vercel"; then
        log_error "请先安装 Vercel CLI: npm install -g vercel"
        return 1
    fi
    
    # 检查配置文件
    if [ ! -f "vercel.json" ]; then
        log_error "vercel.json 配置文件不存在"
        return 1
    fi
    
    if [ ! -f "api/requirements.txt" ]; then
        log_error "api/requirements.txt 文件不存在"
        return 1
    fi
    
    # 检查 IPinfo token
    if [ -z "$IPINFO_TOKEN" ]; then
        log_warning "IPINFO_TOKEN 环境变量未设置"
        read -p "请输入你的 IPinfo.io token (或按回车跳过): " token
        if [ ! -z "$token" ]; then
            export IPINFO_TOKEN="$token"
        fi
    fi
    
    # 部署到 Vercel
    log_info "执行 Vercel 部署..."
    
    if [ "$1" = "prod" ]; then
        vercel --prod
    else
        vercel
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Vercel 部署成功！"
        
        # 设置环境变量
        if [ ! -z "$IPINFO_TOKEN" ]; then
            log_info "设置环境变量..."
            echo "$IPINFO_TOKEN" | vercel env add IPINFO_TOKEN production
        fi
        
        return 0
    else
        log_error "Vercel 部署失败"
        return 1
    fi
}

# Cloudflare Workers 部署函数
deploy_cloudflare() {
    log_info "开始 Cloudflare Workers 部署..."
    
    # 检查 Wrangler CLI
    if ! check_command "wrangler"; then
        log_error "请先安装 Wrangler CLI: npm install -g wrangler"
        return 1
    fi
    
    # 检查配置文件
    if [ ! -f "wrangler.toml" ]; then
        log_error "wrangler.toml 配置文件不存在"
        return 1
    fi
    
    if [ ! -f "cloudflare/worker.js" ]; then
        log_error "cloudflare/worker.js 文件不存在"
        return 1
    fi
    
    # 检查登录状态
    if ! wrangler whoami &> /dev/null; then
        log_info "请先登录 Cloudflare..."
        wrangler login
    fi
    
    # 创建 KV 命名空间（如果需要）
    if grep -q "your-kv-namespace-id" wrangler.toml; then
        log_info "创建 KV 命名空间..."
        
        # 生产环境 KV
        kv_id=$(wrangler kv:namespace create "IP_CACHE" | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
        if [ ! -z "$kv_id" ]; then
            sed -i "s/your-kv-namespace-id/$kv_id/g" wrangler.toml
            log_success "生产环境 KV 命名空间创建成功: $kv_id"
        fi
        
        # 预览环境 KV
        preview_id=$(wrangler kv:namespace create "IP_CACHE" --preview | grep -o 'preview_id = "[^"]*"' | cut -d'"' -f2)
        if [ ! -z "$preview_id" ]; then
            sed -i "s/your-preview-kv-namespace-id/$preview_id/g" wrangler.toml
            log_success "预览环境 KV 命名空间创建成功: $preview_id"
        fi
    fi
    
    # 设置环境变量
    if [ ! -z "$IPINFO_TOKEN" ]; then
        log_info "设置 IPinfo token..."
        echo "$IPINFO_TOKEN" | wrangler secret put IPINFO_TOKEN
    else
        log_warning "IPINFO_TOKEN 未设置，请手动设置: wrangler secret put IPINFO_TOKEN"
    fi
    
    # 部署 Worker
    log_info "执行 Cloudflare Workers 部署..."
    wrangler deploy
    
    if [ $? -eq 0 ]; then
        log_success "Cloudflare Workers 部署成功！"
        return 0
    else
        log_error "Cloudflare Workers 部署失败"
        return 1
    fi
}

# 测试部署函数
test_deployment() {
    local url="$1"
    log_info "测试部署: $url"
    
    # 测试基本连接
    if curl -s --max-time 10 "$url" > /dev/null; then
        log_success "基本连接测试通过"
    else
        log_error "基本连接测试失败"
        return 1
    fi
    
    # 测试 API 端点
    local api_url="$url/api/check-ip?ip=8.8.8.8"
    log_info "测试 API: $api_url"
    
    local response=$(curl -s --max-time 15 "$api_url")
    if echo "$response" | grep -q '"ip"'; then
        log_success "API 测试通过"
        echo "响应示例: $response"
    else
        log_error "API 测试失败"
        echo "响应: $response"
        return 1
    fi
}

# 主函数
main() {
    echo "=========================================="
    echo "  IP地址纯净度检查工具 - 部署脚本"
    echo "=========================================="
    
    # 检查当前目录
    if [ ! -f "README.md" ] || [ ! -d "api" ]; then
        log_error "请在项目根目录执行此脚本"
        exit 1
    fi
    
    # 解析参数
    platform="$1"
    environment="$2"
    
    if [ -z "$platform" ]; then
        echo "请选择部署平台:"
        echo "1) Vercel (推荐)"
        echo "2) Cloudflare Workers"
        read -p "请输入选择 (1-2): " choice
        
        case $choice in
            1) platform="vercel" ;;
            2) platform="cloudflare" ;;
            *) log_error "无效选择"; exit 1 ;;
        esac
    fi
    
    # 执行部署
    case $platform in
        "vercel")
            deploy_vercel "$environment"
            ;;
        "cloudflare")
            deploy_cloudflare
            ;;
        *)
            log_error "不支持的平台: $platform"
            echo "支持的平台: vercel, cloudflare"
            exit 1
            ;;
    esac
    
    # 询问是否测试
    if [ $? -eq 0 ]; then
        read -p "是否测试部署结果? (y/N): " test_choice
        if [ "$test_choice" = "y" ] || [ "$test_choice" = "Y" ]; then
            read -p "请输入部署后的URL: " deploy_url
            if [ ! -z "$deploy_url" ]; then
                test_deployment "$deploy_url"
            fi
        fi
    fi
}

# 脚本入口
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
