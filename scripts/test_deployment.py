#!/usr/bin/env python3
"""
部署验证脚本
测试部署后的API功能是否正常
"""

import requests
import json
import time
import sys
from typing import Dict, List, Tuple

def test_endpoint(url: str, timeout: int = 15) -> Tuple[bool, Dict]:
    """测试单个API端点"""
    try:
        response = requests.get(url, timeout=timeout)
        
        result = {
            'status_code': response.status_code,
            'response_time': response.elapsed.total_seconds(),
            'headers': dict(response.headers),
            'success': response.status_code == 200
        }
        
        # 尝试解析JSON响应
        try:
            result['data'] = response.json()
        except:
            result['data'] = response.text[:500]  # 只保留前500字符
        
        return result['success'], result
        
    except Exception as e:
        return False, {
            'error': str(e),
            'success': False
        }

def test_cors(base_url: str) -> Tuple[bool, Dict]:
    """测试CORS配置"""
    try:
        response = requests.options(
            f"{base_url}/api/check-ip",
            headers={
                'Origin': 'https://example.com',
                'Access-Control-Request-Method': 'GET'
            },
            timeout=10
        )
        
        cors_headers = {
            'access-control-allow-origin': response.headers.get('Access-Control-Allow-Origin'),
            'access-control-allow-methods': response.headers.get('Access-Control-Allow-Methods'),
            'access-control-allow-headers': response.headers.get('Access-Control-Allow-Headers')
        }
        
        success = (
            response.status_code == 200 and
            cors_headers['access-control-allow-origin'] == '*'
        )
        
        return success, {
            'status_code': response.status_code,
            'cors_headers': cors_headers,
            'success': success
        }
        
    except Exception as e:
        return False, {'error': str(e), 'success': False}

def run_comprehensive_test(base_url: str) -> Dict:
    """运行全面的部署测试"""
    print(f"🧪 开始测试部署: {base_url}")
    print("=" * 60)
    
    results = {
        'base_url': base_url,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'tests': {},
        'summary': {
            'total': 0,
            'passed': 0,
            'failed': 0
        }
    }
    
    # 测试用例定义
    test_cases = [
        {
            'name': '首页访问',
            'url': base_url,
            'description': '测试首页是否可以正常访问'
        },
        {
            'name': 'IP检查API - Google DNS',
            'url': f"{base_url}/api/check-ip?ip=8.8.8.8",
            'description': '测试Google DNS的IP检查'
        },
        {
            'name': 'IP检查API - Cloudflare DNS',
            'url': f"{base_url}/api/check-ip?ip=1.1.1.1",
            'description': '测试Cloudflare DNS的IP检查'
        },
        {
            'name': 'IP检查API - 114 DNS',
            'url': f"{base_url}/api/check-ip?ip=114.114.114.114",
            'description': '测试114 DNS的IP检查'
        },
        {
            'name': 'IP检查API - 无效参数',
            'url': f"{base_url}/api/check-ip",
            'description': '测试缺少IP参数的错误处理'
        }
    ]
    
    # 执行测试用例
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n{i}. {test_case['name']}")
        print(f"   {test_case['description']}")
        print(f"   URL: {test_case['url']}")
        
        success, result = test_endpoint(test_case['url'])
        results['tests'][test_case['name']] = result
        results['summary']['total'] += 1
        
        if success:
            results['summary']['passed'] += 1
            print(f"   ✅ 通过 ({result.get('response_time', 0):.2f}s)")
            
            # 显示关键信息
            if 'data' in result and isinstance(result['data'], dict):
                if 'ip' in result['data']:
                    print(f"   📍 IP: {result['data'].get('ip')}")
                    print(f"   🌍 国家: {result['data'].get('country', 'N/A')}")
                    print(f"   🏢 组织: {result['data'].get('org', 'N/A')}")
                    print(f"   ✨ 纯净度: {'纯净' if result['data'].get('isPure') else '非纯净'}")
        else:
            results['summary']['failed'] += 1
            print(f"   ❌ 失败")
            if 'error' in result:
                print(f"   错误: {result['error']}")
    
    # 测试CORS
    print(f"\n{len(test_cases) + 1}. CORS配置测试")
    print("   测试跨域资源共享配置")
    
    cors_success, cors_result = test_cors(base_url)
    results['tests']['CORS配置'] = cors_result
    results['summary']['total'] += 1
    
    if cors_success:
        results['summary']['passed'] += 1
        print("   ✅ CORS配置正确")
    else:
        results['summary']['failed'] += 1
        print("   ❌ CORS配置有问题")
        if 'error' in cors_result:
            print(f"   错误: {cors_result['error']}")
    
    # 输出测试总结
    print("\n" + "=" * 60)
    print("📊 测试总结")
    print("=" * 60)
    
    total = results['summary']['total']
    passed = results['summary']['passed']
    failed = results['summary']['failed']
    success_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"总测试数: {total}")
    print(f"通过数量: {passed}")
    print(f"失败数量: {failed}")
    print(f"成功率: {success_rate:.1f}%")
    
    if failed == 0:
        print("🎉 所有测试都通过！部署成功。")
    elif passed > failed:
        print("⚠️  大部分测试通过，部署基本成功，但存在一些问题。")
    else:
        print("❌ 多数测试失败，部署可能存在严重问题。")
    
    return results

def save_test_report(results: Dict, filename: str = None):
    """保存测试报告"""
    if not filename:
        timestamp = time.strftime('%Y%m%d_%H%M%S')
        filename = f"deployment_test_report_{timestamp}.json"
    
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"\n📄 测试报告已保存: {filename}")
    except Exception as e:
        print(f"\n❌ 保存测试报告失败: {e}")

def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("用法: python test_deployment.py <部署URL>")
        print("示例: python test_deployment.py https://your-project.vercel.app")
        sys.exit(1)
    
    base_url = sys.argv[1].rstrip('/')
    
    # 验证URL格式
    if not base_url.startswith(('http://', 'https://')):
        print("❌ 无效的URL格式，请使用完整的URL（包含http://或https://）")
        sys.exit(1)
    
    try:
        # 运行测试
        results = run_comprehensive_test(base_url)
        
        # 保存报告
        save_report = input("\n是否保存测试报告? (y/N): ").lower() == 'y'
        if save_report:
            save_test_report(results)
        
        # 返回退出码
        if results['summary']['failed'] == 0:
            sys.exit(0)  # 所有测试通过
        else:
            sys.exit(1)  # 有测试失败
            
    except KeyboardInterrupt:
        print("\n\n⏹️  测试被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 测试过程中发生错误: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
