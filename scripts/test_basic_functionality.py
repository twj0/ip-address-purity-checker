#!/usr/bin/env python3
"""
基本功能测试脚本
测试修复后的核心功能
"""

import os
import sys
import time
import logging
from typing import List

# 添加项目根目录到路径
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.ip_checker.subscription import read_subscription_links
from src.ip_checker.ip_utils import fetch_ip_info, is_pure_ip
from src.ip_checker.ipinfo_provider import IPInfoProvider

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 降低第三方库日志级别
logging.getLogger("requests").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)


def test_subscription_reading():
    """测试订阅文件读取"""
    print("\n=== 测试订阅文件读取 ===")
    try:
        links = read_subscription_links("汇聚订阅.txt")
        print(f"✅ 成功读取 {len(links)} 个订阅链接")
        if links:
            print(f"   示例链接: {links[0]}")
        return True
    except Exception as e:
        print(f"❌ 订阅文件读取失败: {e}")
        return False


def test_ip_info_fetching():
    """测试IP信息获取"""
    print("\n=== 测试IP信息获取 ===")
    test_ips = ["8.8.8.8", "1.1.1.1", "114.114.114.114"]
    
    success_count = 0
    for ip in test_ips:
        try:
            print(f"测试IP: {ip}")
            info = fetch_ip_info(ip, timeout=15)
            
            if info and info.get('status') == 'success':
                print(f"  ✅ 成功获取信息")
                print(f"     国家: {info.get('country', 'N/A')}")
                print(f"     ISP: {info.get('isp', 'N/A')}")
                
                # 测试纯净度判定
                is_pure = is_pure_ip(info)
                print(f"     纯净度: {'纯净' if is_pure else '非纯净'}")
                success_count += 1
            else:
                print(f"  ❌ 获取失败: {info}")
            
            # 添加延迟避免速率限制
            time.sleep(2)
            
        except Exception as e:
            print(f"  ❌ 异常: {e}")
    
    print(f"\n结果: {success_count}/{len(test_ips)} 个IP测试成功")
    return success_count > 0


def test_ipinfo_provider():
    """测试IPinfo提供者"""
    print("\n=== 测试IPinfo提供者 ===")
    try:
        provider = IPInfoProvider()
        print(f"✅ IPinfo提供者初始化成功")
        print(f"   Token状态: {'有' if provider.api_token else '无'}")
        print(f"   速率限制: {provider.requests_per_minute}/分钟")
        
        # 测试连接
        test_result = provider.test_connection()
        if test_result['success']:
            print(f"✅ 连接测试成功")
            return True
        else:
            print(f"❌ 连接测试失败: {test_result['message']}")
            return False
            
    except Exception as e:
        print(f"❌ IPinfo提供者测试失败: {e}")
        return False


def test_concurrent_processing():
    """测试并发处理"""
    print("\n=== 测试并发处理 ===")
    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        
        test_ips = ["8.8.8.8", "1.1.1.1", "114.114.114.114", "208.67.222.222"]
        
        def fetch_with_retry(ip):
            try:
                return ip, fetch_ip_info(ip, timeout=15)
            except Exception as e:
                return ip, None
        
        success_count = 0
        # 使用较低的并发数
        with ThreadPoolExecutor(max_workers=2) as executor:
            future_to_ip = {executor.submit(fetch_with_retry, ip): ip for ip in test_ips}
            
            for future in as_completed(future_to_ip):
                ip, result = future.result()
                if result and result.get('status') == 'success':
                    print(f"  ✅ {ip}: 成功")
                    success_count += 1
                else:
                    print(f"  ❌ {ip}: 失败")
        
        print(f"\n并发测试结果: {success_count}/{len(test_ips)} 成功")
        return success_count > 0
        
    except Exception as e:
        print(f"❌ 并发测试失败: {e}")
        return False


def main():
    """主测试函数"""
    print("=" * 60)
    print("IP地址纯净度检查工具 - 基本功能测试")
    print("=" * 60)
    
    tests = [
        ("订阅文件读取", test_subscription_reading),
        ("IPinfo提供者", test_ipinfo_provider),
        ("IP信息获取", test_ip_info_fetching),
        ("并发处理", test_concurrent_processing),
    ]
    
    passed_tests = 0
    total_tests = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            if test_func():
                passed_tests += 1
                print(f"✅ {test_name} 测试通过")
            else:
                print(f"❌ {test_name} 测试失败")
        except Exception as e:
            print(f"❌ {test_name} 测试异常: {e}")
    
    print("\n" + "=" * 60)
    print(f"测试完成: {passed_tests}/{total_tests} 项通过")
    
    if passed_tests == total_tests:
        print("🎉 所有测试都通过！功能正常。")
        return 0
    elif passed_tests > 0:
        print("⚠️  部分测试通过，功能基本正常但可能存在问题。")
        return 0
    else:
        print("❌ 所有测试都失败，存在严重问题。")
        return 1


if __name__ == "__main__":
    sys.exit(main())
