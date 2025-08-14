"""
Vercel API函数：检查订阅链接中的IP纯净度
"""

import json
import os
import sys
import time
import base64
import re
from urllib.parse import parse_qs, urlparse
from http.server import BaseHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor, as_completed

# 添加项目根目录到Python路径
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# 使用简化版本，避免复杂的导入依赖
import requests

def fetch_ip_info_ipinfo(ip, token=None):
    """获取IP信息从IPinfo.io"""
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
                'isp': data.get('org', ''),
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

def extract_ips_from_subscription(url, timeout=15):
    """从订阅链接提取IP地址"""
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        
        content = response.text
        
        # 尝试base64解码
        try:
            decoded_content = base64.b64decode(content).decode('utf-8')
            content = decoded_content
        except:
            pass  # 如果不是base64编码，使用原始内容
        
        # 提取IP地址的正则表达式
        ip_pattern = r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b'
        ips = re.findall(ip_pattern, content)
        
        # 验证IP地址有效性
        valid_ips = []
        for ip in ips:
            parts = ip.split('.')
            if all(0 <= int(part) <= 255 for part in parts):
                valid_ips.append(ip)
        
        return list(set(valid_ips))  # 去重
        
    except Exception as e:
        print(f"Error extracting IPs from {url}: {e}")
        return []

def extract_node_info_from_subscription(url, timeout=15):
    """从订阅链接提取节点信息（包括名称和IP）"""
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        
        content = response.text
        
        # 尝试base64解码
        try:
            decoded_content = base64.b64decode(content).decode('utf-8')
            content = decoded_content
        except:
            pass
        
        nodes = []
        lines = content.split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # 解析不同协议的节点
            node_info = parse_node_line(line)
            if node_info:
                nodes.append(node_info)
        
        return nodes
        
    except Exception as e:
        print(f"Error extracting nodes from {url}: {e}")
        return []

def parse_node_line(line):
    """解析单行节点配置"""
    try:
        # vmess://
        if line.startswith('vmess://'):
            encoded = line[8:]
            decoded = base64.b64decode(encoded).decode('utf-8')
            config = json.loads(decoded)
            return {
                'name': config.get('ps', 'Unknown'),
                'ip': config.get('add', ''),
                'port': config.get('port', ''),
                'protocol': 'vmess'
            }
        
        # vless://
        elif line.startswith('vless://'):
            # 简化解析，提取IP
            match = re.search(r'@([^:]+):', line)
            if match:
                ip = match.group(1)
                name_match = re.search(r'#([^&]+)', line)
                name = name_match.group(1) if name_match else 'Unknown'
                return {
                    'name': name,
                    'ip': ip,
                    'protocol': 'vless'
                }
        
        # trojan://
        elif line.startswith('trojan://'):
            match = re.search(r'@([^:]+):', line)
            if match:
                ip = match.group(1)
                name_match = re.search(r'#([^&]+)', line)
                name = name_match.group(1) if name_match else 'Unknown'
                return {
                    'name': name,
                    'ip': ip,
                    'protocol': 'trojan'
                }
        
        # ss://
        elif line.startswith('ss://'):
            # 简化解析
            match = re.search(r'@([^:]+):', line)
            if match:
                ip = match.group(1)
                name_match = re.search(r'#([^&]+)', line)
                name = name_match.group(1) if name_match else 'Unknown'
                return {
                    'name': name,
                    'ip': ip,
                    'protocol': 'ss'
                }
        
        # 直接IP地址
        elif re.match(r'^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$', line):
            return {
                'name': f'Direct-{line}',
                'ip': line,
                'protocol': 'direct'
            }
    
    except Exception as e:
        print(f"Error parsing node line: {e}")
    
    return None

def generate_clash_config(pure_nodes):
    """生成Clash配置文件"""
    config = {
        'port': 7890,
        'socks-port': 7891,
        'allow-lan': False,
        'mode': 'Rule',
        'log-level': 'info',
        'external-controller': '127.0.0.1:9090',
        'proxies': [],
        'proxy-groups': [
            {
                'name': '✈️ PROXY',
                'type': 'select',
                'proxies': ['⚡ AUTO', '✅ PURE']
            },
            {
                'name': '⚡ AUTO',
                'type': 'url-test',
                'proxies': [],
                'url': 'http://www.gstatic.com/generate_204',
                'interval': 300
            },
            {
                'name': '✅ PURE',
                'type': 'select',
                'proxies': []
            }
        ],
        'rules': [
            'DOMAIN-SUFFIX,local,DIRECT',
            'IP-CIDR,127.0.0.0/8,DIRECT',
            'IP-CIDR,172.16.0.0/12,DIRECT',
            'IP-CIDR,192.168.0.0/16,DIRECT',
            'IP-CIDR,10.0.0.0/8,DIRECT',
            'GEOIP,CN,DIRECT',
            'MATCH,✈️ PROXY'
        ]
    }
    
    # 添加纯净节点到配置
    for node in pure_nodes:
        proxy_name = f"{node['name']}-{node['ip']}"
        
        # 简化的代理配置（实际使用时需要完整配置）
        proxy_config = {
            'name': proxy_name,
            'type': 'http',  # 简化为http类型
            'server': node['ip'],
            'port': 80
        }
        
        config['proxies'].append(proxy_config)
        config['proxy-groups'][1]['proxies'].append(proxy_name)  # AUTO组
        config['proxy-groups'][2]['proxies'].append(proxy_name)  # PURE组
    
    # 转换为YAML格式字符串
    try:
        import yaml
        return yaml.dump(config, default_flow_style=False, allow_unicode=True)
    except ImportError:
        # 如果yaml不可用，返回简化的配置
        return f"""# Clash配置文件
# 生成时间: {time.strftime('%Y-%m-%d %H:%M:%S')}
# 纯净节点数量: {len(pure_nodes)}

port: 7890
socks-port: 7891
allow-lan: false
mode: Rule
log-level: info

# 注意：这是简化版配置，实际使用需要完整的代理配置
# 纯净节点列表：
{chr(10).join([f"# - {node['name']}: {node['ip']}" for node in pure_nodes])}
"""

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        """处理POST请求"""
        try:
            # 读取请求体
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length).decode('utf-8')
            
            # 解析表单数据
            params = parse_qs(post_data)
            
            urls = params.get('urls', [])
            if not urls:
                self.send_error_response(400, 'No subscription URLs provided')
                return
            
            generate_clash = params.get('generate_clash', ['false'])[0].lower() == 'true'
            token = self.headers.get('X-IPInfo-Token')
            
            # 处理订阅链接
            all_nodes = []
            for url in urls:
                nodes = extract_node_info_from_subscription(url.strip())
                all_nodes.extend(nodes)
            
            if not all_nodes:
                self.send_error_response(404, 'No nodes found in subscriptions')
                return
            
            # 去重（基于IP地址）
            unique_nodes = {}
            for node in all_nodes:
                if node['ip'] and node['ip'] not in unique_nodes:
                    unique_nodes[node['ip']] = node
            
            nodes_list = list(unique_nodes.values())
            
            # 批量检查IP纯净度
            results = []
            pure_nodes = []
            
            # 限制并发数避免速率限制
            max_workers = min(5, len(nodes_list))
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_node = {
                    executor.submit(self.check_node_purity, node, token): node 
                    for node in nodes_list
                }
                
                for future in as_completed(future_to_node):
                    node = future_to_node[future]
                    try:
                        result = future.result()
                        results.append(result)
                        if result['isPure']:
                            pure_nodes.append(node)
                    except Exception as e:
                        print(f"Error checking node {node['ip']}: {e}")
                        results.append({
                            'name': node['name'],
                            'ip': node['ip'],
                            'isPure': False,
                            'error': str(e)
                        })
            
            # 统计结果
            total = len(results)
            pure_count = len(pure_nodes)
            purity_rate = (pure_count / total * 100) if total > 0 else 0
            
            response_data = {
                'total': total,
                'pure': pure_count,
                'nonPure': total - pure_count,
                'purityRate': f"{purity_rate:.1f}",
                'results': results,
                'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            
            # 生成Clash配置（如果请求）
            if generate_clash and pure_nodes:
                try:
                    clash_config = generate_clash_config(pure_nodes)
                    response_data['clashConfig'] = clash_config
                except Exception as e:
                    print(f"Error generating Clash config: {e}")
            
            self.send_json_response(response_data)
            
        except Exception as e:
            print(f"Error in subscription check handler: {e}")
            self.send_error_response(500, str(e))
    
    def check_node_purity(self, node, token):
        """检查单个节点的纯净度"""
        ip = node['ip']
        ip_info = fetch_ip_info_ipinfo(ip, token)
        
        if ip_info:
            is_pure = is_pure_ip(ip_info)
            return {
                'name': node['name'],
                'ip': ip,
                'isPure': is_pure,
                'country': ip_info.get('country', ''),
                'city': ip_info.get('city', ''),
                'org': ip_info.get('org', ''),
                'privacy': ip_info.get('privacy', {}),
                'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
            }
        else:
            return {
                'name': node['name'],
                'ip': ip,
                'isPure': False,
                'error': 'Failed to fetch IP info'
            }
    
    def send_json_response(self, data, status_code=200):
        """发送JSON响应"""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-IPInfo-Token')
        self.end_headers()
        
        response_json = json.dumps(data, ensure_ascii=False, indent=2)
        self.wfile.write(response_json.encode('utf-8'))
    
    def send_error_response(self, status_code, message):
        """发送错误响应"""
        self.send_json_response({'error': message}, status_code)
    
    def do_OPTIONS(self):
        """处理CORS预检请求"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-IPInfo-Token')
        self.end_headers()
