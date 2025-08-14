/**
 * Cloudflare Worker for IP Purity Checker
 * 提供API接口和定时任务功能
 */

// 配置常量
const CONFIG = {
  IPINFO_API_BASE: 'https://ipinfo.io',
  CACHE_TTL: 24 * 60 * 60, // 24小时缓存
  MAX_BATCH_SIZE: 100,
  RATE_LIMIT_PER_MINUTE: 1000
};

// 订阅链接列表
const SUBSCRIPTION_URLS = [
  'https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray',
  'https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list_raw.txt',
  'https://raw.githubusercontent.com/ermaozi/get_subscribe/main/subscribe/v2ray.txt',
  'https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2',
  'https://raw.githubusercontent.com/mahdibland/SSAggregator/master/sub/airport_sub_merge.txt',
  'https://raw.githubusercontent.com/mahdibland/SSAggregator/master/sub/sub_merge.txt'
];

/**
 * 主要的请求处理器
 */
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

/**
 * 定时任务处理器
 */
addEventListener('scheduled', event => {
  event.waitUntil(handleScheduled(event));
});

/**
 * 处理HTTP请求
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS处理
  if (request.method === 'OPTIONS') {
    return handleCORS();
  }

  try {
    switch (path) {
      case '/':
        return new Response(getHomePage(), {
          headers: { 'Content-Type': 'text/html' }
        });
      
      case '/api/check-ip':
        return handleIPCheck(request);
      
      case '/api/check-subscription':
        return handleSubscriptionCheck(request);
      
      case '/api/generate-clash':
        return handleClashGeneration(request);
      
      case '/api/status':
        return handleStatus();
      
      default:
        return new Response('Not Found', { status: 404 });
    }
  } catch (error) {
    console.error('Request error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 处理定时任务
 */
async function handleScheduled(event) {
  console.log('Running scheduled task:', event.scheduledTime);
  
  try {
    // 执行完整的IP纯净度检查
    const result = await performFullPurityCheck();
    
    // 将结果存储到KV
    await IP_CACHE.put('latest_purity_report', JSON.stringify({
      timestamp: new Date().toISOString(),
      ...result
    }), { expirationTtl: CONFIG.CACHE_TTL });
    
    console.log('Scheduled task completed:', result);
  } catch (error) {
    console.error('Scheduled task error:', error);
  }
}

/**
 * 检查单个IP
 */
async function handleIPCheck(request) {
  const url = new URL(request.url);
  const ip = url.searchParams.get('ip');
  
  if (!ip) {
    return new Response(JSON.stringify({ error: 'IP parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCORSHeaders() }
    });
  }
  
  const result = await checkIPPurity(ip);
  
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', ...getCORSHeaders() }
  });
}

/**
 * 检查订阅链接
 */
async function handleSubscriptionCheck(request) {
  const url = new URL(request.url);
  const subscriptionUrl = url.searchParams.get('url');
  
  if (!subscriptionUrl) {
    return new Response(JSON.stringify({ error: 'URL parameter required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...getCORSHeaders() }
    });
  }
  
  const result = await checkSubscriptionPurity(subscriptionUrl);
  
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', ...getCORSHeaders() }
  });
}

/**
 * 生成Clash配置
 */
async function handleClashGeneration(request) {
  const result = await generateClashConfig();
  
  return new Response(result.config, {
    headers: { 
      'Content-Type': 'text/yaml',
      'Content-Disposition': 'attachment; filename="clash-config.yml"',
      ...getCORSHeaders()
    }
  });
}

/**
 * 获取系统状态
 */
async function handleStatus() {
  const latestReport = await IP_CACHE.get('latest_purity_report');
  
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    latest_report: latestReport ? JSON.parse(latestReport) : null,
    config: {
      cache_ttl: CONFIG.CACHE_TTL,
      max_batch_size: CONFIG.MAX_BATCH_SIZE,
      subscription_count: SUBSCRIPTION_URLS.length
    }
  };
  
  return new Response(JSON.stringify(status), {
    headers: { 'Content-Type': 'application/json', ...getCORSHeaders() }
  });
}

/**
 * 检查IP纯净度
 */
async function checkIPPurity(ip) {
  // 先检查缓存
  const cached = await IP_CACHE.get(`ip:${ip}`);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // 调用IPinfo API
  const ipInfo = await fetchIPInfo(ip);
  if (!ipInfo) {
    return { ip, error: 'Failed to fetch IP info' };
  }
  
  // 判定纯净度
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
  
  // 缓存结果
  await IP_CACHE.put(`ip:${ip}`, JSON.stringify(result), { 
    expirationTtl: CONFIG.CACHE_TTL 
  });
  
  return result;
}

/**
 * 从IPinfo获取IP信息
 */
async function fetchIPInfo(ip) {
  const token = IPINFO_TOKEN; // 环境变量
  
  try {
    const response = await fetch(`${CONFIG.IPINFO_API_BASE}/${ip}/json`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    
    if (response.ok) {
      return await response.json();
    }
    
    return null;
  } catch (error) {
    console.error('IPinfo API error:', error);
    return null;
  }
}

/**
 * 判定IP纯净度
 */
function determineIPPurity(ipInfo) {
  // 优先使用privacy信息
  if (ipInfo.privacy) {
    const { hosting, vpn, proxy, tor } = ipInfo.privacy;
    return !(hosting || vpn || proxy || tor);
  }
  
  // 回退到关键词检测
  const text = [ipInfo.isp, ipInfo.org, ipInfo.as].join(' ').toLowerCase();
  const blackKeywords = [
    'amazon', 'aws', 'google', 'gcp', 'microsoft', 'azure',
    'cloudflare', 'akamai', 'fastly', 'digitalocean', 'vultr',
    'linode', 'hetzner', 'ovh', 'datacenter', 'hosting'
  ];
  
  return !blackKeywords.some(keyword => text.includes(keyword));
}

/**
 * 执行完整的纯净度检查
 */
async function performFullPurityCheck() {
  const allIPs = new Set();
  
  // 从所有订阅收集IP
  for (const url of SUBSCRIPTION_URLS) {
    try {
      const ips = await extractIPsFromSubscription(url);
      ips.forEach(ip => allIPs.add(ip));
    } catch (error) {
      console.error(`Failed to process subscription ${url}:`, error);
    }
  }
  
  const uniqueIPs = Array.from(allIPs);
  console.log(`Processing ${uniqueIPs.length} unique IPs`);
  
  // 批量处理IP
  const results = [];
  for (let i = 0; i < uniqueIPs.length; i += CONFIG.MAX_BATCH_SIZE) {
    const batch = uniqueIPs.slice(i, i + CONFIG.MAX_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(ip => checkIPPurity(ip))
    );
    results.push(...batchResults);
    
    // 避免过快请求
    if (i + CONFIG.MAX_BATCH_SIZE < uniqueIPs.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // 统计结果
  const pureCount = results.filter(r => r.isPure).length;
  const totalCount = results.length;
  
  return {
    total: totalCount,
    pure: pureCount,
    nonPure: totalCount - pureCount,
    purityRate: (pureCount / totalCount * 100).toFixed(1),
    results: results.slice(0, 100) // 只返回前100个结果
  };
}

/**
 * 从订阅提取IP地址
 */
async function extractIPsFromSubscription(url) {
  const response = await fetch(url);
  const text = await response.text();
  
  // 简化的IP提取逻辑
  const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
  const matches = text.match(ipRegex) || [];
  
  return [...new Set(matches)].filter(ip => {
    const parts = ip.split('.');
    return parts.every(part => parseInt(part) <= 255);
  });
}

/**
 * CORS处理
 */
function handleCORS() {
  return new Response(null, {
    status: 200,
    headers: getCORSHeaders()
  });
}

function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

/**
 * 首页HTML
 */
function getHomePage() {
  return `
<!DOCTYPE html>
<html>
<head>
    <title>IP Purity Checker</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        .api-endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
        .status { color: #28a745; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 IP Purity Checker API</h1>
        <p class="status">✅ Service is running on Cloudflare Workers</p>
        
        <h2>API Endpoints</h2>
        <div class="api-endpoint">
            <strong>GET /api/check-ip?ip={ip}</strong><br>
            检查单个IP地址的纯净度
        </div>
        <div class="api-endpoint">
            <strong>GET /api/check-subscription?url={url}</strong><br>
            检查订阅链接中所有IP的纯净度
        </div>
        <div class="api-endpoint">
            <strong>GET /api/generate-clash</strong><br>
            生成纯净IP的Clash配置文件
        </div>
        <div class="api-endpoint">
            <strong>GET /api/status</strong><br>
            获取系统状态和最新报告
        </div>
        
        <h2>Features</h2>
        <ul>
            <li>🚀 基于Cloudflare Workers的全球边缘计算</li>
            <li>⚡ 智能缓存，24小时有效期</li>
            <li>🔄 每日自动更新IP纯净度数据</li>
            <li>🎯 支持IPinfo.io高精度privacy检测</li>
            <li>📊 实时生成Clash配置文件</li>
        </ul>
        
        <p><small>Powered by Cloudflare Workers | <a href="https://github.com/twj0/ip-address-purity-checker">GitHub</a></small></p>
    </div>
</body>
</html>`;
}
