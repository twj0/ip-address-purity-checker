"""
Vercel API函数：首页和API文档
"""

from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """处理GET请求，返回API文档页面"""
        html_content = self.get_home_page()
        
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        self.wfile.write(html_content.encode('utf-8'))
    
    def do_OPTIONS(self):
        """处理CORS预检请求"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def get_home_page(self):
        """返回首页HTML内容"""
        return """
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IP地址纯净度检查工具 API</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .status {
            background: #d4edda;
            color: #155724;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 30px;
            text-align: center;
            font-weight: bold;
        }
        .api-endpoint {
            background: #f8f9fa;
            border-left: 4px solid #007bff;
            padding: 15px;
            margin: 15px 0;
            border-radius: 5px;
        }
        .api-endpoint strong {
            color: #007bff;
            font-family: 'Courier New', monospace;
        }
        .test-section {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 5px;
            padding: 20px;
            margin: 20px 0;
        }
        .test-button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin: 5px;
        }
        .test-button:hover {
            background: #0056b3;
        }
        .result {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 5px;
            padding: 15px;
            margin-top: 10px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            white-space: pre-wrap;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 IP地址纯净度检查工具 API</h1>
        
        <div class="status">
            ✅ 服务运行正常 - 部署在 Vercel 平台
        </div>
        
        <h2>📡 API 端点</h2>
        
        <div class="api-endpoint">
            <strong>GET /api/check-ip?ip={ip}</strong><br>
            检查单个IP地址的纯净度<br>
            <small>示例: /api/check-ip?ip=8.8.8.8</small>
        </div>
        
        <div class="api-endpoint">
            <strong>GET /api/scheduled-check</strong><br>
            执行定时检查任务<br>
            <small>每日UTC 16:00自动执行</small>
        </div>
        
        <div class="test-section">
            <h3>🧪 在线测试</h3>
            <p>点击下面的按钮测试API功能：</p>
            
            <button class="test-button" onclick="testAPI('8.8.8.8')">测试 Google DNS</button>
            <button class="test-button" onclick="testAPI('1.1.1.1')">测试 Cloudflare DNS</button>
            <button class="test-button" onclick="testAPI('114.114.114.114')">测试 114 DNS</button>
            
            <div id="test-result" class="result" style="display: none;"></div>
        </div>
        
        <h2>✨ 功能特点</h2>
        <ul>
            <li>🚀 基于 Vercel 的全球边缘计算</li>
            <li>⚡ 使用 IPinfo.io 高精度数据</li>
            <li>🎯 智能纯净度判定算法</li>
            <li>🔄 支持定时自动检查</li>
            <li>📊 CORS 支持，便于前端集成</li>
        </ul>
        
        <h2>📖 使用说明</h2>
        <p><strong>纯净IP定义：</strong>非数据中心、非代理、非VPN的住宅IP地址</p>
        <p><strong>判定依据：</strong>IPinfo.io隐私数据 + 关键词匹配</p>
        <p><strong>响应格式：</strong>JSON，包含IP信息和纯净度状态</p>
        
        <div class="footer">
            <p>Powered by Vercel | <a href="https://github.com/your-username/ip-address-purity-checker" target="_blank">GitHub</a></p>
            <p><small>API调用受IPinfo.io速率限制约束</small></p>
        </div>
    </div>
    
    <script>
        async function testAPI(ip) {
            const resultDiv = document.getElementById('test-result');
            resultDiv.style.display = 'block';
            resultDiv.textContent = '正在测试...';
            
            try {
                const response = await fetch(`/api/check-ip?ip=${ip}`);
                const data = await response.json();
                
                resultDiv.textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                resultDiv.textContent = `错误: ${error.message}`;
            }
        }
    </script>
</body>
</html>
        """
