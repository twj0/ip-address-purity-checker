#!/usr/bin/env python3
"""
ProxyCheck.io API测试脚本
用于验证API密钥和测试检测功能
"""

import os
import sys
import time
import requests
from typing import Optional, Dict, List

# 添加项目根目录到Python路径
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

try:
    from src.ip_checker.proxycheck_provider import ProxyCheckProvider
    PROVIDER_AVAILABLE = True
except ImportError:
    PROVIDER_AVAILABLE = False
    print("Warning: ProxyCheck provider not available, using direct API calls")


def test_direct_api(api_key: Optional[str] = None):
    """直接测试ProxyCheck.io API"""
    print("=== 直接API测试 ===")
    
    # 测试IP列表
    test_ips = [
        "8.8.8.8",          # Google DNS (应该是hosting)
        "1.1.1.1",          # Cloudflare DNS (应该是hosting)
        "104.28.246.147",   # Cloudflare (应该是hosting)
        "114.114.114.114",  # 114 DNS (可能是纯净)
        "207.246.77.114",   # 已知VPN IP
    ]
    
    for ip in test_ips:
        print(f"\n检测IP: {ip}")
        
        # 构建请求URL
        url = f"http://proxycheck.io/v2/{ip}"
        params = {
            'vpn': '1',
            'risk': '1',
            'asn': '1',
        }
        
        if api_key:
            params['key'] = api_key
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            if data.get('status') == 'ok':
                ip_data = data.get(ip, {})
                is_proxy = ip_data.get('proxy', 'no') == 'yes'
                proxy_type = ip_data.get('type', '')
                risk_score = ip_data.get('risk', 0)
                country = ip_data.get('country', '')
                isp = ip_data.get('isp', '')
                
                print(f"  结果: {'代理' if is_proxy else '非代理'}")
                print(f"  类型: {proxy_type}")
                print(f"  风险评分: {risk_score}/100")
                print(f"  国家: {country}")
                print(f"  ISP: {isp}")
                print(f"  纯净度: {'非纯净' if is_proxy or risk_score >= 60 else '纯净'}")
                
            elif data.get('status') == 'error':
                print(f"  API错误: {data.get('message', 'Unknown error')}")
            else:
                print(f"  未知状态: {data.get('status')}")
                
        except requests.exceptions.RequestException as e:
            print(f"  请求错误: {e}")
        except Exception as e:
            print(f"  处理错误: {e}")
        
        # 添加延迟避免速率限制
        time.sleep(0.6)


def test_provider_class(api_key: Optional[str] = None):
    """测试ProxyCheck提供者类"""
    if not PROVIDER_AVAILABLE:
        print("ProxyCheck provider not available, skipping provider test")
        return
    
    print("\n=== Provider类测试 ===")
    
    try:
        provider = ProxyCheckProvider(api_key)
        
        # 测试连接
        print("测试API连接...")
        connection_test = provider.test_connection()
        print(f"连接测试: {'成功' if connection_test['success'] else '失败'}")
        print(f"消息: {connection_test['message']}")
        
        # 获取使用统计
        stats = provider.get_usage_stats()
        print(f"\n使用统计:")
        print(f"  已使用请求: {stats['requests_made']}")
        print(f"  每日限制: {stats['daily_limit']}")
        print(f"  剩余请求: {stats['remaining_requests']}")
        print(f"  速率限制: {stats['rate_limit']}")
        print(f"  API密钥: {'已配置' if stats['api_key_configured'] else '未配置'}")
        
        # 测试单个IP检查
        print(f"\n单IP检测测试:")
        test_ip = "8.8.8.8"
        result = provider.check_ip(test_ip)
        
        if result:
            print(f"  IP: {result['ip']}")
            print(f"  纯净度: {'纯净' if result['is_pure'] else '非纯净'}")
            print(f"  风险评分: {result.get('risk_score', 0)}")
            print(f"  代理类型: {result.get('proxy_type', 'N/A')}")
            print(f"  国家: {result.get('country', 'N/A')}")
            print(f"  提供者: {result.get('provider', 'N/A')}")
        else:
            print("  检测失败")
        
        # 测试批量检查
        print(f"\n批量检测测试:")
        test_ips = ["8.8.8.8", "1.1.1.1", "114.114.114.114"]
        batch_results = provider.check_multiple_ips(test_ips)
        
        for ip, result in batch_results.items():
            if result:
                print(f"  {ip}: {'纯净' if result['is_pure'] else '非纯净'} (风险: {result.get('risk_score', 0)})")
            else:
                print(f"  {ip}: 检测失败")
        
        # 最终统计
        final_stats = provider.get_usage_stats()
        print(f"\n最终统计:")
        print(f"  总请求数: {final_stats['requests_made']}")
        print(f"  剩余请求: {final_stats['remaining_requests']}")
        
    except Exception as e:
        print(f"Provider测试错误: {e}")


def test_api_key_validation():
    """测试API密钥验证"""
    print("\n=== API密钥验证测试 ===")
    
    # 测试无效密钥
    print("测试无效API密钥...")
    invalid_key = "invalid_key_12345"
    
    url = "http://proxycheck.io/v2/8.8.8.8"
    params = {
        'key': invalid_key,
        'vpn': '1',
        'risk': '1'
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if data.get('status') == 'error':
            print(f"  预期错误: {data.get('message')}")
        else:
            print(f"  意外结果: {data}")
            
    except Exception as e:
        print(f"  请求错误: {e}")


def get_api_key() -> Optional[str]:
    """获取API密钥"""
    # 从环境变量获取
    api_key = os.getenv('PROXYCHECK_API_KEY')
    if api_key:
        return api_key.strip()
    
    # 从文件获取
    key_files = ['proxycheck-api-key.txt', 'proxycheck_key.txt']
    for key_file in key_files:
        if os.path.exists(key_file):
            try:
                with open(key_file, 'r') as f:
                    content = f.read().strip()
                    if content:
                        return content
            except Exception as e:
                print(f"读取密钥文件 {key_file} 失败: {e}")
    
    return None


def main():
    """主函数"""
    print("ProxyCheck.io API测试工具")
    print("=" * 50)
    
    # 获取API密钥
    api_key = get_api_key()
    
    if api_key:
        print(f"✅ 找到API密钥: {api_key[:8]}...")
        print("使用付费/注册用户限制")
    else:
        print("⚠️  未找到API密钥")
        print("使用免费用户限制 (1000次/天, 2次/秒)")
        print("\n获取免费API密钥:")
        print("1. 访问 https://proxycheck.io/api/")
        print("2. 注册账户")
        print("3. 获取API密钥")
        print("4. 设置环境变量: export PROXYCHECK_API_KEY=your_key")
        print("   或创建文件: proxycheck-api-key.txt")
    
    print("\n开始测试...")
    
    # 执行测试
    try:
        test_direct_api(api_key)
        
        if PROVIDER_AVAILABLE:
            test_provider_class(api_key)
        
        test_api_key_validation()
        
        print("\n" + "=" * 50)
        print("✅ 测试完成!")
        
        if not api_key:
            print("\n💡 建议:")
            print("- 获取免费API密钥以提升速率限制和准确性")
            print("- 免费账户每天1000次请求，足够大多数使用场景")
            
    except KeyboardInterrupt:
        print("\n\n⚠️  测试被用户中断")
    except Exception as e:
        print(f"\n❌ 测试过程中发生错误: {e}")


if __name__ == "__main__":
    main()
