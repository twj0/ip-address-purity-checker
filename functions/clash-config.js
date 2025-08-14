/**
 * Cloudflare Pages Function: 每日Clash配置生成
 * 自动生成包含纯净IP的Clash配置文件
 */

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'yaml';
    
    try {
        // 从KV存储获取最新的检测结果
        const clashConfig = await generateClashConfig(env);
        
        if (!clashConfig) {
            return new Response('Clash配置暂未生成，请稍后再试', {
                status: 503,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-cache'
                }
            });
        }
        
        // 设置适当的响应头
        const headers = {
            'Content-Type': format === 'json' ? 'application/json' : 'text/yaml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600', // 缓存1小时
            'Last-Modified': new Date().toUTCString(),
            'Access-Control-Allow-Origin': '*'
        };
        
        // 根据格式返回配置
        if (format === 'json') {
            return new Response(JSON.stringify(clashConfig, null, 2), { headers });
        } else {
            const yamlContent = convertToYAML(clashConfig);
            return new Response(yamlContent, { headers });
        }
        
    } catch (error) {
        console.error('Generate Clash config error:', error);
        return new Response(`生成Clash配置失败: ${error.message}`, {
            status: 500,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8'
            }
        });
    }
}

// 生成Clash配置
async function generateClashConfig(env) {
    try {
        if (!env.IP_CACHE) {
            throw new Error('KV storage not available');
        }
        
        // 获取最新的检测结果
        const lastResultData = await env.IP_CACHE.get('last_check_result');
        if (!lastResultData) {
            return null;
        }
        
        const lastResult = JSON.parse(lastResultData);
        const pureIPs = lastResult.pureIPs || [];
        
        if (pureIPs.length === 0) {
            throw new Error('No pure IPs available');
        }
        
        // 获取详细的节点信息
        const pureNodes = [];
        for (const ip of pureIPs.slice(0, 100)) { // 限制节点数量
            try {
                const nodeData = await env.IP_CACHE.get(`node:${ip}`);
                if (nodeData) {
                    const node = JSON.parse(nodeData);
                    if (node.isPure) {
                        pureNodes.push(node);
                    }
                }
            } catch (e) {
                console.warn(`Failed to get node data for ${ip}:`, e);
            }
        }
        
        // 按国家分组节点
        const nodesByCountry = groupNodesByCountry(pureNodes);
        
        // 生成Clash配置
        const clashConfig = {
            port: 7890,
            'socks-port': 7891,
            'allow-lan': false,
            mode: 'Rule',
            'log-level': 'info',
            'external-controller': '127.0.0.1:9090',
            
            // DNS配置
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
            
            // 代理配置
            proxies: [],
            
            // 代理组配置
            'proxy-groups': [
                {
                    name: '🚀 节点选择',
                    type: 'select',
                    proxies: ['♻️ 自动选择', '🔯 故障转移', '🔮 负载均衡', 'DIRECT']
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
                    name: '🔮 负载均衡',
                    type: 'load-balance',
                    proxies: [],
                    url: 'http://www.gstatic.com/generate_204',
                    interval: 300,
                    strategy: 'consistent-hashing'
                },
                {
                    name: '🌍 国外媒体',
                    type: 'select',
                    proxies: ['🚀 节点选择', '♻️ 自动选择', '🎯 全球直连']
                },
                {
                    name: '📺 哔哩哔哩',
                    type: 'select',
                    proxies: ['🎯 全球直连', '🚀 节点选择']
                },
                {
                    name: '🎯 全球直连',
                    type: 'select',
                    proxies: ['DIRECT', '🚀 节点选择']
                },
                {
                    name: '🛑 广告拦截',
                    type: 'select',
                    proxies: ['REJECT', 'DIRECT']
                },
                {
                    name: '🐟 漏网之鱼',
                    type: 'select',
                    proxies: ['🚀 节点选择', '🎯 全球直连', '♻️ 自动选择']
                }
            ],
            
            // 规则配置
            rules: [
                // 广告拦截
                'DOMAIN-SUFFIX,googlesyndication.com,🛑 广告拦截',
                'DOMAIN-SUFFIX,googleadservices.com,🛑 广告拦截',
                'DOMAIN-SUFFIX,doubleclick.net,🛑 广告拦截',
                
                // 哔哩哔哩
                'DOMAIN-SUFFIX,bilibili.com,📺 哔哩哔哩',
                'DOMAIN-SUFFIX,hdslb.com,📺 哔哩哔哩',
                'DOMAIN-SUFFIX,biliapi.net,📺 哔哩哔哩',
                
                // 国外媒体
                'DOMAIN-SUFFIX,youtube.com,🌍 国外媒体',
                'DOMAIN-SUFFIX,netflix.com,🌍 国外媒体',
                'DOMAIN-SUFFIX,twitter.com,🌍 国外媒体',
                'DOMAIN-SUFFIX,facebook.com,🌍 国外媒体',
                'DOMAIN-SUFFIX,instagram.com,🌍 国外媒体',
                'DOMAIN-SUFFIX,telegram.org,🌍 国外媒体',
                
                // 本地网络
                'DOMAIN-SUFFIX,local,🎯 全球直连',
                'IP-CIDR,127.0.0.0/8,🎯 全球直连',
                'IP-CIDR,172.16.0.0/12,🎯 全球直连',
                'IP-CIDR,192.168.0.0/16,🎯 全球直连',
                'IP-CIDR,10.0.0.0/8,🎯 全球直连',
                
                // 中国大陆
                'GEOIP,CN,🎯 全球直连',
                
                // 其他
                'MATCH,🐟 漏网之鱼'
            ]
        };
        
        // 添加代理节点
        const allProxyNames = [];
        
        // 为每个国家创建代理组
        Object.entries(nodesByCountry).forEach(([country, nodes]) => {
            if (nodes.length === 0) return;
            
            const countryFlag = getCountryFlag(country);
            const groupName = `${countryFlag} ${country}`;
            
            // 添加国家代理组
            clashConfig['proxy-groups'].push({
                name: groupName,
                type: 'url-test',
                proxies: [],
                url: 'http://www.gstatic.com/generate_204',
                interval: 300
            });
            
            // 添加该国家的节点
            nodes.forEach((node, index) => {
                const proxyName = `${countryFlag} ${country}-${index + 1}`;
                const proxyConfig = createProxyConfig(node, proxyName);
                
                if (proxyConfig) {
                    clashConfig.proxies.push(proxyConfig);
                    allProxyNames.push(proxyName);
                    
                    // 添加到国家组
                    const countryGroup = clashConfig['proxy-groups'].find(g => g.name === groupName);
                    if (countryGroup) {
                        countryGroup.proxies.push(proxyName);
                    }
                }
            });
            
            // 将国家组添加到主要代理组
            if (clashConfig['proxy-groups'].find(g => g.name === groupName)?.proxies.length > 0) {
                clashConfig['proxy-groups'][0].proxies.push(groupName); // 节点选择
            }
        });
        
        // 将所有节点添加到自动选择组
        clashConfig['proxy-groups'][1].proxies = allProxyNames.slice(0, 50); // 限制自动选择组节点数量
        clashConfig['proxy-groups'][2].proxies = allProxyNames.slice(0, 30); // 限制故障转移组节点数量
        clashConfig['proxy-groups'][3].proxies = allProxyNames.slice(0, 20); // 限制负载均衡组节点数量
        
        // 添加生成信息
        clashConfig._meta = {
            generated_at: new Date().toISOString(),
            total_nodes: allProxyNames.length,
            countries: Object.keys(nodesByCountry).length,
            pure_rate: lastResult.purityRate || '0%',
            source: 'IP Purity Checker - Cloudflare Pages',
            update_url: 'https://your-domain.pages.dev/clash-config.yaml'
        };
        
        return clashConfig;
        
    } catch (error) {
        console.error('Generate Clash config error:', error);
        throw error;
    }
}

// 按国家分组节点
function groupNodesByCountry(nodes) {
    const groups = {};
    
    nodes.forEach(node => {
        const country = node.country || 'Unknown';
        if (!groups[country]) {
            groups[country] = [];
        }
        groups[country].push(node);
    });
    
    return groups;
}

// 获取国家旗帜emoji
function getCountryFlag(country) {
    const flags = {
        'US': '🇺🇸', 'CN': '🇨🇳', 'JP': '🇯🇵', 'KR': '🇰🇷',
        'SG': '🇸🇬', 'HK': '🇭🇰', 'TW': '🇹🇼', 'GB': '🇬🇧',
        'DE': '🇩🇪', 'FR': '🇫🇷', 'CA': '🇨🇦', 'AU': '🇦🇺',
        'RU': '🇷🇺', 'IN': '🇮🇳', 'BR': '🇧🇷', 'NL': '🇳🇱'
    };
    return flags[country] || '🌍';
}

// 创建代理配置
function createProxyConfig(node, name) {
    // 简化的代理配置，实际应根据节点类型生成
    return {
        name: name,
        type: 'http', // 简化为HTTP代理
        server: node.ip,
        port: 80,
        username: '',
        password: ''
    };
}

// 转换为YAML格式
function convertToYAML(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let yaml = '';
    
    if (Array.isArray(obj)) {
        obj.forEach(item => {
            if (typeof item === 'object' && item !== null) {
                yaml += `${spaces}- ${convertToYAML(item, indent + 1).trim()}\n`;
            } else {
                yaml += `${spaces}- ${item}\n`;
            }
        });
    } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                yaml += `${spaces}${key}:\n`;
                yaml += convertToYAML(value, indent + 1);
            } else if (typeof value === 'object' && value !== null) {
                yaml += `${spaces}${key}:\n`;
                yaml += convertToYAML(value, indent + 1);
            } else {
                yaml += `${spaces}${key}: ${value}\n`;
            }
        });
    } else {
        yaml = `${obj}`;
    }
    
    return yaml;
}
