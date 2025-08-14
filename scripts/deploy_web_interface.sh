#!/bin/bash

# IP地址纯净度检查工具 - Web界面部署脚本
# 支持一键部署到 Vercel、Cloudflare Workers/Pages

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

# 检查项目结构
check_project_structure() {
    log_info "检查项目结构..."
    
    required_files=(
        "public/index.html"
        "api/check-ip.py"
        "api/check-subscription.py"
        "api/requirements.txt"
        "vercel.json"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "缺少必需文件: $file"
            return 1
        fi
    done
    
    log_success "项目结构检查通过"
    return 0
}

# 部署到Vercel
deploy_to_vercel() {
    log_info "开始部署到 Vercel..."
    
    # 检查Vercel CLI
    if ! command -v vercel &> /dev/null; then
        log_error "Vercel CLI 未安装，正在安装..."
        npm install -g vercel
    fi
    
    # 检查登录状态
    if ! vercel whoami &> /dev/null; then
        log_info "请登录 Vercel..."
        vercel login
    fi
    
    # 设置环境变量
    if [ ! -z "$IPINFO_TOKEN" ]; then
        log_info "设置 IPinfo.io token..."
        echo "$IPINFO_TOKEN" | vercel env add IPINFO_TOKEN production
        echo "$IPINFO_TOKEN" | vercel env add IPINFO_TOKEN development
    else
        log_warning "未设置 IPINFO_TOKEN 环境变量"
        read -p "请输入 IPinfo.io token (可选): " token
        if [ ! -z "$token" ]; then
            echo "$token" | vercel env add IPINFO_TOKEN production
            echo "$token" | vercel env add IPINFO_TOKEN development
        fi
    fi
    
    # 部署
    log_info "执行部署..."
    if [ "$1" = "prod" ]; then
        vercel --prod
    else
        vercel
    fi
    
    if [ $? -eq 0 ]; then
        log_success "Vercel 部署成功！"
        log_info "Web界面功能："
        echo "  ✅ 单IP检测"
        echo "  ✅ 批量IP检测"
        echo "  ✅ 订阅链接检测"
        echo "  ✅ Clash配置生成"
        echo "  ✅ CSV报告下载"
        return 0
    else
        log_error "Vercel 部署失败"
        return 1
    fi
}

# 部署到Cloudflare Pages
deploy_to_cloudflare_pages() {
    log_info "开始部署到 Cloudflare Pages..."
    
    # 检查Wrangler CLI
    if ! command -v wrangler &> /dev/null; then
        log_error "Wrangler CLI 未安装，正在安装..."
        npm install -g wrangler
    fi
    
    # 检查登录状态
    if ! wrangler whoami &> /dev/null; then
        log_info "请登录 Cloudflare..."
        wrangler login
    fi
    
    # 创建Pages项目
    log_info "创建 Cloudflare Pages 项目..."
    
    # 创建_worker.js文件用于Pages Functions
    cat > public/_worker.js << 'EOF'
// Cloudflare Pages Functions
// 处理API请求

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 处理API路由
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env);
    }
    
    // 静态文件由Pages自动处理
    return new Response('Not Found', { status: 404 });
  }
};

async function handleAPI(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // CORS处理
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-IPInfo-Token'
      }
    });
  }
  
  try {
    switch (path) {
      case '/api/check-ip':
        return handleIPCheck(request, env);
      case '/api/check-subscription':
        return handleSubscriptionCheck(request, env);
      default:
        return new Response('API Not Found', { status: 404 });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleIPCheck(request, env) {
  const url = new URL(request.url);
  const ip = url.searchParams.get('ip');
  
  if (!ip) {
    return new Response(JSON.stringify({ error: 'IP parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 获取token
  const token = request.headers.get('X-IPInfo-Token') || env.IPINFO_TOKEN;
  
  // 调用IPinfo API
  const ipInfo = await fetchIPInfo(ip, token);
  if (!ipInfo) {
    return new Response(JSON.stringify({ error: 'Failed to fetch IP info' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const isPure = determineIPPurity(ipInfo);
  
  const result = {
    ip,
    country: ipInfo.country,
    city: ipInfo.city,
    org: ipInfo.org,
    isPure,
    privacy: ipInfo.privacy || {},
    timestamp: new Date().toISOString()
  };
  
  return new Response(JSON.stringify(result), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function fetchIPInfo(ip, token) {
  try {
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const response = await fetch(`https://ipinfo.io/${ip}/json`, { headers });
    
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error('IPinfo API error:', error);
    return null;
  }
}

function determineIPPurity(ipInfo) {
  // 检查privacy信息
  if (ipInfo.privacy) {
    const { hosting, vpn, proxy, tor } = ipInfo.privacy;
    return !(hosting || vpn || proxy || tor);
  }
  
  // 关键词检测
  const text = [ipInfo.isp, ipInfo.org, ipInfo.as].join(' ').toLowerCase();
  const blackKeywords = [
    'amazon', 'aws', 'google', 'gcp', 'microsoft', 'azure',
    'cloudflare', 'akamai', 'fastly', 'digitalocean', 'vultr',
    'linode', 'hetzner', 'ovh', 'datacenter', 'hosting'
  ];
  
  return !blackKeywords.some(keyword => text.includes(keyword));
}

async function handleSubscriptionCheck(request, env) {
  // 简化的订阅检测实现
  return new Response(JSON.stringify({ 
    error: 'Subscription check not implemented in Pages version' 
  }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' }
  });
}
EOF
    
    # 部署到Pages
    log_info "部署到 Cloudflare Pages..."
    wrangler pages deploy public --project-name ip-purity-checker
    
    if [ $? -eq 0 ]; then
        log_success "Cloudflare Pages 部署成功！"
        log_warning "注意：Pages版本功能有限，推荐使用Vercel获得完整功能"
        return 0
    else
        log_error "Cloudflare Pages 部署失败"
        return 1
    fi
}

# 测试部署
test_deployment() {
    local url="$1"
    log_info "测试部署: $url"
    
    # 测试首页
    if curl -s --max-time 10 "$url" > /dev/null; then
        log_success "首页访问正常"
    else
        log_error "首页访问失败"
        return 1
    fi
    
    # 测试API
    local api_response=$(curl -s --max-time 15 "$url/api/check-ip?ip=8.8.8.8")
    if echo "$api_response" | grep -q '"ip"'; then
        log_success "API测试通过"
    else
        log_error "API测试失败"
        return 1
    fi
    
    log_success "部署测试完成！"
    echo ""
    echo "🎉 Web界面功能已就绪："
    echo "   📱 响应式设计，支持移动设备"
    echo "   🔍 单IP检测功能"
    echo "   📋 批量IP检测功能"
    echo "   📡 订阅链接检测功能"
    echo "   ⚙️  Clash配置生成"
    echo "   📊 CSV报告下载"
    echo "   🔑 自定义IPinfo.io token支持"
    echo ""
    echo "访问地址: $url"
}

# 主函数
main() {
    echo "=========================================="
    echo "  IP纯净度检查工具 - Web界面部署"
    echo "=========================================="
    
    # 检查项目结构
    if ! check_project_structure; then
        exit 1
    fi
    
    # 选择部署平台
    platform="$1"
    if [ -z "$platform" ]; then
        echo "请选择部署平台:"
        echo "1) Vercel (推荐 - 完整功能)"
        echo "2) Cloudflare Pages (基础功能)"
        read -p "请输入选择 (1-2): " choice
        
        case $choice in
            1) platform="vercel" ;;
            2) platform="cloudflare-pages" ;;
            *) log_error "无效选择"; exit 1 ;;
        esac
    fi
    
    # 执行部署
    case $platform in
        "vercel")
            deploy_to_vercel "$2"
            ;;
        "cloudflare-pages")
            deploy_to_cloudflare_pages
            ;;
        *)
            log_error "不支持的平台: $platform"
            echo "支持的平台: vercel, cloudflare-pages"
            exit 1
            ;;
    esac
    
    # 测试部署
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
