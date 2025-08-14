/**
 * Cloudflare Worker for Scheduled IP Purity Checks
 * 专门用于定时任务的Worker，支持ProxyCheck.io专业检测
 */

// 默认订阅链接列表
const DEFAULT_SUBSCRIPTION_URLS = [
    'https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray',
    'https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list_raw.txt',
    'https://raw.githubusercontent.com/ermaozi/get_subscribe/main/subscribe/v2ray.txt',
    'https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2',
    'https://raw.githubusercontent.com/mahdibland/SSAggregator/master/sub/airport_sub_merge.txt'
];

// Worker主入口
export default {
    async fetch(request, env, ctx) {
        return handleRequest(request, env, ctx);
    },
    
    async scheduled(event, env, ctx) {
        return handleScheduled(event, env, ctx);
    }
};

// 处理HTTP请求
async function handleRequest(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS处理
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-ProxyCheck-Key, X-IPInfo-Token'
            }
        });
    }
    
    try {
        switch (path) {
            case '/':
            case '/index.html':
                return new Response(getHomePage(), {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
                
            case '/api/status':
                return handleStatus(env);
                
            case '/api/manual-check':
                return handleManualCheck(request, env);
                
            default:
                return new Response('Not Found', { status: 404 });
        }
    } catch (error) {
        console.error('Error handling request:', error);
        return new Response(JSON.stringify({
            error: 'Internal Server Error',
            message: error.message,
            timestamp: new Date().toISOString()
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 处理定时任务
async function handleScheduled(event, env, ctx) {
    console.log('Starting scheduled IP purity check...');
    
    try {
        const result = await performFullCheck(env);
        
        // 保存结果到KV存储
        if (env.IP_CACHE) {
            await env.IP_CACHE.put('last_check_result', JSON.stringify({
                ...result,
                timestamp: new Date().toISOString(),
                next_check: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            }), {
                expirationTtl: 7 * 24 * 60 * 60 // 7天过期
            });
        }
        
        console.log(`Scheduled check completed: ${result.total} IPs processed, ${result.pure} pure`);
        
    } catch (error) {
        console.error('Error in scheduled check:', error);
        
        // 记录错误到KV存储
        if (env.IP_CACHE) {
            await env.IP_CACHE.put('last_check_error', JSON.stringify({
                error: error.message,
                timestamp: new Date().toISOString()
            }), {
                expirationTtl: 24 * 60 * 60 // 24小时过期
            });
        }
    }
}

// 执行完整的IP纯净度检查
async function performFullCheck(env) {
    const subscriptionUrls = getSubscriptionUrls(env);
    const allIPs = new Set();
    
    // 从所有订阅收集IP
    console.log(`Processing ${subscriptionUrls.length} subscription URLs...`);
    
    for (const url of subscriptionUrls) {
        try {
            const ips = await extractIPsFromSubscription(url);
            ips.forEach(ip => allIPs.add(ip));
            console.log(`Extracted ${ips.length} IPs from ${url}`);
        } catch (error) {
            console.warn(`Failed to process subscription ${url}:`, error.message);
        }
    }
    
    const uniqueIPs = Array.from(allIPs);
    console.log(`Found ${uniqueIPs.length} unique IPs`);
    
    if (uniqueIPs.length === 0) {
        throw new Error('No IPs found in subscriptions');
    }
    
    // 批量检测IP纯净度
    const results = [];
    const pureIPs = [];
    const batchSize = 5; // 限制并发数
    
    for (let i = 0; i < uniqueIPs.length; i += batchSize) {
        const batch = uniqueIPs.slice(i, i + batchSize);
        const batchPromises = batch.map(ip => checkIPPurity(ip, env));
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (let j = 0; j < batchResults.length; j++) {
            const result = batchResults[j];
            const ip = batch[j];
            
            if (result.status === 'fulfilled' && result.value) {
                const ipResult = result.value;
                results.push(ipResult);
                
                if (ipResult.isPure) {
                    pureIPs.push(ip);
                }
            } else {
                results.push({
                    ip: ip,
                    isPure: false,
                    error: result.reason?.message || 'Detection failed',
                    timestamp: new Date().toISOString()
                });
            }
        }
        
        // 添加延迟避免速率限制
        if (i + batchSize < uniqueIPs.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 进度日志
        console.log(`Processed ${Math.min(i + batchSize, uniqueIPs.length)}/${uniqueIPs.length} IPs`);
    }
    
    const purityRate = uniqueIPs.length > 0 ? ((pureIPs.length / uniqueIPs.length) * 100).toFixed(1) : '0.0';
    
    return {
        total: uniqueIPs.length,
        pure: pureIPs.length,
        nonPure: uniqueIPs.length - pureIPs.length,
        purityRate: purityRate,
        pureIPs: pureIPs,
        results: results.slice(0, 100), // 只保存前100个结果
        subscriptions_processed: subscriptionUrls.length
    };
}

// 从订阅链接提取IP地址
async function extractIPsFromSubscription(url) {
    try {
        const response = await fetch(url, { timeout: 15000 });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        let content = await response.text();
        
        // 尝试base64解码
        try {
            const decoded = atob(content);
            content = decoded;
        } catch (e) {
            // 如果不是base64编码，使用原始内容
        }
        
        // 提取IP地址
        const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
        const ips = content.match(ipRegex) || [];
        
        // 验证IP地址有效性
        const validIPs = ips.filter(ip => {
            const parts = ip.split('.');
            return parts.every(part => {
                const num = parseInt(part);
                return num >= 0 && num <= 255;
            });
        });
        
        return [...new Set(validIPs)]; // 去重
        
    } catch (error) {
        throw new Error(`Failed to extract IPs from ${url}: ${error.message}`);
    }
}

// 检查单个IP的纯净度
async function checkIPPurity(ip, env) {
    // 优先使用ProxyCheck.io
    const proxycheckKey = env.PROXYCHECK_API_KEY;
    if (proxycheckKey) {
        const result = await checkIPWithProxyCheck(ip, proxycheckKey);
        if (result) return result;
    }
    
    // 回退到IPinfo.io
    const ipinfoToken = env.IPINFO_TOKEN;
    if (ipinfoToken) {
        const result = await checkIPWithIPInfo(ip, ipinfoToken);
        if (result) return result;
    }
    
    // 最后回退到ip-api.com
    return await checkIPWithIPAPI(ip);
}

// ProxyCheck.io检测
async function checkIPWithProxyCheck(ip, apiKey) {
    try {
        const params = new URLSearchParams({
            vpn: '1',
            risk: '1',
            asn: '1',
            key: apiKey
        });
        
        const response = await fetch(`http://proxycheck.io/v2/${ip}?${params}`, {
            timeout: 10000
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data.status !== 'ok') return null;
        
        const ipData = data[ip];
        if (!ipData) return null;
        
        const isProxy = ipData.proxy === 'yes';
        const riskScore = parseInt(ipData.risk || 0);
        const isPure = !isProxy && riskScore < 60;
        
        return {
            ip: ip,
            isPure: isPure,
            risk_score: riskScore,
            proxy_type: ipData.type || '',
            country: ipData.country || '',
            provider: 'proxycheck.io',
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.warn(`ProxyCheck failed for ${ip}:`, error.message);
        return null;
    }
}

// IPinfo.io检测
async function checkIPWithIPInfo(ip, token) {
    try {
        const response = await fetch(`https://ipinfo.io/${ip}/json`, {
            headers: { 'Authorization': `Bearer ${token}` },
            timeout: 10000
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        const privacy = data.privacy || {};
        const isPure = !privacy.hosting && !privacy.vpn && !privacy.proxy && !privacy.tor;
        
        return {
            ip: data.ip || ip,
            isPure: isPure,
            country: data.country || '',
            org: data.org || '',
            privacy: privacy,
            provider: 'ipinfo.io',
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.warn(`IPinfo failed for ${ip}:`, error.message);
        return null;
    }
}

// ip-api.com检测
async function checkIPWithIPAPI(ip) {
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}`, {
            timeout: 8000
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        if (data.status !== 'success') return null;
        
        // 基于关键词判定
        const text = [data.isp, data.org, data.as].join(' ').toLowerCase();
        const blackKeywords = [
            'amazon', 'aws', 'google', 'gcp', 'microsoft', 'azure',
            'cloudflare', 'akamai', 'fastly', 'digitalocean', 'vultr',
            'linode', 'hetzner', 'ovh', 'datacenter', 'hosting'
        ];
        
        const isPure = !blackKeywords.some(keyword => text.includes(keyword));
        
        return {
            ip: data.query,
            isPure: isPure,
            country: data.country || '',
            org: data.org || '',
            provider: 'ip-api.com',
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.warn(`ip-api.com failed for ${ip}:`, error.message);
        return null;
    }
}

// 获取订阅链接列表
function getSubscriptionUrls(env) {
    // 可以通过环境变量自定义订阅链接
    const customUrls = env.SUBSCRIPTION_URLS;
    if (customUrls) {
        try {
            return JSON.parse(customUrls);
        } catch (e) {
            console.warn('Failed to parse custom subscription URLs, using defaults');
        }
    }
    return DEFAULT_SUBSCRIPTION_URLS;
}

// 处理状态查询
async function handleStatus(env) {
    try {
        let lastResult = null;
        let lastError = null;
        
        if (env.IP_CACHE) {
            try {
                const resultData = await env.IP_CACHE.get('last_check_result');
                if (resultData) {
                    lastResult = JSON.parse(resultData);
                }
                
                const errorData = await env.IP_CACHE.get('last_check_error');
                if (errorData) {
                    lastError = JSON.parse(errorData);
                }
            } catch (e) {
                console.warn('Failed to read from KV cache:', e);
            }
        }
        
        return new Response(JSON.stringify({
            status: 'running',
            service: 'IP Purity Checker - Scheduled Worker',
            last_check: lastResult,
            last_error: lastError,
            next_scheduled_check: 'Daily at UTC 16:00 (Beijing 00:00)',
            timestamp: new Date().toISOString()
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'Failed to get status',
            message: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 处理手动检查
async function handleManualCheck(request, env) {
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }
    
    try {
        console.log('Starting manual check...');
        const result = await performFullCheck(env);
        
        return new Response(JSON.stringify({
            status: 'completed',
            ...result,
            timestamp: new Date().toISOString()
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        console.error('Manual check failed:', error);
        return new Response(JSON.stringify({
            error: 'Manual check failed',
            message: error.message,
            timestamp: new Date().toISOString()
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 获取首页HTML
function getHomePage() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IP纯净度检查 - 定时任务服务</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        .status { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .api-endpoint { background: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 15px 0; }
        .btn { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 5px; }
        .btn:hover { background: #0056b3; }
        .result { background: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; margin: 10px 0; border-radius: 5px; font-family: monospace; font-size: 12px; white-space: pre-wrap; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 IP纯净度检查 - 定时任务服务</h1>
        
        <div class="status">
            ✅ 定时任务服务运行正常 - 每日UTC 16:00自动执行
        </div>
        
        <h2>📡 API端点</h2>
        
        <div class="api-endpoint">
            <strong>GET /api/status</strong><br>
            查看服务状态和最近检查结果
        </div>
        
        <div class="api-endpoint">
            <strong>POST /api/manual-check</strong><br>
            手动触发完整的IP纯净度检查
        </div>
        
        <h2>🧪 在线测试</h2>
        <button class="btn" onclick="checkStatus()">查看状态</button>
        <button class="btn" onclick="manualCheck()">手动检查</button>
        
        <div id="result" class="result" style="display: none;"></div>
        
        <h2>⏰ 定时任务说明</h2>
        <ul>
            <li>每日UTC 16:00（北京时间00:00）自动执行</li>
            <li>检查所有配置的订阅链接中的IP地址</li>
            <li>使用ProxyCheck.io专业检测算法</li>
            <li>结果保存到KV存储，保留7天</li>
            <li>支持自定义订阅链接（通过环境变量）</li>
        </ul>
        
        <div style="text-align: center; margin-top: 30px; color: #666;">
            <p>Powered by Cloudflare Workers | <a href="https://github.com/twj0/ip-address-purity-checker">GitHub</a></p>
        </div>
    </div>
    
    <script>
        async function checkStatus() {
            const resultDiv = document.getElementById('result');
            resultDiv.style.display = 'block';
            resultDiv.textContent = '正在查询状态...';
            
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                resultDiv.textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                resultDiv.textContent = '错误: ' + error.message;
            }
        }
        
        async function manualCheck() {
            const resultDiv = document.getElementById('result');
            resultDiv.style.display = 'block';
            resultDiv.textContent = '正在执行手动检查，请稍候...';
            
            try {
                const response = await fetch('/api/manual-check', { method: 'POST' });
                const data = await response.json();
                resultDiv.textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                resultDiv.textContent = '错误: ' + error.message;
            }
        }
    </script>
</body>
</html>`;
}
