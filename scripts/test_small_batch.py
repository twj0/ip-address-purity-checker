#!/usr/bin/env python3
"""
小批量测试脚本
测试修复后的功能，使用少量IP进行验证
"""

import os
import sys
import time
import logging
from typing import List, Dict

# 添加项目根目录到路径
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.ip_checker.subscription import read_subscription_links, collect_ips_from_links
from src.ip_checker.ip_utils import fetch_ip_info, is_pure_ip

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 降低第三方库日志级别
logging.getLogger("requests").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)


def test_small_batch_processing():
    """测试小批量处理"""
    print("=== 小批量IP纯净度检查测试 ===")
    
    # 使用少量测试IP
    test_ips = [
        ("测试DNS", "8.8.8.8"),
        ("Cloudflare DNS", "1.1.1.1"),
        ("114 DNS", "114.114.114.114")
    ]
    
    results = []
    success_count = 0
    
    for name, ip in test_ips:
        print(f"\n检查 {name} ({ip})...")
        
        try:
            # 使用较长的延迟避免速率限制
            time.sleep(5)
            
            info = fetch_ip_info(ip, timeout=15)
            
            if info and info.get('status') == 'success':
                is_pure = is_pure_ip(info)
                
                result = {
                    'name': name,
                    'ip': ip,
                    'country': info.get('country', 'N/A'),
                    'city': info.get('city', 'N/A'),
                    'isp': info.get('isp', 'N/A'),
                    'org': info.get('org', 'N/A'),
                    'pure': is_pure
                }
                
                results.append(result)
                success_count += 1
                
                print(f"  ✅ 成功")
                print(f"     国家: {result['country']}")
                print(f"     城市: {result['city']}")
                print(f"     ISP: {result['isp']}")
                print(f"     纯净度: {'纯净' if is_pure else '非纯净'}")
                
            else:
                print(f"  ❌ 获取失败: {info}")
                
        except Exception as e:
            print(f"  ❌ 异常: {e}")
    
    # 输出汇总结果
    print(f"\n{'='*50}")
    print("检查结果汇总:")
    print(f"{'='*50}")
    
    if results:
        print(f"{'名称':<15} {'IP':<15} {'国家':<10} {'纯净度':<8}")
        print("-" * 50)
        for result in results:
            purity = "纯净" if result['pure'] else "非纯净"
            print(f"{result['name']:<15} {result['ip']:<15} {result['country']:<10} {purity:<8}")
    
    print(f"\n成功处理: {success_count}/{len(test_ips)} 个IP")
    
    return success_count > 0


def test_subscription_processing():
    """测试订阅处理（仅获取少量IP）"""
    print("\n=== 订阅处理测试 ===")
    
    try:
        # 读取订阅链接
        links = read_subscription_links("汇聚订阅.txt")
        print(f"读取到 {len(links)} 个订阅链接")
        
        if not links:
            print("❌ 没有找到订阅链接")
            return False
        
        # 只使用前2个链接进行测试
        test_links = links[:2]
        print(f"使用前 {len(test_links)} 个链接进行测试")
        
        # 收集IP
        print("正在收集IP地址...")
        pairs = collect_ips_from_links(test_links)
        
        if not pairs:
            print("❌ 没有收集到IP地址")
            return False
        
        print(f"收集到 {len(pairs)} 个(host, ip)对")
        
        # 只测试前3个IP
        test_pairs = pairs[:3]
        print(f"测试前 {len(test_pairs)} 个IP")
        
        success_count = 0
        for i, (host, ip) in enumerate(test_pairs):
            print(f"\n测试 {i+1}/{len(test_pairs)}: {host} -> {ip}")
            
            try:
                # 添加延迟避免速率限制
                if i > 0:
                    time.sleep(8)
                
                info = fetch_ip_info(ip, timeout=15)
                
                if info and info.get('status') == 'success':
                    is_pure = is_pure_ip(info)
                    print(f"  ✅ 成功 - 国家: {info.get('country', 'N/A')}, 纯净度: {'纯净' if is_pure else '非纯净'}")
                    success_count += 1
                else:
                    print(f"  ❌ 失败: {info}")
                    
            except Exception as e:
                print(f"  ❌ 异常: {e}")
        
        print(f"\n订阅测试结果: {success_count}/{len(test_pairs)} 成功")
        return success_count > 0
        
    except Exception as e:
        print(f"❌ 订阅处理测试失败: {e}")
        return False


def main():
    """主测试函数"""
    print("=" * 60)
    print("IP地址纯净度检查工具 - 小批量测试")
    print("=" * 60)
    
    tests = [
        ("小批量IP检查", test_small_batch_processing),
        ("订阅处理", test_subscription_processing),
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
        print("🎉 所有测试都通过！修复成功。")
        return 0
    elif passed_tests > 0:
        print("⚠️  部分测试通过，基本功能正常。")
        return 0
    else:
        print("❌ 所有测试都失败，需要进一步修复。")
        return 1


if __name__ == "__main__":
    sys.exit(main())
