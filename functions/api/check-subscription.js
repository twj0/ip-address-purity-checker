/**
 * Cloudflare Pages Function: 订阅链接检测API
 * 解析代理订阅并批量检测IP纯净度
 */

export async function onRequestPost(context) {
    const { request, env } = context;
    
    // CORS处理
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-ProxyCheck-Key, X-IPInfo-Token',
        'Content-Type': 'application/json'
    };
    
    try {
        // 解析请求体
        const formData = await request.formData();
        const urls = formData.getAll('urls');
        const generateClash = formData.get('generate_clash') === 'true';
        
        if (!urls || urls.length === 0) {
            return new Response(JSON.stringify({
                error: 'No subscription URLs provided',
                usage: 'POST with form data: urls=https://example.com/sub'
            }), {
                status: 400,
                headers: corsHeaders
            });
        }
        
        // 获取API密钥
        const proxycheckKey = request.headers.get('X-ProxyCheck-Key') || env.PROXYCHECK_API_KEY;
        const ipinfoToken = request.headers.get('X-IPInfo-Token') || env.IPINFO_TOKEN;
        
        console.log(`Processing ${urls.length} subscription URLs`);
        
        // 解析所有订阅链接
        const allNodes = [];
        for (const url of urls) {
            try {
                const nodes = await parseSubscriptionURL(url.trim());
                allNodes.push(...nodes);
                console.log(`Parsed ${nodes.length} nodes from ${url}`);
            } catch (error) {
                console.warn(`Failed to parse subscription ${url}:`, error.message);
            }
        }
        
        if (allNodes.length === 0) {
            return new Response(JSON.stringify({
                error: 'No valid nodes found in subscriptions',
                urls_processed: urls.length
            }), {
                status: 404,
                headers: corsHeaders
            });
        }
        
        // 去重（基于IP地址）
        const uniqueNodes = [];
        const seenIPs = new Set();
        
        for (const node of allNodes) {
            if (node.ip && !seenIPs.has(node.ip)) {
                seenIPs.add(node.ip);
                uniqueNodes.push(node);
            }
        }
        
        console.log(`Found ${uniqueNodes.length} unique nodes after deduplication`);
        
        // 批量检测IP纯净度（限制并发数）
        const results = [];
        const pureNodes = [];
        const batchSize = 5; // 限制并发数避免速率限制
        
        for (let i = 0; i < uniqueNodes.length; i += batchSize) {
            const batch = uniqueNodes.slice(i, i + batchSize);
            const batchPromises = batch.map(node => checkNodePurity(node, proxycheckKey, ipinfoToken));
            
            const batchResults = await Promise.allSettled(batchPromises);
            
            for (let j = 0; j < batchResults.length; j++) {
                const result = batchResults[j];
                if (result.status === 'fulfilled' && result.value) {
                    results.push(result.value);
                    if (result.value.isPure) {
                        pureNodes.push(batch[j]);
                    }
                } else {
                    // 处理失败的检测
                    const node = batch[j];
                    results.push({
                        name: node.name,
                        ip: node.ip,
                        isPure: false,
                        error: result.reason?.message || 'Detection failed'
                    });
                }
            }
            
            // 添加延迟避免速率限制
            if (i + batchSize < uniqueNodes.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // 统计结果
        const total = results.length;
        const pureCount = pureNodes.length;
        const purityRate = total > 0 ? ((pureCount / total) * 100).toFixed(1) : '0.0';
        
        const responseData = {
            total: total,
            pure: pureCount,
            nonPure: total - pureCount,
            purityRate: purityRate,
            results: results,
            timestamp: new Date().toISOString()
        };
        
        // 生成Clash配置（如果请求）
        if (generateClash && pureNodes.length > 0) {
            try {
                const clashConfig = generateClashConfig(pureNodes);
                responseData.clashConfig = clashConfig;
            } catch (error) {
                console.warn('Failed to generate Clash config:', error);
            }
        }
        
        return new Response(JSON.stringify(responseData), {
            headers: corsHeaders
        });
        
    } catch (error) {
        console.error('Error in subscription check:', error);
        return new Response(JSON.stringify({
            error: 'Internal server error',
            message: error.message,
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

// 解析订阅链接
async function parseSubscriptionURL(url) {
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
        
        return nodes;
        
    } catch (error) {
        throw new Error(`Failed to parse subscription ${url}: ${error.message}`);
    }
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
                name: `Direct-${line}`,
                ip: line,
                protocol: 'direct'
            };
        }
        
    } catch (error) {
        console.warn(`Failed to parse node line: ${line}`, error);
    }
    
    return null;
}

// 检查单个节点的纯净度
async function checkNodePurity(node, proxycheckKey, ipinfoToken) {
    const ip = node.ip;
    
    // 优先使用ProxyCheck.io
    let ipInfo = await checkIPWithProxyCheck(ip, proxycheckKey);
    
    // 回退到IPinfo.io
    if (!ipInfo) {
        ipInfo = await checkIPWithIPInfo(ip, ipinfoToken);
    }
    
    // 最后回退到ip-api.com
    if (!ipInfo) {
        ipInfo = await checkIPWithIPAPI(ip);
    }
    
    if (ipInfo) {
        return {
            name: node.name,
            ip: ip,
            isPure: ipInfo.isPure,
            country: ipInfo.country || '',
            city: ipInfo.city || '',
            org: ipInfo.org || '',
            privacy: ipInfo.privacy || {},
            risk_score: ipInfo.risk_score || 0,
            provider: ipInfo.provider || 'unknown',
            timestamp: new Date().toISOString()
        };
    } else {
        throw new Error('All IP detection services failed');
    }
}

// 生成Clash配置文件
function generateClashConfig(pureNodes) {
    const config = {
        port: 7890,
        'socks-port': 7891,
        'allow-lan': false,
        mode: 'Rule',
        'log-level': 'info',
        'external-controller': '127.0.0.1:9090',
        proxies: [],
        'proxy-groups': [
            {
                name: '✈️ PROXY',
                type: 'select',
                proxies: ['⚡ AUTO', '✅ PURE']
            },
            {
                name: '⚡ AUTO',
                type: 'url-test',
                proxies: [],
                url: 'http://www.gstatic.com/generate_204',
                interval: 300
            },
            {
                name: '✅ PURE',
                type: 'select',
                proxies: []
            }
        ],
        rules: [
            'DOMAIN-SUFFIX,local,DIRECT',
            'IP-CIDR,127.0.0.0/8,DIRECT',
            'IP-CIDR,172.16.0.0/12,DIRECT',
            'IP-CIDR,192.168.0.0/16,DIRECT',
            'IP-CIDR,10.0.0.0/8,DIRECT',
            'GEOIP,CN,DIRECT',
            'MATCH,✈️ PROXY'
        ]
    };
    
    // 添加纯净节点到配置
    for (const node of pureNodes.slice(0, 50)) { // 限制节点数量
        const proxyName = `${node.name}-${node.ip}`.substring(0, 50);
        
        // 简化的代理配置
        const proxyConfig = {
            name: proxyName,
            type: 'http',
            server: node.ip,
            port: 80
        };
        
        config.proxies.push(proxyConfig);
        config['proxy-groups'][1].proxies.push(proxyName); // AUTO组
        config['proxy-groups'][2].proxies.push(proxyName); // PURE组
    }
    
    // 转换为YAML格式字符串
    return `# Clash配置文件 - 纯净节点
# 生成时间: ${new Date().toISOString()}
# 纯净节点数量: ${pureNodes.length}

${JSON.stringify(config, null, 2)}`;
}

// 重用check-ip.js中的检测函数
async function checkIPWithProxyCheck(ip, apiKey) {
    // ... (与check-ip.js中相同的实现)
    // 为了避免重复，这里省略具体实现
    // 实际部署时需要复制完整的函数实现
    return null; // 临时返回，实际需要完整实现
}

async function checkIPWithIPInfo(ip, token) {
    // ... (与check-ip.js中相同的实现)
    return null; // 临时返回，实际需要完整实现
}

async function checkIPWithIPAPI(ip) {
    // ... (与check-ip.js中相同的实现)
    return null; // 临时返回，实际需要完整实现
}
