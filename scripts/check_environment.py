#!/usr/bin/env python3
"""
环境检查脚本
检查项目运行所需的环境配置和依赖
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Dict, List, Tuple

# 添加项目根目录到路径
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.ip_checker.config import config
from src.ip_checker.ipinfo_provider import IPInfoProvider

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def check_dependencies() -> List[Tuple[str, bool, str]]:
    """检查Python依赖包"""
    results = []
    required_packages = [
        'requests', 'lxml', 'yaml', 'tqdm', 'ipinfo'
    ]
    
    for package in required_packages:
        try:
            __import__(package)
            results.append((package, True, "已安装"))
        except ImportError:
            results.append((package, False, "未安装"))
    
    return results


def check_config_files() -> List[Tuple[str, bool, str]]:
    """检查配置文件"""
    results = []
    
    # 检查config.json
    config_path = Path("config.json")
    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                json.load(f)
            results.append(("config.json", True, "存在且格式正确"))
        except json.JSONDecodeError as e:
            results.append(("config.json", False, f"JSON格式错误: {e}"))
    else:
        results.append(("config.json", False, "文件不存在"))
    
    # 检查订阅文件
    sub_files = ["汇聚订阅.txt", "subscriptions.txt"]
    found_sub_file = False
    for sub_file in sub_files:
        if Path(sub_file).exists():
            results.append((sub_file, True, "存在"))
            found_sub_file = True
            break
    
    if not found_sub_file:
        results.append(("订阅文件", False, "未找到汇聚订阅.txt或subscriptions.txt"))
    
    return results


def check_api_tokens() -> List[Tuple[str, bool, str]]:
    """检查API令牌配置"""
    results = []
    
    # 检查IPinfo token
    ipinfo_token = os.getenv('IPINFO_TOKEN')
    if ipinfo_token:
        results.append(("IPINFO_TOKEN环境变量", True, f"已设置 (长度: {len(ipinfo_token)})"))
    else:
        # 检查文件中的token
        token_file = Path("ipinfo-token.txt")
        if token_file.exists():
            try:
                with open(token_file, 'r') as f:
                    content = f.read().strip()
                    if content:
                        results.append(("ipinfo-token.txt", True, f"存在 (长度: {len(content.split(',')[0])})"))
                    else:
                        results.append(("ipinfo-token.txt", False, "文件为空"))
            except Exception as e:
                results.append(("ipinfo-token.txt", False, f"读取错误: {e}"))
        else:
            results.append(("IPinfo Token", False, "未设置环境变量且未找到token文件"))
    
    return results


def test_api_connectivity() -> List[Tuple[str, bool, str]]:
    """测试API连接性"""
    results = []
    
    try:
        # 测试IPinfo.io
        provider = IPInfoProvider()
        test_result = provider.test_connection()
        
        if test_result['success']:
            results.append(("IPinfo.io API", True, "连接成功"))
        else:
            results.append(("IPinfo.io API", False, f"连接失败: {test_result['message']}"))
    
    except Exception as e:
        results.append(("IPinfo.io API", False, f"测试异常: {e}"))
    
    # 测试ip-api.com
    try:
        import requests
        response = requests.get("http://ip-api.com/json/8.8.8.8", timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'success':
                results.append(("ip-api.com API", True, "连接成功"))
            else:
                results.append(("ip-api.com API", False, f"API返回错误: {data}"))
        else:
            results.append(("ip-api.com API", False, f"HTTP错误: {response.status_code}"))
    except Exception as e:
        results.append(("ip-api.com API", False, f"连接异常: {e}"))
    
    return results


def check_network_proxy() -> List[Tuple[str, bool, str]]:
    """检查网络代理设置"""
    results = []
    
    proxy_vars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']
    proxy_found = False
    
    for var in proxy_vars:
        value = os.getenv(var)
        if value:
            results.append((f"{var}环境变量", True, f"已设置: {value}"))
            proxy_found = True
    
    if not proxy_found:
        results.append(("代理设置", True, "未设置代理（直连）"))
    
    return results


def main():
    """主检查函数"""
    print("=" * 60)
    print("IP地址纯净度检查工具 - 环境检查")
    print("=" * 60)
    
    all_checks = [
        ("Python依赖包", check_dependencies()),
        ("配置文件", check_config_files()),
        ("API令牌", check_api_tokens()),
        ("网络代理", check_network_proxy()),
        ("API连接性", test_api_connectivity()),
    ]
    
    total_checks = 0
    passed_checks = 0
    
    for category, checks in all_checks:
        print(f"\n{category}:")
        print("-" * 40)
        
        for name, status, message in checks:
            total_checks += 1
            status_icon = "✅" if status else "❌"
            print(f"  {status_icon} {name}: {message}")
            if status:
                passed_checks += 1
    
    print("\n" + "=" * 60)
    print(f"检查完成: {passed_checks}/{total_checks} 项通过")
    
    if passed_checks == total_checks:
        print("🎉 所有检查都通过！环境配置正常。")
        return 0
    else:
        print("⚠️  存在配置问题，请根据上述提示进行修复。")
        return 1


if __name__ == "__main__":
    sys.exit(main())
