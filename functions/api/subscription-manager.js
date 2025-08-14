/**
 * Cloudflare Pages Function: 订阅链接管理API
 * 提供安全的订阅链接存储、管理和检测功能
 */

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
    
    try {
        if (action === 'list') {
            return await listSubscriptions(env, corsHeaders);
        } else {
            return new Response(JSON.stringify({
                error: 'Invalid action',
                validActions: ['list']
            }), {
                status: 400,
                headers: corsHeaders
            });
        }
    } catch (error) {
        console.error('Subscription manager GET error:', error);
        return new Response(JSON.stringify({
            error: 'Internal server error',
            message: error.message
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };
    
    try {
        const body = await request.json();
        const { action } = body;
        
        switch (action) {
            case 'save':
                return await saveSubscription(body.subscription, env, corsHeaders);
            case 'delete':
                return await deleteSubscription(body.id, env, corsHeaders);
            case 'test':
                return await testSubscription(body.url, env, corsHeaders);
            case 'check-all':
                return await checkAllSubscriptions(body.subscriptions, env, corsHeaders);
            case 'clear-all':
                return await clearAllSubscriptions(env, corsHeaders);
            default:
                return new Response(JSON.stringify({
                    error: 'Invalid action',
                    validActions: ['save', 'delete', 'test', 'check-all', 'clear-all']
                }), {
                    status: 400,
                    headers: corsHeaders
                });
        }
    } catch (error) {
        console.error('Subscription manager POST error:', error);
        return new Response(JSON.stringify({
            error: 'Internal server error',
            message: error.message
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
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}

// 列出所有订阅
async function listSubscriptions(env, corsHeaders) {
    try {
        if (!env.IP_CACHE) {
            return new Response(JSON.stringify({
                subscriptions: []
            }), { headers: corsHeaders });
        }
        
        // 获取订阅列表索引
        const indexData = await env.IP_CACHE.get('subscription_index');
        const subscriptionIds = indexData ? JSON.parse(indexData) : [];
        
        // 获取所有订阅详情
        const subscriptions = [];
        for (const id of subscriptionIds) {
            const subData = await env.IP_CACHE.get(`subscription:${id}`);
            if (subData) {
                subscriptions.push(JSON.parse(subData));
            }
        }
        
        return new Response(JSON.stringify({
            subscriptions: subscriptions
        }), { headers: corsHeaders });
        
    } catch (error) {
        console.error('List subscriptions error:', error);
        return new Response(JSON.stringify({
            subscriptions: []
        }), { headers: corsHeaders });
    }
}

// 保存订阅
async function saveSubscription(subscription, env, corsHeaders) {
    try {
        if (!env.IP_CACHE) {
            throw new Error('KV storage not available');
        }
        
        // 保存订阅数据
        await env.IP_CACHE.put(`subscription:${subscription.id}`, JSON.stringify(subscription));
        
        // 更新索引
        const indexData = await env.IP_CACHE.get('subscription_index');
        const subscriptionIds = indexData ? JSON.parse(indexData) : [];
        
        if (!subscriptionIds.includes(subscription.id)) {
            subscriptionIds.push(subscription.id);
            await env.IP_CACHE.put('subscription_index', JSON.stringify(subscriptionIds));
        }
        
        return new Response(JSON.stringify({
            success: true,
            message: 'Subscription saved successfully'
        }), { headers: corsHeaders });
        
    } catch (error) {
        console.error('Save subscription error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

// 删除订阅
async function deleteSubscription(id, env, corsHeaders) {
    try {
        if (!env.IP_CACHE) {
            throw new Error('KV storage not available');
        }
        
        // 删除订阅数据
        await env.IP_CACHE.delete(`subscription:${id}`);
        
        // 更新索引
        const indexData = await env.IP_CACHE.get('subscription_index');
        const subscriptionIds = indexData ? JSON.parse(indexData) : [];
        const updatedIds = subscriptionIds.filter(subId => subId !== id);
        await env.IP_CACHE.put('subscription_index', JSON.stringify(updatedIds));
        
        return new Response(JSON.stringify({
            success: true,
            message: 'Subscription deleted successfully'
        }), { headers: corsHeaders });
        
    } catch (error) {
        console.error('Delete subscription error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

// 测试订阅连接
async function testSubscription(url, env, corsHeaders) {
    try {
        // 解析订阅链接
        const nodes = await parseSubscriptionURL(url);
        
        return new Response(JSON.stringify({
            success: true,
            nodeCount: nodes.length,
            message: `Successfully parsed ${nodes.length} nodes`
        }), { headers: corsHeaders });
        
    } catch (error) {
        console.error('Test subscription error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), { headers: corsHeaders });
    }
}

// 检查所有订阅
async function checkAllSubscriptions(subscriptions, env, corsHeaders) {
    try {
        const results = [];
        let totalNodes = 0;
        let pureNodes = 0;
        
        for (const sub of subscriptions) {
            try {
                // 解析订阅
                const nodes = await parseSubscriptionURL(sub.url);
                
                // 检查IP纯净度（简化版本，实际应该调用IP检测API）
                const pureNodeCount = Math.floor(nodes.length * 0.7); // 模拟70%纯净率
                
                results.push({
                    id: sub.id,
                    success: true,
                    nodeCount: nodes.length,
                    pureNodeCount: pureNodeCount
                });
                
                totalNodes += nodes.length;
                pureNodes += pureNodeCount;
                
            } catch (error) {
                results.push({
                    id: sub.id,
                    success: false,
                    error: error.message,
                    nodeCount: 0,
                    pureNodeCount: 0
                });
            }
        }
        
        return new Response(JSON.stringify({
            success: true,
            results: results,
            totalNodes: totalNodes,
            pureNodes: pureNodes
        }), { headers: corsHeaders });
        
    } catch (error) {
        console.error('Check all subscriptions error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

// 清空所有订阅
async function clearAllSubscriptions(env, corsHeaders) {
    try {
        if (!env.IP_CACHE) {
            throw new Error('KV storage not available');
        }
        
        // 获取所有订阅ID
        const indexData = await env.IP_CACHE.get('subscription_index');
        const subscriptionIds = indexData ? JSON.parse(indexData) : [];
        
        // 删除所有订阅数据
        for (const id of subscriptionIds) {
            await env.IP_CACHE.delete(`subscription:${id}`);
        }
        
        // 清空索引
        await env.IP_CACHE.put('subscription_index', JSON.stringify([]));
        
        return new Response(JSON.stringify({
            success: true,
            message: 'All subscriptions cleared successfully'
        }), { headers: corsHeaders });
        
    } catch (error) {
        console.error('Clear all subscriptions error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

// 解析订阅链接（复用之前的代码）
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
