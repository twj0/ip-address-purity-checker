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
                return new Response(getConsolidatedHomePage(), {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
                
            case '/api/status':
                return handleStatus(env);
                
            case '/api/manual-check':
                return handleManualCheck(request, env);

            case '/api/check-ip':
                return handleCheckIP(request, env);

            case '/api/check-subscription':
                return handleCheckSubscription(request, env);

            case '/api/clash-config':
                return handleClashConfig(env);

            case '/clash-config.yaml':
            case '/api/clash-config.yaml':
                return handleOptimizedClashConfig(env);

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
            console.log('Extracted ' + ips.length + ' IPs from ' + url);
        } catch (error) {
            console.warn('Failed to process subscription ' + url + ':', error.message);
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
            throw new Error('HTTP ' + response.status);
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
        throw new Error('Failed to extract IPs from ' + url + ': ' + error.message);
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

// 处理单IP检测
async function handleCheckIP(request, env) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-ProxyCheck-Key, X-IPInfo-Token',
        'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const url = new URL(request.url);
        const ip = url.searchParams.get('ip');

        if (!ip) {
            return new Response(JSON.stringify({
                error: 'IP parameter is required'
            }), {
                status: 400,
                headers: corsHeaders
            });
        }

        // 获取API密钥
        const proxycheckKey = request.headers.get('X-ProxyCheck-Key') || env.PROXYCHECK_API_KEY;
        const ipinfoToken = request.headers.get('X-IPInfo-Token') || env.IPINFO_TOKEN;

        let result = null;

        // 优先使用ProxyCheck.io
        if (proxycheckKey) {
            try {
                const response = await fetch(`https://proxycheck.io/v2/${ip}?vpn=1&asn=1&risk=1&time=1&inf=0&key=${proxycheckKey}`);
                const data = await response.json();

                if (data[ip]) {
                    const ipData = data[ip];
                    result = {
                        ip: ip,
                        isPure: ipData.proxy === 'no' && ipData.type !== 'VPN',
                        riskScore: ipData.risk || 0,
                        proxyType: ipData.proxy === 'yes' ? ipData.type : 'none',
                        country: ipData.country,
                        city: ipData.city,
                        isp: ipData.isp,
                        provider: 'proxycheck.io',
                        timestamp: new Date().toISOString()
                    };
                }
            } catch (error) {
                console.error('ProxyCheck.io error:', error);
            }
        }

        // 备用：使用IPinfo.io
        if (!result && ipinfoToken) {
            try {
                const response = await fetch(`https://ipinfo.io/${ip}/json`, {
                    headers: {
                        'Authorization': `Bearer ${ipinfoToken}`
                    }
                });
                const data = await response.json();

                if (data.ip) {
                    result = {
                        ip: data.ip,
                        isPure: !data.privacy?.hosting && !data.privacy?.vpn && !data.privacy?.proxy,
                        riskScore: data.privacy?.hosting ? 80 : (data.privacy?.vpn || data.privacy?.proxy ? 60 : 0),
                        proxyType: data.privacy?.vpn ? 'VPN' : (data.privacy?.proxy ? 'Proxy' : 'none'),
                        country: data.country,
                        city: data.city,
                        org: data.org,
                        provider: 'ipinfo.io',
                        timestamp: new Date().toISOString()
                    };
                }
            } catch (error) {
                console.error('IPinfo.io error:', error);
            }
        }

        // 最后备用：使用ip-api.com
        if (!result) {
            try {
                const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,city,isp,org,proxy,hosting`);
                const data = await response.json();

                if (data.status === 'success') {
                    result = {
                        ip: ip,
                        isPure: !data.proxy && !data.hosting,
                        riskScore: data.hosting ? 70 : (data.proxy ? 50 : 0),
                        proxyType: data.proxy ? 'Proxy' : 'none',
                        country: data.country,
                        city: data.city,
                        isp: data.isp,
                        org: data.org,
                        provider: 'ip-api.com',
                        timestamp: new Date().toISOString()
                    };
                }
            } catch (error) {
                console.error('ip-api.com error:', error);
            }
        }

        if (!result) {
            return new Response(JSON.stringify({
                error: 'Unable to check IP address',
                message: 'All API providers failed or are not configured'
            }), {
                status: 500,
                headers: corsHeaders
            });
        }

        return new Response(JSON.stringify(result), {
            headers: corsHeaders
        });

    } catch (error) {
        console.error('Check IP error:', error);
        return new Response(JSON.stringify({
            error: 'Internal server error',
            message: error.message
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

// 处理订阅检测
async function handleCheckSubscription(request, env) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
        const body = await request.json();
        const { url } = body;

        if (!url) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Subscription URL is required'
            }), {
                status: 400,
                headers: corsHeaders
            });
        }

        // 获取订阅内容
        const response = await fetch(url, { timeout: 15000 });
        if (!response.ok) {
            return new Response(JSON.stringify({
                success: false,
                error: `HTTP ${response.status}: ${response.statusText}`
            }), {
                status: 400,
                headers: corsHeaders
            });
        }

        let content = await response.text();

        // 尝试base64解码
        try {
            const decoded = atob(content);
            content = decoded;
        } catch (e) {
            // 如果不是base64编码，使用原始内容
        }

        // 解析节点
        const nodes = [];
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            const node = parseNodeLine(trimmedLine);
            if (node) {
                nodes.push(node);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            totalNodes: nodes.length,
            nodes: nodes.slice(0, 10), // 只返回前10个节点作为示例
            message: `Successfully parsed ${nodes.length} nodes`
        }), {
            headers: corsHeaders
        });

    } catch (error) {
        console.error('Check subscription error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

// 处理优化的Clash配置下载（带IP去重和纯净度排序）
async function handleOptimizedClashConfig(env) {
    try {
        // 获取所有订阅链接的IP数据
        const allIPs = await aggregateAndRankIPs(env);

        // 生成优化的Clash配置
        const clashConfig = await generateOptimizedClashConfig(allIPs, env);

        // 转换为YAML格式
        const yamlContent = convertToYAML(clashConfig);

        return new Response(yamlContent, {
            headers: {
                'Content-Type': 'text/yaml; charset=utf-8',
                'Content-Disposition': 'attachment; filename="clash-config-optimized.yaml"',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600' // 缓存1小时
            }
        });

    } catch (error) {
        console.error('Generate optimized Clash config error:', error);
        return new Response(JSON.stringify({
            error: 'Failed to generate optimized Clash config',
            message: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 处理基础Clash配置下载
async function handleClashConfig(env) {
    try {
        // 生成基础Clash配置
        const clashConfig = {
            port: 7890,
            'socks-port': 7891,
            'allow-lan': false,
            mode: 'Rule',
            'log-level': 'info',
            'external-controller': '127.0.0.1:9090',

            dns: {
                enable: true,
                listen: '0.0.0.0:53',
                'default-nameserver': ['223.5.5.5', '119.29.29.29'],
                nameserver: ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
                'fallback-filter': {
                    geoip: true,
                    'geoip-code': 'CN'
                }
            },

            proxies: [],

            'proxy-groups': [
                {
                    name: '🚀 节点选择',
                    type: 'select',
                    proxies: ['♻️ 自动选择', '🎯 全球直连', 'DIRECT']
                },
                {
                    name: '♻️ 自动选择',
                    type: 'url-test',
                    proxies: [],
                    url: 'http://www.gstatic.com/generate_204',
                    interval: 300
                },
                {
                    name: '🎯 全球直连',
                    type: 'select',
                    proxies: ['DIRECT', '🚀 节点选择']
                }
            ],

            rules: [
                'DOMAIN-SUFFIX,local,🎯 全球直连',
                'IP-CIDR,127.0.0.0/8,🎯 全球直连',
                'IP-CIDR,172.16.0.0/12,🎯 全球直连',
                'IP-CIDR,192.168.0.0/16,🎯 全球直连',
                'IP-CIDR,10.0.0.0/8,🎯 全球直连',
                'GEOIP,CN,🎯 全球直连',
                'MATCH,🚀 节点选择'
            ]
        };

        // 转换为YAML格式
        const yamlContent = convertToYAML(clashConfig);

        return new Response(yamlContent, {
            headers: {
                'Content-Type': 'text/yaml; charset=utf-8',
                'Content-Disposition': 'attachment; filename="clash-config.yaml"',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error) {
        console.error('Generate Clash config error:', error);
        return new Response(JSON.stringify({
            error: 'Failed to generate Clash config',
            message: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 获取综合首页HTML
function getConsolidatedHomePage() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔍 IP地址纯净度检查工具 - 一站式服务</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }

        .header p {
            opacity: 0.9;
            font-size: 1.1em;
        }

        .main-content {
            padding: 30px;
        }

        .section {
            margin-bottom: 40px;
            padding: 25px;
            border: 1px solid #e1e5e9;
            border-radius: 10px;
            background: #f8f9fa;
        }

        .section h2 {
            color: #333;
            margin-bottom: 20px;
            font-size: 1.5em;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #555;
        }

        .form-group input, .form-group textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
        }

        .form-group input:focus, .form-group textarea:focus {
            outline: none;
            border-color: #667eea;
        }

        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-right: 10px;
            margin-bottom: 10px;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        .btn-danger {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
        }

        .btn-success {
            background: linear-gradient(135deg, #51cf66 0%, #40c057 100%);
        }

        .result {
            background: #f1f3f4;
            border: 1px solid #dee2e6;
            padding: 15px;
            margin: 15px 0;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            white-space: pre-wrap;
            max-height: 400px;
            overflow-y: auto;
            display: none;
        }

        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }

        .status-success { background: #51cf66; }
        .status-error { background: #ff6b6b; }
        .status-warning { background: #ffd43b; }
        .status-info { background: #339af0; }

        .alert {
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
        }

        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }

        .alert-warning {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }

        .tabs {
            display: flex;
            border-bottom: 2px solid #e1e5e9;
            margin-bottom: 20px;
        }

        .tab {
            padding: 12px 24px;
            cursor: pointer;
            border: none;
            background: none;
            font-size: 14px;
            font-weight: 600;
            color: #666;
            border-bottom: 2px solid transparent;
            transition: all 0.3s;
        }

        .tab.active {
            color: #667eea;
            border-bottom-color: #667eea;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        .loading {
            display: none;
            text-align: center;
            padding: 20px;
        }

        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
            .container {
                margin: 10px;
                border-radius: 10px;
            }

            .header {
                padding: 20px;
            }

            .header h1 {
                font-size: 2em;
            }

            .main-content {
                padding: 20px;
            }

            .tabs {
                flex-wrap: wrap;
            }

            .tab {
                flex: 1;
                min-width: 120px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 IP地址纯净度检查工具</h1>
            <p>一站式IP检测服务 - 支持单IP检测、批量检测、订阅管理和定时任务</p>
        </div>

        <div class="main-content">
            <!-- 提示信息 -->
            <div id="alertContainer"></div>

            <!-- 标签页导航 -->
            <div class="tabs">
                <button class="tab active" onclick="switchTab('single-ip')">🔍 单IP检测</button>
                <button class="tab" onclick="switchTab('batch-ip')">📋 批量检测</button>
                <button class="tab" onclick="switchTab('subscription')">📡 订阅管理</button>
                <button class="tab" onclick="switchTab('scheduled')">⏰ 定时任务</button>
                <button class="tab" onclick="switchTab('settings')">⚙️ 设置</button>
            </div>

            <!-- 单IP检测标签页 -->
            <div id="single-ip" class="tab-content active">
                <div class="section">
                    <h2>🔍 单IP地址检测</h2>
                    <div class="form-group">
                        <label for="singleIp">IP地址:</label>
                        <input type="text" id="singleIp" placeholder="例如: 8.8.8.8" value="8.8.8.8">
                    </div>
                    <button class="btn" onclick="checkSingleIP()">🔍 检测IP</button>
                    <div id="singleResult" class="result"></div>
                </div>
            </div>

            <!-- 批量检测标签页 -->
            <div id="batch-ip" class="tab-content">
                <div class="section">
                    <h2>📋 批量IP检测</h2>
                    <div class="form-group">
                        <label for="batchIps">IP地址列表 (每行一个):</label>
                        <textarea id="batchIps" rows="8" placeholder="8.8.8.8
1.1.1.1
208.67.222.222
9.9.9.9"></textarea>
                    </div>
                    <button class="btn" onclick="checkBatchIPs()">📋 批量检测</button>
                    <button class="btn btn-success" onclick="exportResults()">📊 导出结果</button>
                    <div id="batchResult" class="result"></div>
                </div>
            </div>

            <!-- 订阅管理标签页 -->
            <div id="subscription" class="tab-content">
                <div class="section">
                    <h2>📡 订阅链接管理</h2>
                    <div class="form-group">
                        <label for="subscriptionName">订阅名称:</label>
                        <input type="text" id="subscriptionName" placeholder="例如: 机场A - 高速节点">
                    </div>
                    <div class="form-group">
                        <label for="subscriptionUrl">订阅链接:</label>
                        <textarea id="subscriptionUrl" rows="3" placeholder="https://example.com/subscription"></textarea>
                    </div>
                    <button class="btn" onclick="addSubscription()">➕ 添加订阅</button>
                    <button class="btn btn-success" onclick="checkAllSubscriptions()">🔍 检查所有订阅</button>
                    <button class="btn btn-danger" onclick="clearSubscriptions()">🗑️ 清空订阅</button>

                    <h3 style="margin-top: 30px;">📋 已保存的订阅</h3>
                    <div id="subscriptionList"></div>
                    <div id="subscriptionResult" class="result"></div>
                </div>
            </div>

            <!-- 定时任务标签页 -->
            <div id="scheduled" class="tab-content">
                <div class="section">
                    <h2>⏰ 定时任务管理</h2>
                    <div class="status" style="background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <span class="status-indicator status-success"></span>
                        定时任务服务运行正常 - 每日UTC 16:00自动执行
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px;">
                        <div style="background: white; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #e1e5e9;">
                            <div style="font-size: 2em; font-weight: bold; color: #667eea;" id="totalChecked">-</div>
                            <div style="color: #666; margin-top: 5px;">总检测次数</div>
                        </div>
                        <div style="background: white; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #e1e5e9;">
                            <div style="font-size: 2em; font-weight: bold; color: #51cf66;" id="pureIPs">-</div>
                            <div style="color: #666; margin-top: 5px;">纯净IP数量</div>
                        </div>
                        <div style="background: white; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #e1e5e9;">
                            <div style="font-size: 2em; font-weight: bold; color: #ffd43b;" id="lastCheck">从未</div>
                            <div style="color: #666; margin-top: 5px;">最后检查</div>
                        </div>
                    </div>

                    <button class="btn" onclick="checkStatus()">📊 查看状态</button>
                    <button class="btn btn-success" onclick="manualCheck()">🔄 手动检查</button>
                    <button class="btn" onclick="downloadClashConfig()">⚙️ 下载Clash配置</button>

                    <div id="scheduledResult" class="result"></div>
                </div>
            </div>

            <!-- 设置标签页 -->
            <div id="settings" class="tab-content">
                <div class="section">
                    <h2>⚙️ API密钥设置</h2>
                    <p style="color: #666; margin-bottom: 20px;">
                        配置API密钥以获得更准确的检测结果。密钥将保存在浏览器会话中，不会上传到服务器。
                    </p>

                    <div class="form-group">
                        <label for="proxycheckKey">ProxyCheck.io API密钥 (推荐):</label>
                        <input type="password" id="proxycheckKey" placeholder="输入您的ProxyCheck.io API密钥">
                        <small style="color: #666;">
                            <a href="https://proxycheck.io/api/" target="_blank">免费注册</a> 获得1000次/天检测额度
                        </small>
                    </div>

                    <div class="form-group">
                        <label for="ipinfoToken">IPinfo.io Token (备用):</label>
                        <input type="password" id="ipinfoToken" placeholder="输入您的IPinfo.io Token">
                        <small style="color: #666;">
                            <a href="https://ipinfo.io/signup" target="_blank">免费注册</a> 获得50000次/月检测额度
                        </small>
                    </div>

                    <button class="btn" onclick="saveSettings()">💾 保存设置</button>
                    <button class="btn" onclick="testAPIKeys()">🧪 测试API密钥</button>
                    <button class="btn btn-danger" onclick="clearSettings()">🗑️ 清除设置</button>

                    <div id="settingsResult" class="result"></div>
                </div>

                <div class="section">
                    <h2>📚 使用说明</h2>
                    <div style="background: white; padding: 20px; border-radius: 8px;">
                        <h3>🔧 环境变量配置 (服务器管理员)</h3>
                        <p>如果您是服务器管理员，可以在Cloudflare Dashboard中配置全局API密钥：</p>
                        <ol style="margin: 15px 0; padding-left: 20px;">
                            <li>登录 <a href="https://dash.cloudflare.com" target="_blank">Cloudflare Dashboard</a></li>
                            <li>选择您的账户 → Workers & Pages</li>
                            <li>找到 "ip-purity-checker" 项目</li>
                            <li>进入 Settings → Environment variables</li>
                            <li>添加变量：
                                <ul style="margin: 10px 0; padding-left: 20px;">
                                    <li><code>PROXYCHECK_API_KEY</code> = 您的ProxyCheck.io密钥</li>
                                    <li><code>IPINFO_TOKEN</code> = 您的IPinfo.io Token</li>
                                </ul>
                            </li>
                            <li>保存并重新部署</li>
                        </ol>

                        <h3>🎯 检测说明</h3>
                        <ul style="margin: 15px 0; padding-left: 20px;">
                            <li><strong>纯净IP</strong>: 不是代理、VPN或数据中心IP的普通住宅IP</li>
                            <li><strong>风险评分</strong>: 0-100分，分数越高风险越大</li>
                            <li><strong>检测精度</strong>: 配置API密钥可显著提高检测准确性</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // 全局变量
        let subscriptions = [];
        let apiKeys = {
            proxycheck: localStorage.getItem('proxycheck_key') || '',
            ipinfo: localStorage.getItem('ipinfo_token') || ''
        };

        // 页面加载时初始化
        document.addEventListener('DOMContentLoaded', function() {
            loadSettings();
            loadSubscriptions();
            updateStats();
        });

        // 标签页切换
        function switchTab(tabName) {
            // 隐藏所有标签页内容
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });

            // 移除所有标签页的active类
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });

            // 显示选中的标签页
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
        }

        // 显示提示信息
        function showAlert(message, type = 'success') {
            const alertContainer = document.getElementById('alertContainer');
            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-' + type;
            alertDiv.textContent = message;
            alertDiv.style.display = 'block';

            alertContainer.innerHTML = '';
            alertContainer.appendChild(alertDiv);

            // 3秒后自动隐藏
            setTimeout(() => {
                alertDiv.style.display = 'none';
            }, 3000);
        }

        // 显示结果
        function showResult(elementId, content, isError = false) {
            const resultDiv = document.getElementById(elementId);
            resultDiv.style.display = 'block';
            resultDiv.textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
            resultDiv.style.color = isError ? '#dc3545' : '#333';
        }

        // 单IP检测
        async function checkSingleIP() {
            const ip = document.getElementById('singleIp').value.trim();
            if (!ip) {
                showAlert('请输入IP地址', 'error');
                return;
            }

            showResult('singleResult', '正在检测IP地址...');

            try {
                const headers = {};
                if (apiKeys.proxycheck) {
                    headers['X-ProxyCheck-Key'] = apiKeys.proxycheck;
                }
                if (apiKeys.ipinfo) {
                    headers['X-IPInfo-Token'] = apiKeys.ipinfo;
                }

                const response = await fetch('/api/check-ip?ip=' + encodeURIComponent(ip), {
                    headers: headers
                });

                const data = await response.json();

                if (response.ok) {
                    showResult('singleResult', data);
                    showAlert('IP检测完成', 'success');
                } else {
                    showResult('singleResult', data, true);
                    showAlert('检测失败: ' + (data.error || '未知错误'), 'error');
                }
            } catch (error) {
                showResult('singleResult', '错误: ' + error.message, true);
                showAlert('网络错误: ' + error.message, 'error');
            }
        }

        // 批量IP检测
        async function checkBatchIPs() {
            const ipsText = document.getElementById('batchIps').value.trim();
            if (!ipsText) {
                showAlert('请输入IP地址列表', 'error');
                return;
            }

            const ips = ipsText.split('\\n').map(ip => ip.trim()).filter(ip => ip);
            if (ips.length === 0) {
                showAlert('没有有效的IP地址', 'error');
                return;
            }

            showResult('batchResult', '正在检测 ' + ips.length + ' 个IP地址...');

            const results = [];
            const headers = {};
            if (apiKeys.proxycheck) {
                headers['X-ProxyCheck-Key'] = apiKeys.proxycheck;
            }
            if (apiKeys.ipinfo) {
                headers['X-IPInfo-Token'] = apiKeys.ipinfo;
            }

            for (let i = 0; i < ips.length; i++) {
                const ip = ips[i];
                showResult('batchResult', '正在检测 ' + (i + 1) + '/' + ips.length + ': ' + ip);

                try {
                    const response = await fetch('/api/check-ip?ip=' + encodeURIComponent(ip), {
                        headers: headers
                    });
                    const data = await response.json();
                    results.push(data);

                    // 添加延迟避免API限制
                    if (i < ips.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    results.push({
                        ip: ip,
                        error: error.message,
                        isPure: false
                    });
                }
            }

            showResult('batchResult', results);
            showAlert('批量检测完成，共检测 ' + results.length + ' 个IP', 'success');
        }

        // 导出结果
        function exportResults() {
            const resultDiv = document.getElementById('batchResult');
            if (!resultDiv.textContent || resultDiv.style.display === 'none') {
                showAlert('没有可导出的结果', 'warning');
                return;
            }

            try {
                const results = JSON.parse(resultDiv.textContent);
                if (!Array.isArray(results)) {
                    showAlert('结果格式不正确', 'error');
                    return;
                }

                // 生成CSV内容
                const csvHeader = 'IP地址,纯净度,风险评分,国家,城市,ISP,检测时间\\n';
                const csvContent = results.map(result => {
                    return [
                        result.ip || '',
                        result.isPure ? '纯净' : '不纯净',
                        result.riskScore || '',
                        result.country || '',
                        result.city || '',
                        result.org || result.isp || '',
                        result.timestamp || new Date().toISOString()
                    ].join(',');
                }).join('\\n');

                // 下载文件
                const blob = new Blob([csvHeader + csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'ip_purity_check_' + new Date().toISOString().split('T')[0] + '.csv';
                link.click();

                showAlert('结果已导出为CSV文件', 'success');
            } catch (error) {
                showAlert('导出失败: ' + error.message, 'error');
            }
        }

        // 订阅管理
        function addSubscription() {
            const name = document.getElementById('subscriptionName').value.trim();
            const url = document.getElementById('subscriptionUrl').value.trim();

            if (!name || !url) {
                showAlert('请填写订阅名称和链接', 'error');
                return;
            }

            // 检查URL格式
            try {
                new URL(url);
            } catch (e) {
                showAlert('请输入有效的订阅链接', 'error');
                return;
            }

            // 检查是否重复
            if (subscriptions.some(sub => sub.url === url)) {
                showAlert('该订阅链接已存在', 'warning');
                return;
            }

            const subscription = {
                id: Date.now().toString(),
                name: name,
                url: url,
                createdAt: new Date().toISOString(),
                lastChecked: null,
                status: 'unknown'
            };

            subscriptions.push(subscription);
            saveSubscriptions();
            renderSubscriptions();

            // 清空表单
            document.getElementById('subscriptionName').value = '';
            document.getElementById('subscriptionUrl').value = '';

            showAlert('订阅添加成功', 'success');
        }

        // 保存订阅到localStorage
        function saveSubscriptions() {
            localStorage.setItem('subscriptions', JSON.stringify(subscriptions));
        }

        // 从localStorage加载订阅
        function loadSubscriptions() {
            const saved = localStorage.getItem('subscriptions');
            if (saved) {
                try {
                    subscriptions = JSON.parse(saved);
                } catch (e) {
                    subscriptions = [];
                }
            }
            renderSubscriptions();
        }

        // 渲染订阅列表
        function renderSubscriptions() {
            const container = document.getElementById('subscriptionList');

            if (subscriptions.length === 0) {
                container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">暂无订阅，请添加您的第一个订阅链接</p>';
                return;
            }

            container.innerHTML = subscriptions.map(function(sub) {
                return '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 10px;">' +
                    '<h4 style="margin: 0 0 10px 0; color: #333;">' + sub.name + '</h4>' +
                    '<div style="font-family: monospace; background: #f1f3f4; padding: 8px; border-radius: 4px; word-break: break-all; font-size: 12px; margin-bottom: 10px;">' +
                        (sub.url.substring(0, 80) + (sub.url.length > 80 ? '...' : '')) +
                    '</div>' +
                    '<div style="font-size: 12px; color: #666; margin-bottom: 10px;">' +
                        '创建时间: ' + new Date(sub.createdAt).toLocaleString() + ' | ' +
                        '最后检查: ' + (sub.lastChecked ? new Date(sub.lastChecked).toLocaleString() : '从未') +
                    '</div>' +
                    '<button class="btn" onclick="testSubscription(\'' + sub.id + '\')">🧪 测试</button>' +
                    '<button class="btn btn-danger" onclick="deleteSubscription(\'' + sub.id + '\')">🗑️删除</button>' +
                '</div>';
            }).join('');
        }

        // 测试单个订阅
        async function testSubscription(id) {
            const subscription = subscriptions.find(sub => sub.id === id);
            if (!subscription) return;

            showAlert('正在测试订阅连接...', 'info');

            try {
                const response = await fetch('/api/check-subscription', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        url: subscription.url
                    })
                });

                const result = await response.json();

                if (result.success) {
                    subscription.status = 'active';
                    subscription.lastChecked = new Date().toISOString();
                    saveSubscriptions();
                    renderSubscriptions();
                    showAlert('测试成功！发现 ' + result.totalNodes + ' 个节点', 'success');
                } else {
                    subscription.status = 'error';
                    showAlert('测试失败: ' + result.error, 'error');
                }
            } catch (error) {
                showAlert('测试失败: ' + error.message, 'error');
            }
        }

        // 删除订阅
        function deleteSubscription(id) {
            if (!confirm('确定要删除这个订阅吗？')) return;

            subscriptions = subscriptions.filter(sub => sub.id !== id);
            saveSubscriptions();
            renderSubscriptions();
            showAlert('订阅删除成功', 'success');
        }

        // 检查所有订阅
        async function checkAllSubscriptions() {
            if (subscriptions.length === 0) {
                showAlert('没有订阅需要检查', 'warning');
                return;
            }

            showResult('subscriptionResult', '正在检查所有订阅，请稍候...');

            const results = [];
            for (let i = 0; i < subscriptions.length; i++) {
                const sub = subscriptions[i];
                showResult('subscriptionResult', '正在检查 ' + (i + 1) + '/' + subscriptions.length + ': ' + sub.name);

                try {
                    const response = await fetch('/api/check-subscription', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            url: sub.url
                        })
                    });

                    const result = await response.json();
                    results.push({
                        name: sub.name,
                        ...result
                    });

                    sub.lastChecked = new Date().toISOString();
                    sub.status = result.success ? 'active' : 'error';

                    // 添加延迟
                    if (i < subscriptions.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } catch (error) {
                    results.push({
                        name: sub.name,
                        success: false,
                        error: error.message
                    });
                }
            }

            saveSubscriptions();
            renderSubscriptions();
            showResult('subscriptionResult', results);
            showAlert('所有订阅检查完成', 'success');
        }

        // 清空订阅
        function clearSubscriptions() {
            if (!confirm('确定要删除所有订阅吗？此操作不可恢复！')) return;

            subscriptions = [];
            saveSubscriptions();
            renderSubscriptions();
            showAlert('所有订阅已清空', 'success');
        }

        // 定时任务相关
        async function checkStatus() {
            showResult('scheduledResult', '正在查询状态...');

            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                showResult('scheduledResult', data);
                updateStatsFromData(data);
                showAlert('状态查询完成', 'success');
            } catch (error) {
                showResult('scheduledResult', '错误: ' + error.message, true);
                showAlert('状态查询失败: ' + error.message, 'error');
            }
        }

        async function manualCheck() {
            showResult('scheduledResult', '正在执行手动检查，请稍候...');

            try {
                const response = await fetch('/api/manual-check', { method: 'POST' });
                const data = await response.json();
                showResult('scheduledResult', data);
                updateStatsFromData(data);
                showAlert('手动检查完成', 'success');
            } catch (error) {
                showResult('scheduledResult', '错误: ' + error.message, true);
                showAlert('手动检查失败: ' + error.message, 'error');
            }
        }

        async function downloadClashConfig() {
            try {
                const response = await fetch('/api/clash-config');
                if (response.ok) {
                    const blob = await response.blob();
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = 'clash-config-' + new Date().toISOString().split('T')[0] + '.yaml';
                    link.click();
                    showAlert('Clash配置下载成功', 'success');
                } else {
                    showAlert('Clash配置下载失败', 'error');
                }
            } catch (error) {
                showAlert('下载失败: ' + error.message, 'error');
            }
        }

        // 更新统计数据
        function updateStats() {
            // 默认显示
            document.getElementById('totalChecked').textContent = '-';
            document.getElementById('pureIPs').textContent = '-';
            document.getElementById('lastCheck').textContent = '从未';
        }

        function updateStatsFromData(data) {
            if (data.stats) {
                document.getElementById('totalChecked').textContent = data.stats.totalChecked || '-';
                document.getElementById('pureIPs').textContent = data.stats.pureIPs || '-';
                document.getElementById('lastCheck').textContent = data.stats.lastCheck ?
                    new Date(data.stats.lastCheck).toLocaleString() : '从未';
            }
        }

        // 设置相关
        function loadSettings() {
            const proxycheckKey = localStorage.getItem('proxycheck_key');
            const ipinfoToken = localStorage.getItem('ipinfo_token');

            if (proxycheckKey) {
                document.getElementById('proxycheckKey').value = proxycheckKey;
                apiKeys.proxycheck = proxycheckKey;
            }

            if (ipinfoToken) {
                document.getElementById('ipinfoToken').value = ipinfoToken;
                apiKeys.ipinfo = ipinfoToken;
            }
        }

        function saveSettings() {
            const proxycheckKey = document.getElementById('proxycheckKey').value.trim();
            const ipinfoToken = document.getElementById('ipinfoToken').value.trim();

            if (proxycheckKey) {
                localStorage.setItem('proxycheck_key', proxycheckKey);
                apiKeys.proxycheck = proxycheckKey;
            } else {
                localStorage.removeItem('proxycheck_key');
                apiKeys.proxycheck = '';
            }

            if (ipinfoToken) {
                localStorage.setItem('ipinfo_token', ipinfoToken);
                apiKeys.ipinfo = ipinfoToken;
            } else {
                localStorage.removeItem('ipinfo_token');
                apiKeys.ipinfo = '';
            }

            showAlert('设置保存成功', 'success');
        }

        async function testAPIKeys() {
            showResult('settingsResult', '正在测试API密钥...');

            const results = [];

            // 测试ProxyCheck.io
            if (apiKeys.proxycheck) {
                try {
                    const response = await fetch('/api/check-ip?ip=8.8.8.8', {
                        headers: {
                            'X-ProxyCheck-Key': apiKeys.proxycheck
                        }
                    });
                    const data = await response.json();
                    results.push({
                        service: 'ProxyCheck.io',
                        status: response.ok ? '✅ 正常' : '❌ 失败',
                        message: response.ok ? '密钥有效' : data.error || '未知错误'
                    });
                } catch (error) {
                    results.push({
                        service: 'ProxyCheck.io',
                        status: '❌ 错误',
                        message: error.message
                    });
                }
            } else {
                results.push({
                    service: 'ProxyCheck.io',
                    status: '⚠️ 未配置',
                    message: '请输入API密钥'
                });
            }

            // 测试IPinfo.io
            if (apiKeys.ipinfo) {
                try {
                    const response = await fetch('/api/check-ip?ip=8.8.8.8', {
                        headers: {
                            'X-IPInfo-Token': apiKeys.ipinfo
                        }
                    });
                    const data = await response.json();
                    results.push({
                        service: 'IPinfo.io',
                        status: response.ok ? '✅ 正常' : '❌ 失败',
                        message: response.ok ? 'Token有效' : data.error || '未知错误'
                    });
                } catch (error) {
                    results.push({
                        service: 'IPinfo.io',
                        status: '❌ 错误',
                        message: error.message
                    });
                }
            } else {
                results.push({
                    service: 'IPinfo.io',
                    status: '⚠️ 未配置',
                    message: '请输入Token'
                });
            }

            showResult('settingsResult', results);
            showAlert('API密钥测试完成', 'success');
        }

        function clearSettings() {
            if (!confirm('确定要清除所有设置吗？')) return;

            localStorage.removeItem('proxycheck_key');
            localStorage.removeItem('ipinfo_token');
            localStorage.removeItem('subscriptions');

            apiKeys.proxycheck = '';
            apiKeys.ipinfo = '';
            subscriptions = [];

            document.getElementById('proxycheckKey').value = '';
            document.getElementById('ipinfoToken').value = '';
            renderSubscriptions();

            showAlert('所有设置已清除', 'success');
        }
    </script>
</body>
</html>\`;
}

// 解析单行节点配置
function parseNodeLine(line) {
    try {
        // vmess://
        if (line.startsWith('vmess://')) {
            const encoded = line.substring(8);
            const decoded = atob(encoded);
            const config = JSON.parse(decoded);
            return {
                name: config.ps || 'Unknown',
                ip: config.add || '',
                port: config.port || '',
                protocol: 'vmess'
            };
        }

        // vless://
        else if (line.startsWith('vless://')) {
            const match = line.match(/@([^:]+):/);
            if (match) {
                const ip = match[1];
                const nameMatch = line.match(/#([^&]+)/);
                const name = nameMatch ? decodeURIComponent(nameMatch[1]) : 'Unknown';
                return {
                    name: name,
                    ip: ip,
                    protocol: 'vless'
                };
            }
        }

        // trojan://
        else if (line.startsWith('trojan://')) {
            const match = line.match(/@([^:]+):/);
            if (match) {
                const ip = match[1];
                const nameMatch = line.match(/#([^&]+)/);
                const name = nameMatch ? decodeURIComponent(nameMatch[1]) : 'Unknown';
                return {
                    name: name,
                    ip: ip,
                    protocol: 'trojan'
                };
            }
        }

        // ss://
        else if (line.startsWith('ss://')) {
            const match = line.match(/@([^:]+):/);
            if (match) {
                const ip = match[1];
                const nameMatch = line.match(/#([^&]+)/);
                const name = nameMatch ? decodeURIComponent(nameMatch[1]) : 'Unknown';
                return {
                    name: name,
                    ip: ip,
                    protocol: 'ss'
                };
            }
        }

        // 直接IP地址
        else if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(line)) {
            return {
                name: 'Direct-' + line,
                ip: line,
                protocol: 'direct'
            };
        }

    } catch (error) {
        console.warn('Failed to parse node line: ' + line, error);
    }

    return null;
}

// 转换为YAML格式
function convertToYAML(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let yaml = '';

    if (Array.isArray(obj)) {
        obj.forEach(function(item) {
            if (typeof item === 'object' && item !== null) {
                yaml += spaces + '- ' + convertToYAML(item, indent + 1).trim() + '\n';
            } else {
                yaml += spaces + '- ' + item + '\n';
            }
        });
    } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(function(entry) {
            var key = entry[0];
            var value = entry[1];
            if (Array.isArray(value)) {
                yaml += spaces + key + ':\n';
                yaml += convertToYAML(value, indent + 1);
            } else if (typeof value === 'object' && value !== null) {
                yaml += spaces + key + ':\n';
                yaml += convertToYAML(value, indent + 1);
            } else {
                yaml += spaces + key + ': ' + value + '\n';
            }
        });
    } else {
        yaml = String(obj);
    }

    return yaml;
}

// 聚合和排序IP地址
async function aggregateAndRankIPs(env) {
    try {
        // 获取默认订阅链接
        const defaultSubscriptions = [
            'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge_base64.txt',
            'https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list.txt',
            'https://raw.githubusercontent.com/freefq/free/master/v2'
        ];

        // 从KV存储获取用户自定义订阅（如果有）
        let customSubscriptions = [];
        if (env.IP_CACHE) {
            try {
                const customData = await env.IP_CACHE.get('custom_subscriptions');
                if (customData) {
                    customSubscriptions = JSON.parse(customData);
                }
            } catch (e) {
                console.warn('Failed to load custom subscriptions:', e);
            }
        }

        const allSubscriptions = [...defaultSubscriptions, ...customSubscriptions];
        const ipMap = new Map(); // 用于去重，key为IP，value为节点信息

        // 处理每个订阅链接
        for (const url of allSubscriptions) {
            try {
                console.log('Processing subscription:', url);
                const ips = await extractIPsFromSubscription(url);

                for (const ipData of ips) {
                    const ip = ipData.ip;
                    if (!ip || !isValidIP(ip)) continue;

                    // 如果IP已存在，选择更好的节点信息
                    if (ipMap.has(ip)) {
                        const existing = ipMap.get(ip);
                        // 优先保留有名称的节点
                        if (!existing.name || existing.name.startsWith('Direct-')) {
                            ipMap.set(ip, ipData);
                        }
                    } else {
                        ipMap.set(ip, ipData);
                    }
                }
            } catch (error) {
                console.warn('Failed to process subscription ' + url + ':', error.message);
            }
        }

        // 转换为数组并检测纯净度
        const allNodes = Array.from(ipMap.values());
        console.log('Total unique IPs found:', allNodes.length);

        // 批量检测IP纯净度
        const rankedNodes = await batchCheckIPPurity(allNodes, env);

        // 按纯净度排序（纯净的在前，风险评分低的在前）
        rankedNodes.sort((a, b) => {
            if (a.isPure !== b.isPure) {
                return b.isPure ? 1 : -1; // 纯净的在前
            }
            return (a.riskScore || 100) - (b.riskScore || 100); // 风险评分低的在前
        });

        // 返回前100个最佳IP
        const topNodes = rankedNodes.slice(0, 100);
        console.log('Selected top nodes:', topNodes.length, 'pure nodes:', topNodes.filter(n => n.isPure).length);

        return topNodes;

    } catch (error) {
        console.error('Aggregate and rank IPs error:', error);
        return [];
    }
}

// 批量检测IP纯净度
async function batchCheckIPPurity(nodes, env) {
    const results = [];
    const batchSize = 10; // 每批处理10个IP

    for (let i = 0; i < nodes.length; i += batchSize) {
        const batch = nodes.slice(i, i + batchSize);
        const batchPromises = batch.map(async (node) => {
            try {
                const purityData = await checkSingleIPPurity(node.ip, env);
                return {
                    ...node,
                    ...purityData
                };
            } catch (error) {
                console.warn('Failed to check IP purity for ' + node.ip + ':', error.message);
                return {
                    ...node,
                    isPure: false,
                    riskScore: 100,
                    provider: 'unknown'
                };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // 添加延迟避免API限制
        if (i + batchSize < nodes.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results;
}

// 检测单个IP纯净度
async function checkSingleIPPurity(ip, env) {
    // 优先使用ProxyCheck.io
    if (env.PROXYCHECK_API_KEY) {
        try {
            const response = await fetch('https://proxycheck.io/v2/' + ip + '?vpn=1&asn=1&risk=1&time=1&inf=0&key=' + env.PROXYCHECK_API_KEY);
            const data = await response.json();

            if (data[ip]) {
                const ipData = data[ip];
                return {
                    isPure: ipData.proxy === 'no' && ipData.type !== 'VPN',
                    riskScore: ipData.risk || 0,
                    proxyType: ipData.proxy === 'yes' ? ipData.type : 'none',
                    country: ipData.country,
                    provider: 'proxycheck.io'
                };
            }
        } catch (error) {
            console.warn('ProxyCheck.io error for ' + ip + ':', error.message);
        }
    }

    // 备用：使用IPinfo.io
    if (env.IPINFO_TOKEN) {
        try {
            const response = await fetch('https://ipinfo.io/' + ip + '/json', {
                headers: {
                    'Authorization': 'Bearer ' + env.IPINFO_TOKEN
                }
            });
            const data = await response.json();

            if (data.ip) {
                return {
                    isPure: !data.privacy?.hosting && !data.privacy?.vpn && !data.privacy?.proxy,
                    riskScore: data.privacy?.hosting ? 80 : (data.privacy?.vpn || data.privacy?.proxy ? 60 : 0),
                    proxyType: data.privacy?.vpn ? 'VPN' : (data.privacy?.proxy ? 'Proxy' : 'none'),
                    country: data.country,
                    provider: 'ipinfo.io'
                };
            }
        } catch (error) {
            console.warn('IPinfo.io error for ' + ip + ':', error.message);
        }
    }

    // 最后备用：使用ip-api.com
    try {
        const response = await fetch('http://ip-api.com/json/' + ip + '?fields=status,message,country,city,isp,org,proxy,hosting');
        const data = await response.json();

        if (data.status === 'success') {
            return {
                isPure: !data.proxy && !data.hosting,
                riskScore: data.hosting ? 70 : (data.proxy ? 50 : 0),
                proxyType: data.proxy ? 'Proxy' : 'none',
                country: data.country,
                provider: 'ip-api.com'
            };
        }
    } catch (error) {
        console.warn('ip-api.com error for ' + ip + ':', error.message);
    }

    // 如果所有API都失败，返回默认值
    return {
        isPure: false,
        riskScore: 100,
        proxyType: 'unknown',
        country: 'Unknown',
        provider: 'none'
    };
}

// 生成优化的Clash配置
async function generateOptimizedClashConfig(rankedNodes, env) {
    const pureNodes = rankedNodes.filter(node => node.isPure);
    const countries = {};

    // 按国家分组
    pureNodes.forEach(node => {
        const country = node.country || 'Unknown';
        if (!countries[country]) {
            countries[country] = [];
        }
        countries[country].push(node);
    });

    const proxies = [];
    const proxyGroups = [
        {
            name: '🚀 节点选择',
            type: 'select',
            proxies: ['♻️ 自动选择', '🔯 故障转移', '🎯 全球直连']
        },
        {
            name: '♻️ 自动选择',
            type: 'url-test',
            proxies: [],
            url: 'http://www.gstatic.com/generate_204',
            interval: 300,
            tolerance: 50
        },
        {
            name: '🔯 故障转移',
            type: 'fallback',
            proxies: [],
            url: 'http://www.gstatic.com/generate_204',
            interval: 300
        },
        {
            name: '🎯 全球直连',
            type: 'select',
            proxies: ['DIRECT']
        }
    ];

    // 为每个国家创建代理组
    Object.entries(countries).forEach(function(entry) {
        const country = entry[0];
        const nodes = entry[1];
        if (nodes.length === 0) return;

        const countryFlag = getCountryFlag(country);
        const groupName = countryFlag + ' ' + country;

        // 添加国家代理组
        proxyGroups.push({
            name: groupName,
            type: 'url-test',
            proxies: [],
            url: 'http://www.gstatic.com/generate_204',
            interval: 300
        });

        // 添加该国家的节点
        nodes.slice(0, 10).forEach(function(node, index) { // 每个国家最多10个节点
            const proxyName = countryFlag + ' ' + country + '-' + (index + 1);
            const proxyConfig = createOptimizedProxyConfig(node, proxyName);

            if (proxyConfig) {
                proxies.push(proxyConfig);

                // 添加到国家组
                const countryGroup = proxyGroups.find(g => g.name === groupName);
                if (countryGroup) {
                    countryGroup.proxies.push(proxyName);
                }

                // 添加到主要代理组
                if (proxyGroups[1].proxies.length < 50) { // 自动选择组最多50个节点
                    proxyGroups[1].proxies.push(proxyName);
                }
                if (proxyGroups[2].proxies.length < 30) { // 故障转移组最多30个节点
                    proxyGroups[2].proxies.push(proxyName);
                }
            }
        });

        // 将国家组添加到节点选择
        proxyGroups[0].proxies.push(groupName);
    });

    return {
        port: 7890,
        'socks-port': 7891,
        'allow-lan': false,
        mode: 'Rule',
        'log-level': 'info',
        'external-controller': '127.0.0.1:9090',

        dns: {
            enable: true,
            listen: '0.0.0.0:53',
            'default-nameserver': ['223.5.5.5', '119.29.29.29'],
            nameserver: ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
            'fallback-filter': {
                geoip: true,
                'geoip-code': 'CN'
            }
        },

        proxies: proxies,
        'proxy-groups': proxyGroups,

        rules: [
            'DOMAIN-SUFFIX,googlesyndication.com,REJECT',
            'DOMAIN-SUFFIX,googleadservices.com,REJECT',
            'DOMAIN-SUFFIX,doubleclick.net,REJECT',
            'DOMAIN-SUFFIX,bilibili.com,🎯 全球直连',
            'DOMAIN-SUFFIX,hdslb.com,🎯 全球直连',
            'DOMAIN-SUFFIX,youtube.com,🚀 节点选择',
            'DOMAIN-SUFFIX,netflix.com,🚀 节点选择',
            'DOMAIN-SUFFIX,twitter.com,🚀 节点选择',
            'DOMAIN-SUFFIX,facebook.com,🚀 节点选择',
            'DOMAIN-SUFFIX,instagram.com,🚀 节点选择',
            'DOMAIN-SUFFIX,telegram.org,🚀 节点选择',
            'DOMAIN-SUFFIX,local,🎯 全球直连',
            'IP-CIDR,127.0.0.0/8,🎯 全球直连',
            'IP-CIDR,172.16.0.0/12,🎯 全球直连',
            'IP-CIDR,192.168.0.0/16,🎯 全球直连',
            'IP-CIDR,10.0.0.0/8,🎯 全球直连',
            'GEOIP,CN,🎯 全球直连',
            'MATCH,🚀 节点选择'
        ],

        _meta: {
            generated_at: new Date().toISOString(),
            total_nodes: proxies.length,
            pure_nodes: pureNodes.length,
            countries: Object.keys(countries).length,
            source: 'IP Purity Checker - Optimized',
            description: 'Auto-generated Clash config with top ' + pureNodes.length + ' pure IPs'
        }
    };
}

// 创建优化的代理配置
function createOptimizedProxyConfig(node, name) {
    // 根据协议类型创建相应的代理配置
    const baseConfig = {
        name: name,
        server: node.ip,
        port: node.port || 80
    };

    switch (node.protocol) {
        case 'vmess':
            return {
                ...baseConfig,
                type: 'vmess',
                uuid: node.uuid || '00000000-0000-0000-0000-000000000000',
                alterId: node.alterId || 0,
                cipher: node.cipher || 'auto'
            };
        case 'vless':
            return {
                ...baseConfig,
                type: 'vless',
                uuid: node.uuid || '00000000-0000-0000-0000-000000000000'
            };
        case 'trojan':
            return {
                ...baseConfig,
                type: 'trojan',
                password: node.password || 'password'
            };
        case 'ss':
            return {
                ...baseConfig,
                type: 'ss',
                cipher: node.cipher || 'aes-256-gcm',
                password: node.password || 'password'
            };
        default:
            // 对于未知协议或直接IP，创建HTTP代理
            return {
                ...baseConfig,
                type: 'http'
            };
    }
}

// 获取国家旗帜emoji
function getCountryFlag(country) {
    const flags = {
        'US': '🇺🇸', 'CN': '🇨🇳', 'JP': '🇯🇵', 'KR': '🇰🇷',
        'SG': '🇸🇬', 'HK': '🇭🇰', 'TW': '🇹🇼', 'GB': '🇬🇧',
        'DE': '🇩🇪', 'FR': '🇫🇷', 'CA': '🇨🇦', 'AU': '🇦🇺',
        'RU': '🇷🇺', 'IN': '🇮🇳', 'BR': '🇧🇷', 'NL': '🇳🇱',
        'IT': '🇮🇹', 'ES': '🇪🇸', 'SE': '🇸🇪', 'NO': '🇳🇴',
        'FI': '🇫🇮', 'DK': '🇩🇰', 'CH': '🇨🇭', 'AT': '🇦🇹'
    };
    return flags[country] || '🌍';
}

// 验证IP地址格式
function isValidIP(ip) {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
}
