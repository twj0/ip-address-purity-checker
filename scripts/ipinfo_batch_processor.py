#!/usr/bin/env python3
"""
使用IPinfo.io的优化批量IP处理器
利用更高的速率限制和智能缓存
"""

import sys
import os
import time
import json
import sqlite3
import logging
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional, Tuple
import requests

# 添加src路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from ip_checker.subscription import collect_ips_from_links, load_subscription_links
from ip_checker.ip_utils import is_pure_ip

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class OptimizedIPInfoProcessor:
    """优化的IPinfo处理器，支持缓存和高并发"""
    
    def __init__(self, cache_hours: int = 24, max_workers: int = 50):
        self.cache_duration = timedelta(hours=cache_hours)
        self.max_workers = max_workers
        self.api_token = self._get_api_token()
        self.session = requests.Session()
        
        if self.api_token:
            self.session.headers.update({
                'Authorization': f'Bearer {self.api_token}',
                'User-Agent': 'IP-Checker-Optimized/1.0'
            })
        
        self._init_cache()
        logger.info(f"Initialized with token: {self.api_token[:8] if self.api_token else 'None'}...")
    
    def _get_api_token(self) -> Optional[str]:
        """获取API token"""
        # 环境变量优先
        token = os.getenv('IPINFO_TOKEN')
        if token:
            return token
        
        # 从文件读取
        try:
            with open('ipinfo-token.txt', 'r') as f:
                tokens = [t.strip() for t in f.read().strip().split(',') if t.strip()]
                return tokens[0] if tokens else None
        except FileNotFoundError:
            return None
    
    def _init_cache(self):
        """初始化SQLite缓存"""
        self.cache_db = 'ip_cache.db'
        conn = sqlite3.connect(self.cache_db)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS ip_cache (
                ip TEXT PRIMARY KEY,
                data TEXT,
                timestamp DATETIME,
                source TEXT
            )
        ''')
        conn.commit()
        conn.close()
    
    def _get_from_cache(self, ip: str) -> Optional[Dict]:
        """从缓存获取IP信息"""
        conn = sqlite3.connect(self.cache_db)
        cursor = conn.execute(
            'SELECT data, timestamp FROM ip_cache WHERE ip = ?', (ip,)
        )
        row = cursor.fetchone()
        conn.close()
        
        if row:
            data_json, timestamp_str = row
            cache_time = datetime.fromisoformat(timestamp_str)
            
            if datetime.now() - cache_time < self.cache_duration:
                return json.loads(data_json)
        
        return None
    
    def _save_to_cache(self, ip: str, data: Dict, source: str = 'ipinfo'):
        """保存到缓存"""
        conn = sqlite3.connect(self.cache_db)
        conn.execute(
            'INSERT OR REPLACE INTO ip_cache (ip, data, timestamp, source) VALUES (?, ?, ?, ?)',
            (ip, json.dumps(data), datetime.now().isoformat(), source)
        )
        conn.commit()
        conn.close()
    
    def fetch_ip_info(self, ip: str) -> Optional[Dict]:
        """获取单个IP信息，优先使用缓存"""
        # 先检查缓存
        cached = self._get_from_cache(ip)
        if cached:
            logger.debug(f"Cache hit for {ip}")
            return cached
        
        # 缓存未命中，从API获取
        if not self.api_token:
            logger.warning(f"No API token, skipping {ip}")
            return None
        
        try:
            url = f"https://ipinfo.io/{ip}/json"
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                normalized = self._normalize_response(data)
                self._save_to_cache(ip, normalized, 'ipinfo')
                return normalized
            elif response.status_code == 429:
                logger.warning(f"Rate limited for {ip}")
                return None
            else:
                logger.error(f"API error for {ip}: {response.status_code}")
                return None
        
        except Exception as e:
            logger.error(f"Error fetching {ip}: {e}")
            return None
    
    def _normalize_response(self, data: Dict) -> Dict:
        """转换为兼容格式"""
        loc = data.get('loc', '0,0')
        try:
            lat, lon = map(float, loc.split(','))
        except (ValueError, AttributeError):
            lat, lon = 0.0, 0.0
        
        normalized = {
            'status': 'success' if 'ip' in data else 'fail',
            'country': data.get('country', ''),
            'countryCode': data.get('country', ''),
            'region': data.get('region', ''),
            'city': data.get('city', ''),
            'lat': lat,
            'lon': lon,
            'isp': data.get('org', ''),
            'org': data.get('org', ''),
            'as': data.get('org', ''),
            'query': data.get('ip', ''),
        }
        
        # 添加privacy信息
        if 'privacy' in data:
            privacy = data['privacy']
            normalized['privacy'] = privacy
            normalized['hosting'] = privacy.get('hosting', False)
            normalized['vpn'] = privacy.get('vpn', False)
            normalized['proxy'] = privacy.get('proxy', False)
            normalized['tor'] = privacy.get('tor', False)
        
        return normalized
    
    def process_ips_batch(self, ips: List[str]) -> Dict[str, Dict]:
        """批量处理IP列表"""
        logger.info(f"Processing {len(ips)} IPs with {self.max_workers} workers")
        
        results = {}
        cache_hits = 0
        api_calls = 0
        
        # 先检查缓存
        uncached_ips = []
        for ip in ips:
            cached = self._get_from_cache(ip)
            if cached:
                results[ip] = cached
                cache_hits += 1
            else:
                uncached_ips.append(ip)
        
        logger.info(f"Cache hits: {cache_hits}, API calls needed: {len(uncached_ips)}")
        
        if not uncached_ips:
            return results
        
        # 并发处理未缓存的IP
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_ip = {
                executor.submit(self.fetch_ip_info, ip): ip 
                for ip in uncached_ips
            }
            
            for future in as_completed(future_to_ip):
                ip = future_to_ip[future]
                try:
                    result = future.result()
                    if result:
                        results[ip] = result
                        api_calls += 1
                except Exception as e:
                    logger.error(f"Error processing {ip}: {e}")
        
        logger.info(f"Completed: {len(results)} total, {cache_hits} cached, {api_calls} API calls")
        return results
    
    def generate_purity_report(self, ip_results: Dict[str, Dict]) -> Tuple[int, int]:
        """生成纯净度报告"""
        pure_count = 0
        non_pure_count = 0
        
        for ip, info in ip_results.items():
            if info and is_pure_ip(info):
                pure_count += 1
            else:
                non_pure_count += 1
        
        return pure_count, non_pure_count

def main():
    """主函数"""
    print("=== IPinfo.io优化批量处理器 ===\n")
    
    # 初始化处理器
    processor = OptimizedIPInfoProcessor(cache_hours=24, max_workers=50)
    
    if not processor.api_token:
        print("❌ 未找到API token，请检查ipinfo-token.txt文件或设置IPINFO_TOKEN环境变量")
        return
    
    # 加载订阅链接
    print("1. 加载订阅链接...")
    links = load_subscription_links()
    print(f"   找到 {len(links)} 个订阅链接")
    
    # 收集IP地址
    print("2. 收集IP地址...")
    start_time = time.time()
    ip_pairs = collect_ips_from_links(links)
    collect_time = time.time() - start_time
    
    unique_ips = list(set(ip for _, ip in ip_pairs))
    print(f"   收集到 {len(ip_pairs)} 个(主机,IP)对")
    print(f"   去重后 {len(unique_ips)} 个唯一IP")
    print(f"   耗时: {collect_time:.1f}秒")
    
    # 批量处理IP信息
    print("3. 批量获取IP信息...")
    start_time = time.time()
    ip_results = processor.process_ips_batch(unique_ips)
    process_time = time.time() - start_time
    
    print(f"   成功获取 {len(ip_results)} 个IP的信息")
    print(f"   耗时: {process_time:.1f}秒")
    print(f"   平均速度: {len(ip_results)/process_time:.1f} IP/秒")
    
    # 生成纯净度报告
    print("4. 生成纯净度报告...")
    pure_count, non_pure_count = processor.generate_purity_report(ip_results)
    
    print(f"   纯净IP: {pure_count}")
    print(f"   非纯净IP: {non_pure_count}")
    print(f"   纯净度: {pure_count/(pure_count+non_pure_count)*100:.1f}%")
    
    # 保存结果
    output_file = f"ipinfo_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(ip_results, f, indent=2, ensure_ascii=False)
    
    print(f"5. 结果已保存到: {output_file}")
    
    print(f"\n总耗时: {collect_time + process_time:.1f}秒")
    print("处理完成！")

if __name__ == "__main__":
    main()
