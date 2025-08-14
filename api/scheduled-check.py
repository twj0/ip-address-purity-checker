"""
Vercel定时任务：执行完整的IP纯净度检查
"""

import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor, as_completed

# 添加项目根目录到Python路径
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# 订阅链接列表
SUBSCRIPTION_URLS = [
    'https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray',
    'https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list_raw.txt',
    'https://raw.githubusercontent.com/ermaozi/get_subscribe/main/subscribe/v2ray.txt',
    'https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2',
    'https://raw.githubusercontent.com/mahdibland/SSAggregator/master/sub/airport_sub_merge.txt'
]

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            print("Starting scheduled IP purity check...")
            
            # 执行完整检查
            result = self.perform_full_check()
            
            # 返回结果
            self.send_json_response({
                'status': 'completed',
                'timestamp': self.get_timestamp(),
                'result': result
            })
            
        except Exception as e:
            print(f"Error in scheduled check: {e}")
            self.send_error_response(500, str(e))
    
    def perform_full_check(self):
        """执行完整的IP纯净度检查"""
        all_ips = set()
        
        # 从所有订阅收集IP
        print(f"Processing {len(SUBSCRIPTION_URLS)} subscription URLs...")
        for url in SUBSCRIPTION_URLS:
            try:
                ips = self.extract_ips_from_subscription(url)
                all_ips.update(ips)
                print(f"Extracted {len(ips)} IPs from {url}")
            except Exception as e:
                print(f"Failed to process {url}: {e}")
        
        unique_ips = list(all_ips)[:500]  # 限制处理数量以避免超时
        print(f"Processing {len(unique_ips)} unique IPs...")
        
        # 并发检查IP纯净度
        results = []
        with ThreadPoolExecutor(max_workers=20) as executor:
            future_to_ip = {
                executor.submit(self.check_ip_purity, ip): ip 
                for ip in unique_ips
            }
            
            for future in as_completed(future_to_ip):
                ip = future_to_ip[future]
                try:
                    result = future.result()
                    if result:
                        results.append(result)
                except Exception as e:
                    print(f"Error checking {ip}: {e}")
        
        # 统计结果
        pure_count = sum(1 for r in results if r.get('isPure', False))
        total_count = len(results)
        
        return {
            'total_ips': total_count,
            'pure_ips': pure_count,
            'non_pure_ips': total_count - pure_count,
            'purity_rate': round(pure_count / total_count * 100, 1) if total_count > 0 else 0,
            'sample_results': results[:50]  # 返回前50个结果作为样本
        }
    
    def extract_ips_from_subscription(self, url):
        """从订阅链接提取IP地址"""
        import requests
        import re
        import base64
        
        try:
            response = requests.get(url, timeout=15)
            text = response.text
            
            # 尝试Base64解码
            try:
                decoded = base64.b64decode(text + '==').decode('utf-8', errors='ignore')
                if len(decoded) > len(text) * 0.5:  # 如果解码后长度合理
                    text = decoded
            except:
                pass
            
            # 提取IP地址
            ip_pattern = r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b'
            ips = re.findall(ip_pattern, text)
            
            # 验证IP地址
            valid_ips = []
            for ip in ips:
                parts = ip.split('.')
                if all(0 <= int(part) <= 255 for part in parts):
                    valid_ips.append(ip)
            
            return list(set(valid_ips))
            
        except Exception as e:
            print(f"Error extracting IPs from {url}: {e}")
            return []
    
    def check_ip_purity(self, ip):
        """检查单个IP的纯净度"""
        import requests
        
        token = os.environ.get('IPINFO_TOKEN')
        headers = {'Authorization': f'Bearer {token}'} if token else {}
        
        try:
            # 获取IP信息
            response = requests.get(f'https://ipinfo.io/{ip}/json', headers=headers, timeout=10)
            if response.status_code != 200:
                return None
            
            data = response.json()
            
            # 判定纯净度
            privacy = data.get('privacy', {})
            is_hosting = privacy.get('hosting', False)
            is_vpn = privacy.get('vpn', False)
            is_proxy = privacy.get('proxy', False)
            is_tor = privacy.get('tor', False)
            
            # 如果没有privacy信息，使用关键词检测
            is_pure = True
            if privacy:
                is_pure = not (is_hosting or is_vpn or is_proxy or is_tor)
            else:
                text = ' '.join([
                    data.get('org', ''),
                    data.get('isp', ''),
                    data.get('as', '')
                ]).lower()
                
                black_keywords = [
                    'amazon', 'aws', 'google', 'gcp', 'microsoft', 'azure',
                    'cloudflare', 'akamai', 'fastly', 'digitalocean', 'vultr',
                    'linode', 'hetzner', 'ovh', 'datacenter', 'hosting'
                ]
                
                is_pure = not any(keyword in text for keyword in black_keywords)
            
            return {
                'ip': ip,
                'country': data.get('country', ''),
                'city': data.get('city', ''),
                'org': data.get('org', ''),
                'isPure': is_pure,
                'privacy': privacy
            }
            
        except Exception as e:
            print(f"Error checking IP {ip}: {e}")
            return None
    
    def send_json_response(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response_json = json.dumps(data, ensure_ascii=False, indent=2)
        self.wfile.write(response_json.encode('utf-8'))
    
    def send_error_response(self, status_code, message):
        self.send_json_response({'error': message}, status_code)
    
    def get_timestamp(self):
        from datetime import datetime
        return datetime.utcnow().isoformat() + 'Z'
