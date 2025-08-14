"""
Vercel API函数：检查单个IP地址纯净度
"""

import json
import os
import sys
from urllib.parse import parse_qs
from http.server import BaseHTTPRequestHandler

# 添加项目根目录到Python路径
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# 使用简化版本，避免复杂的导入依赖
import requests
def fetch_ip_info_ipinfo(ip, token=None):
    """获取IP信息从IPinfo.io"""
    if not token:
        token = os.environ.get('IPINFO_TOKEN')
    headers = {'Authorization': f'Bearer {token}'} if token else {}

    try:
        response = requests.get(f'https://ipinfo.io/{ip}/json', headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return {
                'status': 'success',
                'query': data.get('ip', ip),
                'country': data.get('country', ''),
                'city': data.get('city', ''),
                'org': data.get('org', ''),
                'isp': data.get('org', ''),  # IPinfo.io使用org字段
                'privacy': data.get('privacy', {}),
                'hosting': data.get('privacy', {}).get('hosting', False),
                'vpn': data.get('privacy', {}).get('vpn', False),
                'proxy': data.get('privacy', {}).get('proxy', False),
                'tor': data.get('privacy', {}).get('tor', False)
            }
        else:
            print(f"IPinfo API error: {response.status_code}")
    except Exception as e:
        print(f"Error fetching IP info: {e}")

    return None

def is_pure_ip(ip_info):
    """判定IP是否纯净"""
    if not ip_info or ip_info.get('status') != 'success':
        return False

    # 优先检查privacy信息（IPinfo.io付费功能）
    privacy = ip_info.get('privacy', {})
    if any(privacy.get(key, False) for key in ['hosting', 'vpn', 'proxy', 'tor']):
        return False

    # 关键词检测（备用方案）
    text = ' '.join([
        ip_info.get('org', ''),
        ip_info.get('isp', ''),
        ip_info.get('as', '')
    ]).lower()

    black_keywords = [
        'amazon', 'aws', 'google', 'gcp', 'microsoft', 'azure',
        'cloudflare', 'akamai', 'fastly', 'digitalocean', 'vultr',
        'linode', 'hetzner', 'ovh', 'datacenter', 'hosting',
        'server', 'cloud', 'vps', 'dedicated'
    ]

    return not any(keyword in text for keyword in black_keywords)

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            # 解析查询参数
            query_string = self.path.split('?', 1)[1] if '?' in self.path else ''
            params = parse_qs(query_string)
            
            ip = params.get('ip', [None])[0]
            if not ip:
                self.send_error_response(400, 'IP parameter is required')
                return
            
            # 获取自定义token
            custom_token = self.headers.get('X-IPInfo-Token')

            # 获取IP信息
            ip_info = fetch_ip_info_ipinfo(ip, custom_token)
            if not ip_info:
                self.send_error_response(500, 'Failed to fetch IP information')
                return
            
            # 判定纯净度
            is_pure = is_pure_ip(ip_info)
            
            # 构建响应
            result = {
                'ip': ip,
                'country': ip_info.get('country', ''),
                'city': ip_info.get('city', ''),
                'org': ip_info.get('org', ''),
                'isPure': is_pure,
                'privacy': ip_info.get('privacy', {}),
                'timestamp': self.get_timestamp()
            }
            
            self.send_json_response(result)
            
        except Exception as e:
            print(f"Error in check-ip handler: {e}")
            self.send_error_response(500, str(e))
    
    def send_json_response(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        response_json = json.dumps(data, ensure_ascii=False, indent=2)
        self.wfile.write(response_json.encode('utf-8'))
    
    def send_error_response(self, status_code, message):
        self.send_json_response({'error': message}, status_code)
    
    def get_timestamp(self):
        from datetime import datetime
        return datetime.utcnow().isoformat() + 'Z'
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-IPInfo-Token')
        self.end_headers()
