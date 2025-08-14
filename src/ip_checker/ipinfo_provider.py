#!/usr/bin/env python3
"""
IPinfo.io服务提供者
提供与ip-api.com兼容的接口
"""

import logging
import os
import time
from typing import Dict, Optional, List
import requests

logger = logging.getLogger(__name__)

class IPInfoProvider:
    """IPinfo.io API服务提供者"""
    
    def __init__(self, api_token: Optional[str] = None):
        """
        初始化IPinfo提供者
        
        Args:
            api_token: API token，如果为None则从环境变量或文件读取
        """
        self.api_token = api_token or self._get_api_token()
        self.base_url = "https://ipinfo.io"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'IP-Checker/1.0',
            'Accept': 'application/json'
        })
        
        if self.api_token:
            self.session.headers['Authorization'] = f'Bearer {self.api_token}'
        
        # 速率限制控制
        self.last_request_time = 0
        self.min_interval = 0.1  # IPinfo.io限制更宽松，100ms间隔
        
        logger.info(f"IPinfo provider initialized with token: {self.api_token[:8] if self.api_token else 'None'}...")
    
    def _get_api_token(self) -> Optional[str]:
        """获取API token，优先级：环境变量 > 文件"""
        # 1. 从环境变量获取
        token = os.getenv('IPINFO_TOKEN')
        if token:
            logger.info("Using IPinfo token from environment variable")
            return token
        
        # 2. 从文件获取
        try:
            with open('ipinfo-token.txt', 'r') as f:
                content = f.read().strip()
                tokens = [t.strip() for t in content.split(',') if t.strip()]
                if tokens:
                    logger.info("Using IPinfo token from ipinfo-token.txt file")
                    return tokens[0]  # 使用第一个token
        except FileNotFoundError:
            logger.warning("ipinfo-token.txt file not found")
        
        logger.warning("No IPinfo token found, will use free tier")
        return None
    
    def _rate_limit(self):
        """实施速率限制"""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < self.min_interval:
            sleep_time = self.min_interval - time_since_last
            time.sleep(sleep_time)
        
        self.last_request_time = time.time()
    
    def fetch_ip_info(self, ip: str, timeout: int = 10) -> Optional[Dict]:
        """
        获取IP信息，返回与ip-api.com兼容的格式
        
        Args:
            ip: IP地址
            timeout: 超时时间
            
        Returns:
            与ip-api.com兼容的字典格式，如果失败返回None
        """
        self._rate_limit()
        
        try:
            logger.info(f'Fetching IP details from IPinfo for: {ip}')
            
            url = f"{self.base_url}/{ip}/json"
            response = self.session.get(url, timeout=timeout)
            
            if response.status_code == 200:
                data = response.json()
                return self._normalize_response(data)
            elif response.status_code == 401:
                logger.error("IPinfo API: Invalid token (401)")
                return None
            elif response.status_code == 429:
                logger.warning("IPinfo API: Rate limit exceeded (429)")
                return None
            else:
                logger.error(f"IPinfo API error: HTTP {response.status_code}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f'Error fetching IP details from IPinfo for {ip}: {e}')
            return None
    
    def _normalize_response(self, data: Dict) -> Dict:
        """
        将IPinfo响应转换为与ip-api.com兼容的格式
        
        Args:
            data: IPinfo原始响应数据
            
        Returns:
            ip-api.com兼容格式的字典
        """
        # 解析位置信息
        loc = data.get('loc', '0,0')
        try:
            lat, lon = map(float, loc.split(','))
        except (ValueError, AttributeError):
            lat, lon = 0.0, 0.0
        
        # 构建兼容格式
        normalized = {
            'status': 'success' if 'ip' in data else 'fail',
            'country': data.get('country', ''),
            'countryCode': data.get('country', ''),
            'region': data.get('region', ''),
            'regionName': data.get('region', ''),
            'city': data.get('city', ''),
            'zip': data.get('postal', ''),
            'lat': lat,
            'lon': lon,
            'timezone': data.get('timezone', ''),
            'isp': data.get('org', ''),
            'org': data.get('org', ''),
            'as': data.get('org', ''),
            'asname': data.get('org', ''),
            'query': data.get('ip', ''),
            'reverse': data.get('hostname', ''),
        }
        
        # 添加隐私信息（如果可用）
        if 'privacy' in data:
            privacy = data['privacy']
            # 将privacy信息添加到主字典中，便于纯净度判定
            normalized['privacy'] = privacy
            normalized['hosting'] = privacy.get('hosting', False)
            normalized['vpn'] = privacy.get('vpn', False)
            normalized['proxy'] = privacy.get('proxy', False)
            normalized['tor'] = privacy.get('tor', False)
        
        return normalized
    
    def test_connection(self) -> Dict:
        """
        测试API连接
        
        Returns:
            包含测试结果的字典
        """
        test_ip = "8.8.8.8"
        
        try:
            result = self.fetch_ip_info(test_ip)
            
            if result and result.get('status') == 'success':
                return {
                    'success': True,
                    'message': 'IPinfo API connection successful',
                    'data': result
                }
            else:
                return {
                    'success': False,
                    'message': 'IPinfo API returned invalid response',
                    'data': result
                }
        
        except Exception as e:
            return {
                'success': False,
                'message': f'IPinfo API connection failed: {e}',
                'data': None
            }


# 全局实例
_ipinfo_provider = None

def get_ipinfo_provider() -> IPInfoProvider:
    """获取全局IPinfo提供者实例"""
    global _ipinfo_provider
    if _ipinfo_provider is None:
        _ipinfo_provider = IPInfoProvider()
    return _ipinfo_provider

def fetch_ip_info_ipinfo(ip: str, timeout: int = 10) -> Optional[Dict]:
    """
    使用IPinfo.io获取IP信息的便捷函数
    
    Args:
        ip: IP地址
        timeout: 超时时间
        
    Returns:
        与ip-api.com兼容的字典格式
    """
    provider = get_ipinfo_provider()
    return provider.fetch_ip_info(ip, timeout)
