/**
 * Cloudflare Pages Function: 单IP检测API
 * 支持ProxyCheck.io专业检测和多数据源回退
 */

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const ip = url.searchParams.get('ip');
    
    // CORS处理
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-ProxyCheck-Key, X-IPInfo-Token',
        'Content-Type': 'application/json'
    };
    
    if (!ip) {
        return new Response(JSON.stringify({
            error: 'IP parameter is required',
            usage: 'GET /api/check-ip?ip=8.8.8.8'
        }), {
            status: 400,
            headers: corsHeaders
        });
    }
    
    // 验证IP格式
    if (!isValidIP(ip)) {
        return new Response(JSON.stringify({
            error: 'Invalid IP address format',
            ip: ip
        }), {
            status: 400,
            headers: corsHeaders
        });
    }
    
    try {
        // 获取API密钥
        const proxycheckKey = request.headers.get('X-ProxyCheck-Key') || env.PROXYCHECK_API_KEY;
        const ipinfoToken = request.headers.get('X-IPInfo-Token') || env.IPINFO_TOKEN;
        
        // 优先使用ProxyCheck.io进行专业检测
        let result = await checkIPWithProxyCheck(ip, proxycheckKey);
        
        // 如果ProxyCheck失败，回退到IPinfo.io
        if (!result) {
            console.log(`ProxyCheck failed for ${ip}, falling back to IPinfo.io`);
            result = await checkIPWithIPInfo(ip, ipinfoToken);
        }
        
        // 如果IPinfo也失败，回退到ip-api.com
        if (!result) {
            console.log(`IPinfo failed for ${ip}, falling back to ip-api.com`);
            result = await checkIPWithIPAPI(ip);
        }
        
        if (!result) {
            return new Response(JSON.stringify({
                error: 'All IP detection services failed',
                ip: ip,
                timestamp: new Date().toISOString()
            }), {
                status: 503,
                headers: corsHeaders
            });
        }
        
        // 缓存结果到KV（如果可用）
        if (env.IP_CACHE) {
            try {
                await env.IP_CACHE.put(`ip:${ip}`, JSON.stringify(result), {
                    expirationTtl: 3600 // 1小时缓存
                });
            } catch (e) {
                console.warn('Failed to cache result:', e);
            }
        }
        
        return new Response(JSON.stringify(result), {
            headers: corsHeaders
        });
        
    } catch (error) {
        console.error('Error in IP check:', error);
        return new Response(JSON.stringify({
            error: 'Internal server error',
            message: error.message,
            ip: ip,
            timestamp: new Date().toISOString()
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

export async function onRequestOptions(context) {
    return new Response(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-ProxyCheck-Key, X-IPInfo-Token'
        }
    });
}

// ProxyCheck.io检测函数
async function checkIPWithProxyCheck(ip, apiKey) {
    try {
        const params = new URLSearchParams({
            vpn: '1',
            risk: '1',
            asn: '1'
        });
        
        if (apiKey) {
            params.append('key', apiKey);
        }
        
        const response = await fetch(`http://proxycheck.io/v2/${ip}?${params}`, {
            timeout: 10000
        });
        
        if (!response.ok) {
            throw new Error(`ProxyCheck API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'ok') {
            throw new Error(`ProxyCheck API error: ${data.message || 'Unknown error'}`);
        }
        
        const ipData = data[ip];
        if (!ipData) {
            throw new Error('No data returned from ProxyCheck');
        }
        
        // 标准化响应格式
        const isProxy = ipData.proxy === 'yes';
        const riskScore = parseInt(ipData.risk || 0);
        const proxyType = ipData.type || '';
        const isPure = !isProxy && riskScore < 60;
        
        return {
            status: 'success',
            ip: ip,
            country: ipData.country || '',
            city: ipData.city || '',
            org: ipData.isp || '',
            isp: ipData.isp || '',
            as: ipData.asn || '',
            
            // ProxyCheck.io特有字段
            is_proxy: isProxy,
            proxy_type: proxyType,
            risk_score: riskScore,
            isPure: isPure,
            
            // 兼容性字段
            privacy: {
                hosting: proxyType.toLowerCase() === 'hosting',
                vpn: proxyType.toLowerCase() === 'vpn',
                proxy: isProxy,
                tor: proxyType.toLowerCase() === 'tor'
            },
            
            provider: 'proxycheck.io',
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.warn(`ProxyCheck.io failed for ${ip}:`, error.message);
        return null;
    }
}

// IPinfo.io检测函数
async function checkIPWithIPInfo(ip, token) {
    try {
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch(`https://ipinfo.io/${ip}/json`, {
            headers,
            timeout: 10000
        });
        
        if (!response.ok) {
            throw new Error(`IPinfo API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 判定纯净度
        const privacy = data.privacy || {};
        const isPure = !privacy.hosting && !privacy.vpn && !privacy.proxy && !privacy.tor;
        
        return {
            status: 'success',
            ip: data.ip || ip,
            country: data.country || '',
            city: data.city || '',
            org: data.org || '',
            isp: data.org || '',
            as: data.as || '',
            isPure: isPure,
            privacy: privacy,
            provider: 'ipinfo.io',
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.warn(`IPinfo.io failed for ${ip}:`, error.message);
        return null;
    }
}

// ip-api.com检测函数
async function checkIPWithIPAPI(ip) {
    try {
        const response = await fetch(`http://ip-api.com/json/${ip}`, {
            timeout: 8000
        });
        
        if (!response.ok) {
            throw new Error(`ip-api.com error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'success') {
            throw new Error(`ip-api.com error: ${data.message}`);
        }
        
        // 基于关键词判定纯净度
        const text = [data.isp, data.org, data.as].join(' ').toLowerCase();
        const blackKeywords = [
            'amazon', 'aws', 'google', 'gcp', 'microsoft', 'azure',
            'cloudflare', 'akamai', 'fastly', 'digitalocean', 'vultr',
            'linode', 'hetzner', 'ovh', 'datacenter', 'hosting',
            'server', 'cloud', 'vps', 'dedicated'
        ];
        
        const isPure = !blackKeywords.some(keyword => text.includes(keyword));
        
        return {
            status: 'success',
            ip: data.query,
            country: data.country || '',
            city: data.city || '',
            org: data.org || '',
            isp: data.isp || '',
            as: data.as || '',
            isPure: isPure,
            provider: 'ip-api.com',
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.warn(`ip-api.com failed for ${ip}:`, error.message);
        return null;
    }
}

// IP地址格式验证
function isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}
