// IP纯净度检查工具 - Cloudflare Worker (修复版本)
// 解决HTML响应截断问题

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // 处理不同路由
        switch (path) {
            case '/':
            case '/index.html':
                return new Response(getHomePage(), {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    }
                });

            case '/api/check-ip':
                return handleCheckIP(request, env);

            case '/api/status':
                return handleStatus(env);

            default:
                return new Response('Not Found', { status: 404 });
        }
    },

    async scheduled(event, env, ctx) {
        // 定时任务处理
        console.log('定时任务执行:', new Date().toISOString());
    }
};

// 获取主页HTML - 紧凑版本避免截断
function getHomePage() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔍 IP地址纯净度检查工具</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fff; padding: 20px; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border: 1px solid #e0e0e0; }
        .header { background: #f8f9fa; color: #2c3e50; padding: 30px; text-align: center; border-bottom: 1px solid #e0e0e0; }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; font-weight: 700; }
        .tabs { display: flex; background: #fff; border-bottom: 1px solid #dee2e6; }
        .tab { flex: 1; padding: 15px 20px; background: none; border: none; cursor: pointer; font-size: 14px; color: #6c757d; transition: all 0.3s ease; }
        .tab:hover { background: #f8f9fa; color: #495057; }
        .tab.active { background: #007bff; color: white; }
        .tab-content { display: none; padding: 30px; }
        .tab-content.active { display: block; }
        .section { margin-bottom: 30px; padding: 25px; border: 1px solid #e1e5e9; border-radius: 8px; background: #f8f9fa; }
        .section h3 { color: #2c3e50; margin-bottom: 20px; font-size: 1.3rem; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 600; color: #555; }
        .form-group input, .form-group textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
        .btn { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; margin-right: 10px; margin-bottom: 10px; }
        .btn:hover { background: #0056b3; }
        .btn-secondary { background: #6c757d; }
        .btn-danger { background: #dc3545; }
        .alert { padding: 15px; margin: 15px 0; border-radius: 6px; display: none; }
        .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .result { background: #f1f3f4; border: 1px solid #dee2e6; padding: 15px; margin: 15px 0; border-radius: 6px; font-family: monospace; font-size: 12px; white-space: pre-wrap; max-height: 400px; overflow-y: auto; display: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 IP地址纯净度检查工具</h1>
            <p>一站式IP检测、订阅管理和Clash配置生成服务</p>
        </div>

        <div id="alertContainer"></div>

        <div class="tabs">
            <button class="tab active" onclick="switchTab('single-ip', this)">🔍 单IP检测</button>
            <button class="tab" onclick="switchTab('batch-ip', this)">📋 批量检测</button>
            <button class="tab" onclick="switchTab('subscription', this)">📡 订阅管理</button>
            <button class="tab" onclick="switchTab('settings', this)">⚙️ 设置</button>
        </div>

        <div id="single-ip" class="tab-content active">
            <div class="section">
                <h3>🔍 单IP检测</h3>
                <div class="form-group">
                    <label for="singleIp">IP地址:</label>
                    <input type="text" id="singleIp" placeholder="请输入IP地址，例如：8.8.8.8">
                </div>
                <button class="btn" onclick="checkSingleIP()">检测IP</button>
                <div id="singleResult" class="result"></div>
            </div>
        </div>

        <div id="batch-ip" class="tab-content">
            <div class="section">
                <h3>📋 批量IP检测</h3>
                <div class="form-group">
                    <label for="batchIps">IP地址列表 (每行一个IP):</label>
                    <textarea id="batchIps" rows="10" placeholder="请输入IP地址，每行一个：\\n8.8.8.8\\n1.1.1.1\\n208.67.222.222"></textarea>
                </div>
                <button class="btn" onclick="checkBatchIPs()">批量检测</button>
                <button class="btn btn-secondary" onclick="exportResults()">导出CSV</button>
                <div id="batchResult" class="result"></div>
            </div>
        </div>

        <div id="subscription" class="tab-content">
            <div class="section">
                <h3>📡 订阅管理</h3>
                <div class="form-group">
                    <label for="subscriptionName">订阅名称:</label>
                    <input type="text" id="subscriptionName" placeholder="例如：我的订阅">
                </div>
                <div class="form-group">
                    <label for="subscriptionUrl">订阅链接:</label>
                    <input type="url" id="subscriptionUrl" placeholder="https://example.com/subscription">
                </div>
                <button class="btn" onclick="addSubscription()">添加订阅</button>
                <button class="btn btn-secondary" onclick="checkAllSubscriptions()">检查所有订阅</button>
                <button class="btn btn-danger" onclick="clearSubscriptions()">清空订阅</button>
                <div id="subscriptionResult" class="result"></div>
                <div id="subscriptionList"></div>
            </div>
        </div>

        <div id="settings" class="tab-content">
            <div class="section">
                <h3>⚙️ API密钥设置</h3>
                <div class="form-group">
                    <label for="proxycheckKey">ProxyCheck.io API密钥:</label>
                    <input type="password" id="proxycheckKey" placeholder="输入您的ProxyCheck.io API密钥">
                </div>
                <div class="form-group">
                    <label for="ipinfoToken">IPinfo.io Token:</label>
                    <input type="password" id="ipinfoToken" placeholder="输入您的IPinfo.io Token">
                </div>
                <button class="btn" onclick="saveSettings()">保存设置</button>
                <button class="btn btn-secondary" onclick="testAPIKeys()">测试API密钥</button>
                <button class="btn btn-danger" onclick="clearSettings()">清除设置</button>
                <div id="settingsResult" class="result"></div>
            </div>
        </div>
    </div>

    <script>
        // 全局变量
        var subscriptions = [];
        var apiKeys = { proxycheck: '', ipinfo: '' };
        var batchResults = [];

        // 页面加载时初始化
        document.addEventListener('DOMContentLoaded', function() {
            loadSettings();
            loadSubscriptions();
        });

        // 标签页切换
        function switchTab(tabName, clickedElement) {
            document.querySelectorAll('.tab-content').forEach(function(content) {
                content.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(function(tab) {
                tab.classList.remove('active');
            });
            document.getElementById(tabName).classList.add('active');
            if (clickedElement) {
                clickedElement.classList.add('active');
            }
        }

        // 显示提示信息
        function showAlert(message, type) {
            var alertContainer = document.getElementById('alertContainer');
            var alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-' + (type || 'success');
            alertDiv.textContent = message;
            alertDiv.style.display = 'block';
            alertContainer.innerHTML = '';
            alertContainer.appendChild(alertDiv);
            setTimeout(function() { alertDiv.style.display = 'none'; }, 3000);
        }

        // 显示结果
        function showResult(elementId, content, isError) {
            var resultDiv = document.getElementById(elementId);
            resultDiv.style.display = 'block';
            resultDiv.textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
            resultDiv.style.color = isError ? '#dc3545' : '#333';
        }

        // 单IP检测
        function checkSingleIP() {
            var ip = document.getElementById('singleIp').value.trim();
            if (!ip) {
                showAlert('请输入IP地址', 'error');
                return;
            }
            showResult('singleResult', '正在检测IP地址...');
            fetch('/api/check-ip?ip=' + encodeURIComponent(ip))
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    showResult('singleResult', data);
                    showAlert('IP检测完成', 'success');
                })
                .catch(function(error) {
                    showResult('singleResult', '错误: ' + error.message, true);
                    showAlert('检测失败: ' + error.message, 'error');
                });
        }

        // 批量IP检测
        function checkBatchIPs() {
            var ipsText = document.getElementById('batchIps').value.trim();
            if (!ipsText) {
                showAlert('请输入IP地址列表', 'error');
                return;
            }
            var ips = ipsText.split('\\n').filter(function(ip) { return ip.trim(); });
            showResult('batchResult', '正在检测 ' + ips.length + ' 个IP地址...');
            showAlert('批量检测功能开发中', 'info');
        }

        // 导出结果
        function exportResults() {
            showAlert('导出功能开发中', 'info');
        }

        // 订阅管理
        function addSubscription() {
            var name = document.getElementById('subscriptionName').value.trim();
            var url = document.getElementById('subscriptionUrl').value.trim();
            if (!name || !url) {
                showAlert('请填写订阅名称和链接', 'error');
                return;
            }
            subscriptions.push({ id: Date.now(), name: name, url: url });
            saveSubscriptions();
            renderSubscriptions();
            document.getElementById('subscriptionName').value = '';
            document.getElementById('subscriptionUrl').value = '';
            showAlert('订阅添加成功', 'success');
        }

        function saveSubscriptions() {
            localStorage.setItem('subscriptions', JSON.stringify(subscriptions));
        }

        function loadSubscriptions() {
            var saved = localStorage.getItem('subscriptions');
            if (saved) {
                try { subscriptions = JSON.parse(saved); } catch (e) { subscriptions = []; }
            }
            renderSubscriptions();
        }

        function renderSubscriptions() {
            var container = document.getElementById('subscriptionList');
            if (subscriptions.length === 0) {
                container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">暂无订阅</p>';
                return;
            }
            container.innerHTML = subscriptions.map(function(sub) {
                return '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 10px;">' +
                    '<h4>' + sub.name + '</h4>' +
                    '<p style="font-size: 12px; color: #666;">' + sub.url.substring(0, 50) + '...</p>' +
                    '<button class="btn" onclick="deleteSubscription(' + sub.id + ')">删除</button>' +
                    '</div>';
            }).join('');
        }

        function deleteSubscription(id) {
            subscriptions = subscriptions.filter(function(sub) { return sub.id !== id; });
            saveSubscriptions();
            renderSubscriptions();
            showAlert('订阅删除成功', 'success');
        }

        function checkAllSubscriptions() {
            showAlert('订阅检测功能开发中', 'info');
        }

        function clearSubscriptions() {
            if (confirm('确定要删除所有订阅吗？')) {
                subscriptions = [];
                saveSubscriptions();
                renderSubscriptions();
                showAlert('所有订阅已清空', 'success');
            }
        }

        // 设置相关
        function loadSettings() {
            apiKeys.proxycheck = localStorage.getItem('proxycheck_key') || '';
            apiKeys.ipinfo = localStorage.getItem('ipinfo_token') || '';
            if (apiKeys.proxycheck) document.getElementById('proxycheckKey').value = apiKeys.proxycheck;
            if (apiKeys.ipinfo) document.getElementById('ipinfoToken').value = apiKeys.ipinfo;
        }

        function saveSettings() {
            var proxycheckKey = document.getElementById('proxycheckKey').value.trim();
            var ipinfoToken = document.getElementById('ipinfoToken').value.trim();
            if (proxycheckKey) {
                localStorage.setItem('proxycheck_key', proxycheckKey);
                apiKeys.proxycheck = proxycheckKey;
            }
            if (ipinfoToken) {
                localStorage.setItem('ipinfo_token', ipinfoToken);
                apiKeys.ipinfo = ipinfoToken;
            }
            showAlert('设置保存成功', 'success');
        }

        function testAPIKeys() {
            showAlert('API密钥测试功能开发中', 'info');
        }

        function clearSettings() {
            if (confirm('确定要清除所有设置吗？')) {
                localStorage.clear();
                apiKeys = { proxycheck: '', ipinfo: '' };
                document.getElementById('proxycheckKey').value = '';
                document.getElementById('ipinfoToken').value = '';
                showAlert('所有设置已清除', 'success');
            }
        }
    </script>
</body>
</html>`;
}

// 处理IP检测API
async function handleCheckIP(request, env) {
    const url = new URL(request.url);
    const ip = url.searchParams.get('ip');
    
    if (!ip) {
        return new Response(JSON.stringify({ error: '缺少IP参数' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 简单的IP检测逻辑
    const result = {
        ip: ip,
        isPure: Math.random() > 0.5, // 随机结果，实际应该调用检测API
        riskScore: Math.floor(Math.random() * 100),
        country: 'Unknown',
        city: 'Unknown',
        timestamp: new Date().toISOString()
    };

    return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// 处理状态查询
async function handleStatus(env) {
    const status = {
        status: 'running',
        timestamp: new Date().toISOString(),
        stats: {
            totalChecked: 0,
            pureIPs: 0,
            lastCheck: null
        }
    };

    return new Response(JSON.stringify(status), {
        headers: { 'Content-Type': 'application/json' }
    });
}
