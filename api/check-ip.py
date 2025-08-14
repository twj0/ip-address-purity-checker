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
def fetch_ip_info_proxycheck(ip, api_key=None):
    """使用ProxyCheck.io获取IP信息（专业代理检测）"""
    if not api_key:
        api_key = os.environ.get('PROXYCHECK_API_KEY')

    # 构建请求URL
    url = f'http://proxycheck.io/v2/{ip}'
    params = {
        'vpn': '1',      # 检测VPN
        'risk': '1',     # 获取风险评分
        'asn': '1',      # 获取ASN信息
    }

    if api_key:
        params['key'] = api_key

    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()

            # 检查API响应状态
            if data.get('status') != 'ok':
                print(f"ProxyCheck API error: {data.get('message', 'Unknown error')}")
                return None

            # 提取IP数据
            ip_data = data.get(ip)
            if not ip_data:
                print(f"No data returned for IP {ip}")
                return None

            # 标准化数据格式
            is_proxy = ip_data.get('proxy', 'no') == 'yes'
            proxy_type = ip_data.get('type', '')
            risk_score = int(ip_data.get('risk', 0))

            # 判定纯净度（风险评分60以上认为非纯净）
            is_pure = not is_proxy and risk_score < 60

            return {
                'status': 'success',
                'query': ip,
                'ip': ip,
                'country': ip_data.get('country', ''),
                'city': ip_data.get('city', ''),
                'org': ip_data.get('isp', ''),
                'isp': ip_data.get('isp', ''),
                'as': ip_data.get('asn', ''),

                # ProxyCheck.io特有字段
                'is_proxy': is_proxy,
                'proxy_type': proxy_type,
                'risk_score': risk_score,
                'is_pure': is_pure,

                # 兼容性字段
                'privacy': {
                    'hosting': proxy_type.lower() == 'hosting',
                    'vpn': proxy_type.lower() == 'vpn',
                    'proxy': is_proxy and proxy_type.lower() in ['public proxy', 'corporate proxy'],
                    'tor': proxy_type.lower() == 'tor'
                },
                'provider': 'proxycheck.io'
            }
        else:
            print(f"ProxyCheck API HTTP error: {response.status_code}")
    except Exception as e:
        print(f"Error fetching IP info from ProxyCheck: {e}")

    return None

def fetch_ip_info_ipinfo(ip, token=None):
    """获取IP信息从IPinfo.io（备用方案）"""
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
                'tor': data.get('privacy', {}).get('tor', False),
                'provider': 'ipinfo.io'
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

    # 优先使用ProxyCheck.io的专业检测结果
    if ip_info.get('provider') == 'proxycheck.io':
        return ip_info.get('is_pure', False)

    # 回退到IPinfo.io的privacy信息
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
            
            # 获取自定义API密钥
            proxycheck_key = self.headers.get('X-ProxyCheck-Key')
            ipinfo_token = self.headers.get('X-IPInfo-Token')

            # 优先使用ProxyCheck.io进行专业检测
            ip_info = fetch_ip_info_proxycheck(ip, proxycheck_key)

            # 如果ProxyCheck失败，回退到IPinfo.io
            if not ip_info:
                ip_info = fetch_ip_info_ipinfo(ip, ipinfo_token)

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
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-IPInfo-Token, X-ProxyCheck-Key')
        self.end_headers()
