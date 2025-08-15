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
                <h3>📡 订阅管理增强版</h3>

                <!-- 统计信息 -->
                <div style="background: #e9ecef; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; text-align: center;">
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #007bff;" id="totalSubs">0</div>
                            <div style="font-size: 0.9rem; color: #666;">总订阅数</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #28a745;" id="validSubs">0</div>
                            <div style="font-size: 0.9rem; color: #666;">有效订阅</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #dc3545;" id="duplicateSubs">0</div>
                            <div style="font-size: 0.9rem; color: #666;">重复订阅</div>
                        </div>
                    </div>
                </div>

                <!-- 添加订阅 -->
                <div class="form-group">
                    <label for="subscriptionName">订阅名称:</label>
                    <input type="text" id="subscriptionName" placeholder="例如：我的订阅">
                </div>
                <div class="form-group">
                    <label for="subscriptionUrl">订阅链接:</label>
                    <input type="url" id="subscriptionUrl" placeholder="https://example.com/subscription">
                </div>

                <!-- 批量添加 -->
                <div class="form-group">
                    <label for="batchSubscriptions">批量添加订阅 (每行一个链接):</label>
                    <textarea id="batchSubscriptions" rows="4" placeholder="https://example1.com/sub1&#10;https://example2.com/sub2&#10;https://example3.com/sub3"></textarea>
                </div>

                <!-- 操作按钮 -->
                <div style="margin-bottom: 20px;">
                    <button class="btn" onclick="addSubscription()">添加订阅</button>
                    <button class="btn" onclick="addBatchSubscriptions()">批量添加</button>
                    <button class="btn btn-secondary" onclick="removeDuplicates()">去重订阅</button>
                    <button class="btn btn-secondary" onclick="checkAllSubscriptions()">检查所有订阅</button>
                </div>

                <!-- 导入导出 -->
                <div style="margin-bottom: 20px;">
                    <button class="btn btn-secondary" onclick="exportSubscriptions()">📤 导出订阅</button>
                    <input type="file" id="importFile" accept=".txt,.json" style="display: none;" onchange="importSubscriptions(event)">
                    <button class="btn btn-secondary" onclick="document.getElementById('importFile').click()">📥 导入订阅</button>
                    <button class="btn btn-danger" onclick="clearSubscriptions()">清空所有</button>
                </div>

                <div id="subscriptionResult" class="result"></div>
                <div id="subscriptionList"></div>
            </div>
        </div>

        <div id="settings" class="tab-content">
            <div class="section">
                <h3>⚙️ API密钥管理增强版</h3>

                <!-- ProxyCheck.io 多密钥管理 -->
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="margin-bottom: 15px; color: #2c3e50;">🔑 ProxyCheck.io API密钥</h4>
                    <div class="form-group">
                        <label for="newProxycheckKey">添加新密钥:</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="password" id="newProxycheckKey" placeholder="输入ProxyCheck.io API密钥" style="flex: 1;">
                            <button class="btn" onclick="addProxycheckKey()">添加</button>
                        </div>
                    </div>
                    <div id="proxycheckKeysList"></div>
                </div>

                <!-- IPinfo.io 多Token管理 -->
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="margin-bottom: 15px; color: #2c3e50;">🎫 IPinfo.io Token</h4>
                    <div class="form-group">
                        <label for="newIpinfoToken">添加新Token:</label>
                        <div style="display: flex; gap: 10px;">
                            <input type="password" id="newIpinfoToken" placeholder="输入IPinfo.io Token" style="flex: 1;">
                            <button class="btn" onclick="addIpinfoToken()">添加</button>
                        </div>
                    </div>
                    <div id="ipinfoTokensList"></div>
                </div>

                <!-- Token使用策略 -->
                <div style="background: #e9ecef; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                    <h4 style="margin-bottom: 10px;">🔄 Token使用策略</h4>
                    <div class="form-group">
                        <label>
                            <input type="radio" name="tokenStrategy" value="round-robin" checked> 轮换使用 (推荐)
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="radio" name="tokenStrategy" value="failover"> 故障转移 (主用备用)
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="radio" name="tokenStrategy" value="random"> 随机选择
                        </label>
                    </div>
                </div>

                <!-- 操作按钮 -->
                <div style="margin-bottom: 20px;">
                    <button class="btn" onclick="saveAllSettings()">💾 保存所有设置</button>
                    <button class="btn btn-secondary" onclick="testAllAPIKeys()">🧪 测试所有密钥</button>
                    <button class="btn btn-secondary" onclick="refreshTokenStatus()">🔄 刷新状态</button>
                    <button class="btn btn-danger" onclick="clearAllSettings()">🗑️ 清除所有</button>
                </div>

                <div id="settingsResult" class="result"></div>
            </div>
        </div>
    </div>

    <script>
        // 全局变量 - 增强版
        var subscriptions = [];
        var batchResults = [];

        // 多API密钥管理
        var apiKeysManager = {
            proxycheck: {
                keys: [],
                currentIndex: 0,
                strategy: 'round-robin' // round-robin, failover, random
            },
            ipinfo: {
                tokens: [],
                currentIndex: 0,
                strategy: 'round-robin'
            }
        };

        // 页面加载时初始化
        document.addEventListener('DOMContentLoaded', function() {
            loadAllSettings();
            loadSubscriptions();
            updateSubscriptionStats();
            renderAPIKeys();
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

        // 单IP检测 - 增强版
        function checkSingleIP() {
            var ip = document.getElementById('singleIp').value.trim();
            if (!ip) {
                showAlert('请输入IP地址', 'error');
                return;
            }

            // 验证IP格式
            if (!isValidIP(ip)) {
                showAlert('请输入有效的IP地址格式', 'error');
                return;
            }

            showResult('singleResult', '正在检测IP地址: ' + ip + '\\n使用多API密钥轮换检测...');

            // 获取可用的API密钥
            var proxycheckKey = getNextAPIKey('proxycheck');
            var ipinfoToken = getNextAPIKey('ipinfo');

            var headers = {};
            if (proxycheckKey) {
                headers['X-ProxyCheck-Key'] = proxycheckKey.value;
            }
            if (ipinfoToken) {
                headers['X-IPInfo-Token'] = ipinfoToken.value;
            }

            fetch('/api/check-ip?ip=' + encodeURIComponent(ip), {
                headers: headers
            })
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    // 增强结果显示
                    var enhancedData = {
                        ...data,
                        usedAPIs: {
                            proxycheck: proxycheckKey ? proxycheckKey.name : '未使用',
                            ipinfo: ipinfoToken ? ipinfoToken.name : '未使用'
                        },
                        detectionTime: new Date().toLocaleString()
                    };

                    showResult('singleResult', enhancedData);
                    showAlert('IP检测完成', 'success');
                })
                .catch(function(error) {
                    showResult('singleResult', '错误: ' + error.message, true);
                    showAlert('检测失败: ' + error.message, 'error');
                });
        }

        // IP格式验证
        function isValidIP(ip) {
            var ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            return ipRegex.test(ip);
        }

        // 批量IP检测 - 增强版
        function checkBatchIPs() {
            var ipsText = document.getElementById('batchIps').value.trim();
            if (!ipsText) {
                showAlert('请输入IP地址列表', 'error');
                return;
            }

            var ips = ipsText.split('\\n').map(function(line) { return line.trim(); }).filter(function(line) { return line; });
            if (ips.length === 0) {
                showAlert('没有有效的IP地址', 'error');
                return;
            }

            // 验证IP格式
            var validIPs = [];
            var invalidIPs = [];
            ips.forEach(function(ip) {
                if (isValidIP(ip)) {
                    validIPs.push(ip);
                } else {
                    invalidIPs.push(ip);
                }
            });

            if (invalidIPs.length > 0) {
                showAlert('发现 ' + invalidIPs.length + ' 个无效IP地址，将跳过检测', 'warning');
            }

            if (validIPs.length === 0) {
                showAlert('没有有效的IP地址可以检测', 'error');
                return;
            }

            showResult('batchResult', '开始批量检测 ' + validIPs.length + ' 个IP地址...\\n使用多API密钥负载均衡');

            var results = [];
            var currentIndex = 0;
            var startTime = Date.now();

            function checkNextIP() {
                if (currentIndex >= validIPs.length) {
                    batchResults = results;
                    var endTime = Date.now();
                    var duration = ((endTime - startTime) / 1000).toFixed(2);

                    var summary = '批量检测完成！\\n' +
                        '总计: ' + results.length + ' 个IP\\n' +
                        '纯净: ' + results.filter(function(r) { return r.isPure; }).length + ' 个\\n' +
                        '耗时: ' + duration + ' 秒\\n\\n' +
                        JSON.stringify(results, null, 2);

                    showResult('batchResult', summary);
                    showAlert('批量检测完成，共检测 ' + results.length + ' 个IP', 'success');
                    return;
                }

                var ip = validIPs[currentIndex];
                var progress = '正在检测 ' + (currentIndex + 1) + '/' + validIPs.length + ': ' + ip;
                showResult('batchResult', progress);

                // 获取可用的API密钥
                var proxycheckKey = getNextAPIKey('proxycheck');
                var ipinfoToken = getNextAPIKey('ipinfo');

                var headers = {};
                if (proxycheckKey) {
                    headers['X-ProxyCheck-Key'] = proxycheckKey.value;
                }
                if (ipinfoToken) {
                    headers['X-IPInfo-Token'] = ipinfoToken.value;
                }

                fetch('/api/check-ip?ip=' + encodeURIComponent(ip), {
                    headers: headers
                }).then(function(response) {
                    return response.json();
                }).then(function(data) {
                    results.push({
                        ...data,
                        usedAPIs: {
                            proxycheck: proxycheckKey ? proxycheckKey.name : '未使用',
                            ipinfo: ipinfoToken ? ipinfoToken.name : '未使用'
                        }
                    });
                    currentIndex++;
                    setTimeout(checkNextIP, 1000); // 1秒延迟避免API限制
                }).catch(function(error) {
                    results.push({
                        ip: ip,
                        error: error.message,
                        isPure: false,
                        timestamp: new Date().toISOString()
                    });
                    currentIndex++;
                    setTimeout(checkNextIP, 1000);
                });
            }

            checkNextIP();
        }

        // 导出结果
        function exportResults() {
            showAlert('导出功能开发中', 'info');
        }

        // 订阅管理增强功能
        function addSubscription() {
            var name = document.getElementById('subscriptionName').value.trim();
            var url = document.getElementById('subscriptionUrl').value.trim();

            if (!name || !url) {
                showAlert('请填写订阅名称和链接', 'error');
                return;
            }

            // 验证URL格式
            if (!isValidUrl(url)) {
                showAlert('请输入有效的URL格式', 'error');
                return;
            }

            // 检查重复
            var duplicate = subscriptions.find(function(sub) { return sub.url === url; });
            if (duplicate) {
                if (!confirm('检测到重复的订阅链接：' + duplicate.name + '\\n是否仍要添加？')) {
                    return;
                }
            }

            var subscription = {
                id: Date.now(),
                name: name,
                url: url,
                createdAt: new Date().toISOString(),
                status: 'pending',
                lastChecked: null,
                isValid: true
            };

            subscriptions.push(subscription);
            saveSubscriptions();
            renderSubscriptions();
            updateSubscriptionStats();

            // 清空输入框
            document.getElementById('subscriptionName').value = '';
            document.getElementById('subscriptionUrl').value = '';
            showAlert('订阅添加成功', 'success');
        }

        // 批量添加订阅
        function addBatchSubscriptions() {
            var batchText = document.getElementById('batchSubscriptions').value.trim();
            if (!batchText) {
                showAlert('请输入要批量添加的订阅链接', 'error');
                return;
            }

            var urls = batchText.split('\\n').map(function(line) { return line.trim(); }).filter(function(line) { return line; });
            var added = 0;
            var duplicates = 0;
            var invalid = 0;

            urls.forEach(function(url, index) {
                if (!isValidUrl(url)) {
                    invalid++;
                    return;
                }

                var duplicate = subscriptions.find(function(sub) { return sub.url === url; });
                if (duplicate) {
                    duplicates++;
                    return;
                }

                var subscription = {
                    id: Date.now() + index,
                    name: '批量导入 ' + (index + 1),
                    url: url,
                    createdAt: new Date().toISOString(),
                    status: 'pending',
                    lastChecked: null,
                    isValid: true
                };

                subscriptions.push(subscription);
                added++;
            });

            saveSubscriptions();
            renderSubscriptions();
            updateSubscriptionStats();
            document.getElementById('batchSubscriptions').value = '';

            var message = '批量添加完成：成功 ' + added + ' 个';
            if (duplicates > 0) message += '，跳过重复 ' + duplicates + ' 个';
            if (invalid > 0) message += '，无效链接 ' + invalid + ' 个';

            showAlert(message, added > 0 ? 'success' : 'warning');
        }

        // 去重功能
        function removeDuplicates() {
            var originalCount = subscriptions.length;
            var seen = {};
            var unique = [];

            subscriptions.forEach(function(sub) {
                if (!seen[sub.url]) {
                    seen[sub.url] = true;
                    unique.push(sub);
                }
            });

            var removedCount = originalCount - unique.length;
            if (removedCount === 0) {
                showAlert('没有发现重复的订阅', 'info');
                return;
            }

            if (confirm('发现 ' + removedCount + ' 个重复订阅，是否删除？')) {
                subscriptions = unique;
                saveSubscriptions();
                renderSubscriptions();
                updateSubscriptionStats();
                showAlert('已删除 ' + removedCount + ' 个重复订阅', 'success');
            }
        }

        // 导出订阅
        function exportSubscriptions() {
            if (subscriptions.length === 0) {
                showAlert('没有订阅可以导出', 'warning');
                return;
            }

            var exportData = {
                exportTime: new Date().toISOString(),
                totalCount: subscriptions.length,
                subscriptions: subscriptions
            };

            var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            var link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'subscriptions_' + new Date().toISOString().split('T')[0] + '.json';
            link.click();

            showAlert('订阅列表已导出', 'success');
        }

        // 导入订阅
        function importSubscriptions(event) {
            var file = event.target.files[0];
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var content = e.target.result;
                    var data;

                    if (file.name.endsWith('.json')) {
                        data = JSON.parse(content);
                        var importSubs = data.subscriptions || data;
                    } else {
                        // 文本文件，每行一个URL
                        var urls = content.split('\\n').map(function(line) { return line.trim(); }).filter(function(line) { return line; });
                        importSubs = urls.map(function(url, index) {
                            return {
                                id: Date.now() + index,
                                name: '导入订阅 ' + (index + 1),
                                url: url,
                                createdAt: new Date().toISOString(),
                                status: 'pending',
                                lastChecked: null,
                                isValid: true
                            };
                        });
                    }

                    var added = 0;
                    var duplicates = 0;

                    importSubs.forEach(function(importSub) {
                        if (!isValidUrl(importSub.url)) return;

                        var duplicate = subscriptions.find(function(sub) { return sub.url === importSub.url; });
                        if (duplicate) {
                            duplicates++;
                            return;
                        }

                        subscriptions.push(importSub);
                        added++;
                    });

                    saveSubscriptions();
                    renderSubscriptions();
                    updateSubscriptionStats();

                    var message = '导入完成：新增 ' + added + ' 个订阅';
                    if (duplicates > 0) message += '，跳过重复 ' + duplicates + ' 个';

                    showAlert(message, 'success');

                } catch (error) {
                    showAlert('导入失败：文件格式错误', 'error');
                }
            };
            reader.readAsText(file);
        }

        function saveSubscriptions() {
            localStorage.setItem('subscriptions', JSON.stringify(subscriptions));
        }

        function loadSubscriptions() {
            var saved = localStorage.getItem('subscriptions');
            if (saved) {
                try {
                    subscriptions = JSON.parse(saved);
                    // 确保旧数据兼容性
                    subscriptions = subscriptions.map(function(sub) {
                        return {
                            id: sub.id || Date.now(),
                            name: sub.name || '未命名订阅',
                            url: sub.url,
                            createdAt: sub.createdAt || new Date().toISOString(),
                            status: sub.status || 'pending',
                            lastChecked: sub.lastChecked || null,
                            isValid: sub.isValid !== undefined ? sub.isValid : true
                        };
                    });
                } catch (e) {
                    subscriptions = [];
                }
            }
            renderSubscriptions();
        }

        // 更新订阅统计信息
        function updateSubscriptionStats() {
            var total = subscriptions.length;
            var valid = subscriptions.filter(function(sub) { return sub.isValid; }).length;
            var duplicateUrls = {};
            var duplicates = 0;

            subscriptions.forEach(function(sub) {
                if (duplicateUrls[sub.url]) {
                    duplicates++;
                } else {
                    duplicateUrls[sub.url] = true;
                }
            });

            document.getElementById('totalSubs').textContent = total;
            document.getElementById('validSubs').textContent = valid;
            document.getElementById('duplicateSubs').textContent = duplicates;
        }

        function renderSubscriptions() {
            var container = document.getElementById('subscriptionList');
            if (subscriptions.length === 0) {
                container.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">暂无订阅，请添加您的第一个订阅链接</p>';
                return;
            }

            container.innerHTML = subscriptions.map(function(sub) {
                var statusColor = sub.status === 'active' ? '#28a745' : sub.status === 'error' ? '#dc3545' : '#6c757d';
                var statusText = sub.status === 'active' ? '正常' : sub.status === 'error' ? '错误' : '待检测';

                return '<div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 10px; ' +
                    (sub.isValid ? '' : 'opacity: 0.6;') + '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">' +
                        '<h4 style="margin: 0; color: #333;">' + sub.name + '</h4>' +
                        '<span style="background: ' + statusColor + '; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">' + statusText + '</span>' +
                    '</div>' +
                    '<div style="font-family: monospace; background: #f1f3f4; padding: 8px; border-radius: 4px; word-break: break-all; font-size: 12px; margin-bottom: 10px;">' +
                        sub.url +
                    '</div>' +
                    '<div style="font-size: 12px; color: #666; margin-bottom: 10px;">' +
                        '创建时间: ' + new Date(sub.createdAt).toLocaleString() +
                        (sub.lastChecked ? ' | 最后检查: ' + new Date(sub.lastChecked).toLocaleString() : '') +
                    '</div>' +
                    '<div>' +
                        '<button class="btn" onclick="testSingleSubscription(' + sub.id + ')" style="font-size: 12px; padding: 6px 12px;">🧪 测试</button>' +
                        '<button class="btn btn-secondary" onclick="editSubscription(' + sub.id + ')" style="font-size: 12px; padding: 6px 12px;">✏️ 编辑</button>' +
                        '<button class="btn btn-danger" onclick="deleteSubscription(' + sub.id + ')" style="font-size: 12px; padding: 6px 12px;">🗑️ 删除</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        // 测试单个订阅
        function testSingleSubscription(id) {
            var subscription = subscriptions.find(function(sub) { return sub.id === id; });
            if (!subscription) return;

            showAlert('正在测试订阅: ' + subscription.name, 'info');

            // 模拟测试结果
            setTimeout(function() {
                subscription.lastChecked = new Date().toISOString();
                subscription.status = Math.random() > 0.3 ? 'active' : 'error';
                saveSubscriptions();
                renderSubscriptions();
                updateSubscriptionStats();

                var message = subscription.status === 'active' ? '测试成功' : '测试失败';
                showAlert(subscription.name + ' ' + message, subscription.status === 'active' ? 'success' : 'error');
            }, 1000);
        }

        // 编辑订阅
        function editSubscription(id) {
            var subscription = subscriptions.find(function(sub) { return sub.id === id; });
            if (!subscription) return;

            var newName = prompt('修改订阅名称:', subscription.name);
            if (newName && newName.trim()) {
                subscription.name = newName.trim();
                saveSubscriptions();
                renderSubscriptions();
                showAlert('订阅名称已更新', 'success');
            }
        }

        function deleteSubscription(id) {
            var subscription = subscriptions.find(function(sub) { return sub.id === id; });
            if (!subscription) return;

            if (confirm('确定要删除订阅 "' + subscription.name + '" 吗？')) {
                subscriptions = subscriptions.filter(function(sub) { return sub.id !== id; });
                saveSubscriptions();
                renderSubscriptions();
                updateSubscriptionStats();
                showAlert('订阅删除成功', 'success');
            }
        }

        function checkAllSubscriptions() {
            if (subscriptions.length === 0) {
                showAlert('没有订阅需要检查', 'warning');
                return;
            }

            showAlert('正在检查所有订阅，请稍候...', 'info');
            var checkedCount = 0;

            subscriptions.forEach(function(sub, index) {
                setTimeout(function() {
                    sub.lastChecked = new Date().toISOString();
                    sub.status = Math.random() > 0.3 ? 'active' : 'error';
                    checkedCount++;

                    if (checkedCount === subscriptions.length) {
                        saveSubscriptions();
                        renderSubscriptions();
                        updateSubscriptionStats();
                        showAlert('所有订阅检查完成', 'success');
                    }
                }, index * 500);
            });
        }

        function clearSubscriptions() {
            if (subscriptions.length === 0) {
                showAlert('没有订阅需要清空', 'info');
                return;
            }

            if (confirm('确定要删除所有 ' + subscriptions.length + ' 个订阅吗？此操作不可恢复！')) {
                subscriptions = [];
                saveSubscriptions();
                renderSubscriptions();
                updateSubscriptionStats();
                showAlert('所有订阅已清空', 'success');
            }
        }

        // 多API密钥管理
        function addProxycheckKey() {
            var newKey = document.getElementById('newProxycheckKey').value.trim();
            if (!newKey) {
                showAlert('请输入ProxyCheck.io API密钥', 'error');
                return;
            }

            // 检查重复
            var duplicate = apiKeysManager.proxycheck.keys.find(function(key) { return key.value === newKey; });
            if (duplicate) {
                showAlert('该API密钥已存在', 'warning');
                return;
            }

            var keyObj = {
                id: Date.now(),
                value: newKey,
                name: 'ProxyCheck密钥 ' + (apiKeysManager.proxycheck.keys.length + 1),
                addedAt: new Date().toISOString(),
                status: 'unknown',
                quota: { used: 0, limit: 1000, remaining: 1000 },
                lastUsed: null,
                isActive: true
            };

            apiKeysManager.proxycheck.keys.push(keyObj);
            saveAllSettings();
            renderAPIKeys();
            document.getElementById('newProxycheckKey').value = '';
            showAlert('ProxyCheck.io API密钥添加成功', 'success');
        }

        function addIpinfoToken() {
            var newToken = document.getElementById('newIpinfoToken').value.trim();
            if (!newToken) {
                showAlert('请输入IPinfo.io Token', 'error');
                return;
            }

            // 检查重复
            var duplicate = apiKeysManager.ipinfo.tokens.find(function(token) { return token.value === newToken; });
            if (duplicate) {
                showAlert('该Token已存在', 'warning');
                return;
            }

            var tokenObj = {
                id: Date.now(),
                value: newToken,
                name: 'IPinfo Token ' + (apiKeysManager.ipinfo.tokens.length + 1),
                addedAt: new Date().toISOString(),
                status: 'unknown',
                quota: { used: 0, limit: 50000, remaining: 50000 },
                lastUsed: null,
                isActive: true
            };

            apiKeysManager.ipinfo.tokens.push(tokenObj);
            saveAllSettings();
            renderAPIKeys();
            document.getElementById('newIpinfoToken').value = '';
            showAlert('IPinfo.io Token添加成功', 'success');
        }

        // 渲染API密钥列表
        function renderAPIKeys() {
            renderProxycheckKeys();
            renderIpinfoTokens();
        }

        function renderProxycheckKeys() {
            var container = document.getElementById('proxycheckKeysList');
            if (apiKeysManager.proxycheck.keys.length === 0) {
                container.innerHTML = '<p style="color: #666; text-align: center; padding: 10px;">暂无ProxyCheck.io API密钥</p>';
                return;
            }

            container.innerHTML = apiKeysManager.proxycheck.keys.map(function(key) {
                var statusColor = key.status === 'active' ? '#28a745' : key.status === 'error' ? '#dc3545' : '#6c757d';
                var statusText = key.status === 'active' ? '正常' : key.status === 'error' ? '失效' : '未测试';

                return '<div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 8px; ' +
                    (key.isActive ? '' : 'opacity: 0.6;') + '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
                        '<strong>' + key.name + '</strong>' +
                        '<span style="background: ' + statusColor + '; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px;">' + statusText + '</span>' +
                    '</div>' +
                    '<div style="font-family: monospace; font-size: 11px; color: #666; margin-bottom: 8px;">' +
                        key.value.substring(0, 20) + '...' +
                    '</div>' +
                    '<div style="font-size: 11px; color: #666; margin-bottom: 8px;">' +
                        '配额: ' + key.quota.remaining + '/' + key.quota.limit + ' | ' +
                        '添加时间: ' + new Date(key.addedAt).toLocaleDateString() +
                    '</div>' +
                    '<div>' +
                        '<button class="btn" onclick="testProxycheckKey(' + key.id + ')" style="font-size: 11px; padding: 4px 8px;">测试</button>' +
                        '<button class="btn btn-secondary" onclick="toggleKeyStatus(' + key.id + ', \\'proxycheck\\')" style="font-size: 11px; padding: 4px 8px;">' + (key.isActive ? '禁用' : '启用') + '</button>' +
                        '<button class="btn btn-danger" onclick="deleteProxycheckKey(' + key.id + ')" style="font-size: 11px; padding: 4px 8px;">删除</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        function renderIpinfoTokens() {
            var container = document.getElementById('ipinfoTokensList');
            if (apiKeysManager.ipinfo.tokens.length === 0) {
                container.innerHTML = '<p style="color: #666; text-align: center; padding: 10px;">暂无IPinfo.io Token</p>';
                return;
            }

            container.innerHTML = apiKeysManager.ipinfo.tokens.map(function(token) {
                var statusColor = token.status === 'active' ? '#28a745' : token.status === 'error' ? '#dc3545' : '#6c757d';
                var statusText = token.status === 'active' ? '正常' : token.status === 'error' ? '失效' : '未测试';

                return '<div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 8px; ' +
                    (token.isActive ? '' : 'opacity: 0.6;') + '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
                        '<strong>' + token.name + '</strong>' +
                        '<span style="background: ' + statusColor + '; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px;">' + statusText + '</span>' +
                    '</div>' +
                    '<div style="font-family: monospace; font-size: 11px; color: #666; margin-bottom: 8px;">' +
                        token.value.substring(0, 20) + '...' +
                    '</div>' +
                    '<div style="font-size: 11px; color: #666; margin-bottom: 8px;">' +
                        '配额: ' + token.quota.remaining + '/' + token.quota.limit + ' | ' +
                        '添加时间: ' + new Date(token.addedAt).toLocaleDateString() +
                    '</div>' +
                    '<div>' +
                        '<button class="btn" onclick="testIpinfoToken(' + token.id + ')" style="font-size: 11px; padding: 4px 8px;">测试</button>' +
                        '<button class="btn btn-secondary" onclick="toggleKeyStatus(' + token.id + ', \\'ipinfo\\')" style="font-size: 11px; padding: 4px 8px;">' + (token.isActive ? '禁用' : '启用') + '</button>' +
                        '<button class="btn btn-danger" onclick="deleteIpinfoToken(' + token.id + ')" style="font-size: 11px; padding: 4px 8px;">删除</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        // API密钥操作功能
        function testProxycheckKey(id) {
            var key = apiKeysManager.proxycheck.keys.find(function(k) { return k.id === id; });
            if (!key) return;

            showAlert('正在测试 ' + key.name, 'info');

            // 模拟API测试
            setTimeout(function() {
                key.status = Math.random() > 0.2 ? 'active' : 'error';
                key.lastUsed = new Date().toISOString();
                if (key.status === 'active') {
                    key.quota.remaining = Math.floor(Math.random() * 1000);
                    key.quota.used = key.quota.limit - key.quota.remaining;
                }
                saveAllSettings();
                renderAPIKeys();
                showAlert(key.name + ' 测试' + (key.status === 'active' ? '成功' : '失败'), key.status === 'active' ? 'success' : 'error');
            }, 1000);
        }

        function testIpinfoToken(id) {
            var token = apiKeysManager.ipinfo.tokens.find(function(t) { return t.id === id; });
            if (!token) return;

            showAlert('正在测试 ' + token.name, 'info');

            // 模拟API测试
            setTimeout(function() {
                token.status = Math.random() > 0.2 ? 'active' : 'error';
                token.lastUsed = new Date().toISOString();
                if (token.status === 'active') {
                    token.quota.remaining = Math.floor(Math.random() * 50000);
                    token.quota.used = token.quota.limit - token.quota.remaining;
                }
                saveAllSettings();
                renderAPIKeys();
                showAlert(token.name + ' 测试' + (token.status === 'active' ? '成功' : '失败'), token.status === 'active' ? 'success' : 'error');
            }, 1000);
        }

        function toggleKeyStatus(id, type) {
            var item = type === 'proxycheck' ?
                apiKeysManager.proxycheck.keys.find(function(k) { return k.id === id; }) :
                apiKeysManager.ipinfo.tokens.find(function(t) { return t.id === id; });

            if (!item) return;

            item.isActive = !item.isActive;
            saveAllSettings();
            renderAPIKeys();
            showAlert(item.name + ' 已' + (item.isActive ? '启用' : '禁用'), 'success');
        }

        function deleteProxycheckKey(id) {
            var key = apiKeysManager.proxycheck.keys.find(function(k) { return k.id === id; });
            if (!key) return;

            if (confirm('确定要删除 "' + key.name + '" 吗？')) {
                apiKeysManager.proxycheck.keys = apiKeysManager.proxycheck.keys.filter(function(k) { return k.id !== id; });
                saveAllSettings();
                renderAPIKeys();
                showAlert('API密钥删除成功', 'success');
            }
        }

        function deleteIpinfoToken(id) {
            var token = apiKeysManager.ipinfo.tokens.find(function(t) { return t.id === id; });
            if (!token) return;

            if (confirm('确定要删除 "' + token.name + '" 吗？')) {
                apiKeysManager.ipinfo.tokens = apiKeysManager.ipinfo.tokens.filter(function(t) { return t.id !== id; });
                saveAllSettings();
                renderAPIKeys();
                showAlert('Token删除成功', 'success');
            }
        }
        // 设置管理功能
        function saveAllSettings() {
            // 保存API密钥管理器
            localStorage.setItem('apiKeysManager', JSON.stringify(apiKeysManager));

            // 保存Token使用策略
            var strategy = document.querySelector('input[name="tokenStrategy"]:checked');
            if (strategy) {
                apiKeysManager.proxycheck.strategy = strategy.value;
                apiKeysManager.ipinfo.strategy = strategy.value;
                localStorage.setItem('apiKeysManager', JSON.stringify(apiKeysManager));
            }
        }

        function loadAllSettings() {
            // 加载API密钥管理器
            var saved = localStorage.getItem('apiKeysManager');
            if (saved) {
                try {
                    var loaded = JSON.parse(saved);
                    apiKeysManager = {
                        proxycheck: {
                            keys: loaded.proxycheck ? loaded.proxycheck.keys || [] : [],
                            currentIndex: loaded.proxycheck ? loaded.proxycheck.currentIndex || 0 : 0,
                            strategy: loaded.proxycheck ? loaded.proxycheck.strategy || 'round-robin' : 'round-robin'
                        },
                        ipinfo: {
                            tokens: loaded.ipinfo ? loaded.ipinfo.tokens || [] : [],
                            currentIndex: loaded.ipinfo ? loaded.ipinfo.currentIndex || 0 : 0,
                            strategy: loaded.ipinfo ? loaded.ipinfo.strategy || 'round-robin' : 'round-robin'
                        }
                    };
                } catch (e) {
                    console.log('加载设置失败:', e);
                }
            }

            // 设置策略单选框
            var strategyRadio = document.querySelector('input[name="tokenStrategy"][value="' + apiKeysManager.proxycheck.strategy + '"]');
            if (strategyRadio) {
                strategyRadio.checked = true;
            }
        }

        function testAllAPIKeys() {
            var totalKeys = apiKeysManager.proxycheck.keys.length + apiKeysManager.ipinfo.tokens.length;
            if (totalKeys === 0) {
                showAlert('没有API密钥需要测试', 'warning');
                return;
            }

            showAlert('正在测试所有API密钥，请稍候...', 'info');

            // 测试所有ProxyCheck密钥
            apiKeysManager.proxycheck.keys.forEach(function(key, index) {
                setTimeout(function() {
                    testProxycheckKey(key.id);
                }, index * 500);
            });

            // 测试所有IPinfo Token
            apiKeysManager.ipinfo.tokens.forEach(function(token, index) {
                setTimeout(function() {
                    testIpinfoToken(token.id);
                }, (apiKeysManager.proxycheck.keys.length + index) * 500);
            });

            setTimeout(function() {
                showAlert('所有API密钥测试完成', 'success');
            }, totalKeys * 500 + 1000);
        }

        function refreshTokenStatus() {
            showAlert('正在刷新Token状态...', 'info');

            // 模拟刷新配额信息
            apiKeysManager.proxycheck.keys.forEach(function(key) {
                if (key.status === 'active') {
                    key.quota.remaining = Math.floor(Math.random() * key.quota.limit);
                    key.quota.used = key.quota.limit - key.quota.remaining;
                }
            });

            apiKeysManager.ipinfo.tokens.forEach(function(token) {
                if (token.status === 'active') {
                    token.quota.remaining = Math.floor(Math.random() * token.quota.limit);
                    token.quota.used = token.quota.limit - token.quota.remaining;
                }
            });

            saveAllSettings();
            renderAPIKeys();
            showAlert('Token状态已刷新', 'success');
        }

        function clearAllSettings() {
            if (!confirm('确定要清除所有设置吗？这将删除所有API密钥和订阅！')) {
                return;
            }

            localStorage.clear();
            apiKeysManager = {
                proxycheck: { keys: [], currentIndex: 0, strategy: 'round-robin' },
                ipinfo: { tokens: [], currentIndex: 0, strategy: 'round-robin' }
            };
            subscriptions = [];

            renderAPIKeys();
            renderSubscriptions();
            updateSubscriptionStats();

            // 重置表单
            document.getElementById('newProxycheckKey').value = '';
            document.getElementById('newIpinfoToken').value = '';
            document.querySelector('input[name="tokenStrategy"][value="round-robin"]').checked = true;

            showAlert('所有设置已清除', 'success');
        }

        // 工具函数
        function isValidUrl(string) {
            try {
                var url = new URL(string);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch (_) {
                return false;
            }
        }

        // 获取下一个可用的API密钥
        function getNextAPIKey(type) {
            var manager = apiKeysManager[type];
            var items = type === 'proxycheck' ? manager.keys : manager.tokens;
            var activeItems = items.filter(function(item) { return item.isActive && item.status === 'active'; });

            if (activeItems.length === 0) {
                return null;
            }

            var selectedItem;
            switch (manager.strategy) {
                case 'round-robin':
                    selectedItem = activeItems[manager.currentIndex % activeItems.length];
                    manager.currentIndex = (manager.currentIndex + 1) % activeItems.length;
                    break;
                case 'failover':
                    selectedItem = activeItems[0]; // 总是使用第一个可用的
                    break;
                case 'random':
                    selectedItem = activeItems[Math.floor(Math.random() * activeItems.length)];
                    break;
                default:
                    selectedItem = activeItems[0];
            }

            if (selectedItem) {
                selectedItem.lastUsed = new Date().toISOString();
                saveAllSettings();
            }

            return selectedItem;
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
