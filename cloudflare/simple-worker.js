/**
 * 简化版本的Cloudflare Worker用于诊断JavaScript问题
 */

export default {
    async fetch(request, env, ctx) {
        return handleRequest(request, env, ctx);
    }
};

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
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }
    
    try {
        switch (path) {
            case '/':
            case '/index.html':
                return new Response(getSimplePage(), {
                    headers: { 
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    }
                });
                
            default:
                return new Response('Not Found', { status: 404 });
        }
    } catch (error) {
        console.error('Error handling request:', error);
        return new Response('Internal Server Error: ' + error.message, { status: 500 });
    }
}

function getSimplePage() {
    // 使用字符串拼接而不是模板字面量
    var html = '';
    html += '<!DOCTYPE html>\n';
    html += '<html lang="zh-CN">\n';
    html += '<head>\n';
    html += '    <meta charset="UTF-8">\n';
    html += '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
    html += '    <title>IP地址纯净度检查工具</title>\n';
    html += '    <style>\n';
    html += '        body { font-family: Arial, sans-serif; padding: 20px; background: #fff; }\n';
    html += '        .container { max-width: 800px; margin: 0 auto; }\n';
    html += '        .tabs { display: flex; border-bottom: 2px solid #e1e5e9; margin-bottom: 20px; }\n';
    html += '        .tab { padding: 12px 24px; cursor: pointer; border: none; background: none; }\n';
    html += '        .tab.active { color: #007bff; border-bottom: 2px solid #007bff; }\n';
    html += '        .tab-content { display: none; }\n';
    html += '        .tab-content.active { display: block; }\n';
    html += '        .btn { background: #007bff; color: white; border: none; padding: 10px 20px; margin: 5px; cursor: pointer; }\n';
    html += '        .result { background: #f8f9fa; padding: 10px; margin: 10px 0; border: 1px solid #ddd; }\n';
    html += '    </style>\n';
    html += '</head>\n';
    html += '<body>\n';
    html += '    <div class="container">\n';
    html += '        <h1>IP地址纯净度检查工具</h1>\n';
    html += '        \n';
    html += '        <div class="tabs">\n';
    html += '            <button class="tab active" onclick="switchTab(\'single-ip\', this)">单IP检测</button>\n';
    html += '            <button class="tab" onclick="switchTab(\'batch-ip\', this)">批量检测</button>\n';
    html += '            <button class="tab" onclick="switchTab(\'settings\', this)">设置</button>\n';
    html += '        </div>\n';
    html += '        \n';
    html += '        <div id="single-ip" class="tab-content active">\n';
    html += '            <h2>单IP检测</h2>\n';
    html += '            <input type="text" id="singleIp" placeholder="输入IP地址" value="8.8.8.8" style="width: 300px; padding: 8px;">\n';
    html += '            <button class="btn" onclick="checkSingleIP()">检测IP</button>\n';
    html += '            <div id="singleResult" class="result" style="display: none;"></div>\n';
    html += '        </div>\n';
    html += '        \n';
    html += '        <div id="batch-ip" class="tab-content">\n';
    html += '            <h2>批量检测</h2>\n';
    html += '            <textarea id="batchIps" rows="5" placeholder="每行一个IP地址" style="width: 100%; padding: 8px;"></textarea>\n';
    html += '            <button class="btn" onclick="checkBatchIPs()">批量检测</button>\n';
    html += '            <div id="batchResult" class="result" style="display: none;"></div>\n';
    html += '        </div>\n';
    html += '        \n';
    html += '        <div id="settings" class="tab-content">\n';
    html += '            <h2>设置</h2>\n';
    html += '            <p>API密钥配置</p>\n';
    html += '            <input type="text" id="apiKey" placeholder="输入API密钥" style="width: 300px; padding: 8px;">\n';
    html += '            <button class="btn" onclick="saveSettings()">保存设置</button>\n';
    html += '        </div>\n';
    html += '    </div>\n';
    html += '    \n';
    html += '    <script>\n';
    html += '        // 全局变量\n';
    html += '        var currentTab = "single-ip";\n';
    html += '        \n';
    html += '        // 标签页切换\n';
    html += '        function switchTab(tabName, clickedElement) {\n';
    html += '            console.log("switchTab called with:", tabName);\n';
    html += '            \n';
    html += '            // 隐藏所有标签页内容\n';
    html += '            var contents = document.querySelectorAll(".tab-content");\n';
    html += '            for (var i = 0; i < contents.length; i++) {\n';
    html += '                contents[i].classList.remove("active");\n';
    html += '            }\n';
    html += '            \n';
    html += '            // 移除所有标签页的active类\n';
    html += '            var tabs = document.querySelectorAll(".tab");\n';
    html += '            for (var i = 0; i < tabs.length; i++) {\n';
    html += '                tabs[i].classList.remove("active");\n';
    html += '            }\n';
    html += '            \n';
    html += '            // 显示选中的标签页\n';
    html += '            document.getElementById(tabName).classList.add("active");\n';
    html += '            if (clickedElement) {\n';
    html += '                clickedElement.classList.add("active");\n';
    html += '            }\n';
    html += '            \n';
    html += '            currentTab = tabName;\n';
    html += '        }\n';
    html += '        \n';
    html += '        // 单IP检测\n';
    html += '        function checkSingleIP() {\n';
    html += '            console.log("checkSingleIP called");\n';
    html += '            var ip = document.getElementById("singleIp").value.trim();\n';
    html += '            if (!ip) {\n';
    html += '                alert("请输入IP地址");\n';
    html += '                return;\n';
    html += '            }\n';
    html += '            \n';
    html += '            var resultDiv = document.getElementById("singleResult");\n';
    html += '            resultDiv.style.display = "block";\n';
    html += '            resultDiv.innerHTML = "正在检测IP: " + ip + "...";\n';
    html += '            \n';
    html += '            // 模拟检测结果\n';
    html += '            setTimeout(function() {\n';
    html += '                resultDiv.innerHTML = "检测完成！IP: " + ip + " - 状态: 正常";\n';
    html += '            }, 1000);\n';
    html += '        }\n';
    html += '        \n';
    html += '        // 批量检测\n';
    html += '        function checkBatchIPs() {\n';
    html += '            console.log("checkBatchIPs called");\n';
    html += '            var ipsText = document.getElementById("batchIps").value.trim();\n';
    html += '            if (!ipsText) {\n';
    html += '                alert("请输入IP地址列表");\n';
    html += '                return;\n';
    html += '            }\n';
    html += '            \n';
    html += '            var resultDiv = document.getElementById("batchResult");\n';
    html += '            resultDiv.style.display = "block";\n';
    html += '            resultDiv.innerHTML = "正在批量检测...";\n';
    html += '            \n';
    html += '            setTimeout(function() {\n';
    html += '                resultDiv.innerHTML = "批量检测完成！";\n';
    html += '            }, 2000);\n';
    html += '        }\n';
    html += '        \n';
    html += '        // 保存设置\n';
    html += '        function saveSettings() {\n';
    html += '            console.log("saveSettings called");\n';
    html += '            var apiKey = document.getElementById("apiKey").value.trim();\n';
    html += '            if (apiKey) {\n';
    html += '                localStorage.setItem("api_key", apiKey);\n';
    html += '                alert("设置保存成功！");\n';
    html += '            } else {\n';
    html += '                alert("请输入API密钥");\n';
    html += '            }\n';
    html += '        }\n';
    html += '        \n';
    html += '        // 页面加载完成后初始化\n';
    html += '        document.addEventListener("DOMContentLoaded", function() {\n';
    html += '            console.log("页面加载完成，JavaScript正常运行");\n';
    html += '        });\n';
    html += '        \n';
    html += '        console.log("JavaScript代码加载完成");\n';
    html += '    </script>\n';
    html += '</body>\n';
    html += '</html>\n';
    
    return html;
}
