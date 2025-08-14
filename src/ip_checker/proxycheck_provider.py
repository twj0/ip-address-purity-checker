"""
ProxyCheck.io API服务提供者
专门用于检测IP地址的代理/VPN状态和纯净度评分
"""

import time
import logging
import os
from typing import Optional, Dict, List
import requests

logger = logging.getLogger(__name__)


class ProxyCheckProvider:
    """ProxyCheck.io API服务提供者"""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        初始化ProxyCheck提供者
        
        Args:
            api_key: API密钥，如果为None则从环境变量读取
        """
        self.api_key = api_key or self._get_api_key()
        self.base_url = "http://proxycheck.io/v2"
        self.session = requests.Session()
        
        # 配置连接池
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=10,
            pool_maxsize=10,
            max_retries=0
        )
        self.session.mount('http://', adapter)
        self.session.mount('https://', adapter)
        
        self.session.headers.update({
            'User-Agent': 'IP-Purity-Checker/2.0',
            'Accept': 'application/json'
        })
        
        # 速率限制控制
        self.last_request_time = 0
        if self.api_key:
            # 付费用户：更高的速率限制
            self.min_interval = 0.1  # 10 requests/second
            self.daily_limit = 10000  # 根据套餐调整
        else:
            # 免费用户：严格的速率限制
            self.min_interval = 0.5   # 2 requests/second
            self.daily_limit = 1000   # 每日1000次
        
        # 请求计数器
        self.request_count = 0
        self.request_times = []
        
        logger.info(f"ProxyCheck provider initialized with API key: {'Yes' if self.api_key else 'No'}")
        logger.info(f"Rate limit: {1/self.min_interval:.0f} req/sec, Daily limit: {self.daily_limit}")
    
    def _get_api_key(self) -> Optional[str]:
        """从环境变量或文件获取API密钥"""
        # 首先尝试环境变量
        api_key = os.getenv('PROXYCHECK_API_KEY')
        if api_key:
            return api_key.strip()
        
        # 尝试从文件读取
        key_files = ['proxycheck-api-key.txt', 'proxycheck_key.txt']
        for key_file in key_files:
            try:
                if os.path.exists(key_file):
                    with open(key_file, 'r') as f:
                        content = f.read().strip()
                        if content:
                            return content
            except Exception as e:
                logger.debug(f"Failed to read API key from {key_file}: {e}")
        
        logger.warning("No ProxyCheck.io API key found. Using free tier with limited requests.")
        return None
    
    def _rate_limit(self):
        """实施速率限制"""
        current_time = time.time()
        
        # 清理超过1分钟的请求记录
        self.request_times = [t for t in self.request_times if current_time - t < 60]
        
        # 检查每分钟请求数限制
        requests_per_minute = 60 / self.min_interval
        if len(self.request_times) >= requests_per_minute:
            sleep_time = 60 - (current_time - self.request_times[0]) + 0.1
            if sleep_time > 0:
                logger.debug(f"Rate limit reached, sleeping for {sleep_time:.1f}s")
                time.sleep(sleep_time)
                current_time = time.time()
                self.request_times = [t for t in self.request_times if current_time - t < 60]
        
        # 基本间隔控制
        time_since_last = current_time - self.last_request_time
        if time_since_last < self.min_interval:
            sleep_time = self.min_interval - time_since_last
            time.sleep(sleep_time)
            current_time = time.time()
        
        # 记录请求时间
        self.request_times.append(current_time)
        self.last_request_time = current_time
        self.request_count += 1
    
    def check_ip(self, ip: str, timeout: int = 10) -> Optional[Dict]:
        """
        检查单个IP地址
        
        Args:
            ip: 要检查的IP地址
            timeout: 请求超时时间
            
        Returns:
            包含IP信息和纯净度数据的字典，失败时返回None
        """
        self._rate_limit()
        
        # 构建请求URL
        params = {
            'vpn': '1',      # 检测VPN
            'risk': '1',     # 获取风险评分
            'asn': '1',      # 获取ASN信息
        }
        
        if self.api_key:
            params['key'] = self.api_key
        
        url = f"{self.base_url}/{ip}"
        
        try:
            logger.debug(f"Checking IP {ip} with ProxyCheck.io")
            response = self.session.get(url, params=params, timeout=timeout)
            response.raise_for_status()
            
            data = response.json()
            
            # 检查API响应状态
            if data.get('status') == 'error':
                error_msg = data.get('message', 'Unknown error')
                logger.error(f"ProxyCheck API error for {ip}: {error_msg}")
                return None
            
            if data.get('status') != 'ok':
                logger.warning(f"Unexpected API status for {ip}: {data.get('status')}")
                return None
            
            # 提取IP数据
            ip_data = data.get(ip)
            if not ip_data:
                logger.warning(f"No data returned for IP {ip}")
                return None
            
            # 标准化数据格式
            result = self._normalize_response(ip, ip_data)
            logger.debug(f"Successfully checked {ip}: risk={result.get('risk_score', 0)}, pure={result.get('is_pure', False)}")
            
            return result
            
        except requests.exceptions.Timeout:
            logger.error(f"Timeout checking IP {ip}")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"Request error checking IP {ip}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error checking IP {ip}: {e}")
            return None
    
    def check_multiple_ips(self, ips: List[str], timeout: int = 10) -> Dict[str, Optional[Dict]]:
        """
        批量检查多个IP地址
        
        Args:
            ips: IP地址列表
            timeout: 请求超时时间
            
        Returns:
            IP地址到结果的映射字典
        """
        results = {}
        
        for ip in ips:
            try:
                result = self.check_ip(ip, timeout)
                results[ip] = result
            except Exception as e:
                logger.error(f"Error checking IP {ip}: {e}")
                results[ip] = None
        
        return results
    
    def _normalize_response(self, ip: str, ip_data: Dict) -> Dict:
        """
        标准化ProxyCheck.io响应数据格式
        
        Args:
            ip: IP地址
            ip_data: ProxyCheck.io返回的IP数据
            
        Returns:
            标准化的数据字典
        """
        # 基本信息
        is_proxy = ip_data.get('proxy', 'no') == 'yes'
        proxy_type = ip_data.get('type', '')
        risk_score = int(ip_data.get('risk', 0))
        
        # 地理位置信息
        country = ip_data.get('country', '')
        city = ip_data.get('city', '')
        region = ip_data.get('region', '')
        
        # 网络信息
        isp = ip_data.get('isp', '')
        asn = ip_data.get('asn', '')
        
        # 判定纯净度
        is_pure = self._determine_purity(is_proxy, proxy_type, risk_score)
        
        # 构建标准化响应
        result = {
            'status': 'success',
            'query': ip,
            'ip': ip,
            'country': country,
            'city': city,
            'region': region,
            'isp': isp,
            'org': isp,  # 兼容性字段
            'as': asn,
            'asn': asn,
            
            # ProxyCheck.io特有字段
            'is_proxy': is_proxy,
            'proxy_type': proxy_type,
            'risk_score': risk_score,
            'is_pure': is_pure,
            
            # 兼容性字段（模拟IPinfo.io格式）
            'privacy': {
                'hosting': proxy_type.lower() == 'hosting',
                'vpn': proxy_type.lower() == 'vpn',
                'proxy': is_proxy and proxy_type.lower() in ['public proxy', 'corporate proxy'],
                'tor': proxy_type.lower() == 'tor'
            },
            
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
            'provider': 'proxycheck.io'
        }
        
        return result
    
    def _determine_purity(self, is_proxy: bool, proxy_type: str, risk_score: int) -> bool:
        """
        根据ProxyCheck.io数据判定IP纯净度
        
        Args:
            is_proxy: 是否为代理
            proxy_type: 代理类型
            risk_score: 风险评分 (0-100)
            
        Returns:
            True表示纯净IP，False表示非纯净IP
        """
        # 如果明确检测为代理，则非纯净
        if is_proxy:
            return False
        
        # 根据风险评分判定
        # 0-33: 低风险，可能是纯净IP
        # 34-65: 中等风险，需要谨慎
        # 66-100: 高风险，很可能是代理/VPN
        if risk_score >= 60:  # 调整阈值，60分以上认为非纯净
            return False
        
        # 特定类型检查
        high_risk_types = ['hosting', 'vpn', 'public proxy', 'residential proxy']
        if proxy_type.lower() in high_risk_types:
            return False
        
        return True
    
    def test_connection(self) -> Dict[str, any]:
        """
        测试API连接
        
        Returns:
            包含测试结果的字典
        """
        try:
            # 使用Google DNS进行测试
            test_ip = "8.8.8.8"
            result = self.check_ip(test_ip)
            
            if result:
                return {
                    'success': True,
                    'message': 'ProxyCheck.io API connection successful',
                    'test_ip': test_ip,
                    'api_key_used': bool(self.api_key),
                    'daily_limit': self.daily_limit,
                    'requests_made': self.request_count
                }
            else:
                return {
                    'success': False,
                    'message': 'ProxyCheck.io API test failed - no data returned',
                    'api_key_used': bool(self.api_key)
                }
                
        except Exception as e:
            return {
                'success': False,
                'message': f'ProxyCheck.io API test failed: {str(e)}',
                'api_key_used': bool(self.api_key)
            }
    
    def get_usage_stats(self) -> Dict[str, any]:
        """
        获取使用统计信息
        
        Returns:
            使用统计字典
        """
        return {
            'requests_made': self.request_count,
            'daily_limit': self.daily_limit,
            'remaining_requests': max(0, self.daily_limit - self.request_count),
            'api_key_configured': bool(self.api_key),
            'rate_limit': f"{1/self.min_interval:.1f} req/sec"
        }


# 便捷函数
def fetch_ip_info_proxycheck(ip: str, api_key: Optional[str] = None, timeout: int = 10) -> Optional[Dict]:
    """
    使用ProxyCheck.io检查IP地址的便捷函数
    
    Args:
        ip: 要检查的IP地址
        api_key: API密钥（可选）
        timeout: 超时时间
        
    Returns:
        IP信息字典或None
    """
    provider = ProxyCheckProvider(api_key)
    return provider.check_ip(ip, timeout)
