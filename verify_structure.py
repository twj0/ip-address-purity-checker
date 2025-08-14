#!/usr/bin/env python3
"""
项目结构验证脚本
"""

import os
import json
import yaml
from pathlib import Path

def check_file_exists(file_path, description):
    """检查文件是否存在"""
    if os.path.exists(file_path):
        print(f"✅ {description}: {file_path}")
        return True
    else:
        print(f"❌ {description}: {file_path} (缺失)")
        return False

def check_directory_exists(dir_path, description):
    """检查目录是否存在"""
    if os.path.isdir(dir_path):
        print(f"✅ {description}: {dir_path}")
        return True
    else:
        print(f"❌ {description}: {dir_path} (缺失)")
        return False

def verify_json_file(file_path):
    """验证JSON文件格式"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            json.load(f)
        print(f"✅ JSON格式正确: {file_path}")
        return True
    except Exception as e:
        print(f"❌ JSON格式错误: {file_path} - {e}")
        return False

def verify_yaml_file(file_path):
    """验证YAML文件格式"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            yaml.safe_load(f)
        print(f"✅ YAML格式正确: {file_path}")
        return True
    except Exception as e:
        print(f"❌ YAML格式错误: {file_path} - {e}")
        return False

def main():
    print("🔍 IP检查器项目结构验证")
    print("=" * 50)
    
    # 核心目录结构
    print("\n📁 核心目录结构:")
    directories = [
        ("src", "源代码目录"),
        ("src/ip_checker", "核心模块目录"),
        ("scripts", "执行脚本目录"),
        ("api", "Vercel API函数目录"),
        ("cloudflare", "Cloudflare Workers目录"),
        ("public", "前端页面目录"),
        (".github/workflows", "GitHub Actions工作流目录")
    ]
    
    dir_results = []
    for dir_path, desc in directories:
        dir_results.append(check_directory_exists(dir_path, desc))
    
    # 核心Python模块
    print("\n🐍 核心Python模块:")
    core_modules = [
        ("src/ip_checker/__init__.py", "模块初始化文件"),
        ("src/ip_checker/ip_utils.py", "IP工具函数"),
        ("src/ip_checker/ipinfo_provider.py", "IPinfo.io服务适配器"),
        ("src/ip_checker/subscription.py", "订阅解析模块"),
        ("src/ip_checker/clash.py", "Clash配置生成"),
        ("src/ip_checker/config.py", "配置管理模块")
    ]
    
    module_results = []
    for file_path, desc in core_modules:
        module_results.append(check_file_exists(file_path, desc))
    
    # 执行脚本
    print("\n📜 执行脚本:")
    scripts = [
        ("scripts/run_purity_check.py", "纯净度检测脚本"),
        ("scripts/dedup_purity_to_yaml.py", "Clash配置生成脚本"),
        ("scripts/ipinfo_batch_processor.py", "批量处理器")
    ]
    
    script_results = []
    for file_path, desc in scripts:
        script_results.append(check_file_exists(file_path, desc))
    
    # API接口
    print("\n🌐 API接口:")
    api_files = [
        ("api/check-ip.py", "单IP检查API"),
        ("api/scheduled-check.py", "定时任务API")
    ]
    
    api_results = []
    for file_path, desc in api_files:
        api_results.append(check_file_exists(file_path, desc))
    
    # 部署配置文件
    print("\n⚙️ 部署配置文件:")
    config_files = [
        ("vercel.json", "Vercel部署配置"),
        ("wrangler.toml", "Cloudflare Workers配置"),
        (".github/workflows/ipinfo-purity-check.yml", "GitHub Actions工作流"),
        ("cloudflare/worker.js", "Cloudflare Workers脚本"),
        ("public/index.html", "前端页面")
    ]
    
    config_results = []
    for file_path, desc in config_files:
        config_results.append(check_file_exists(file_path, desc))
    
    # 项目文件
    print("\n📄 项目文件:")
    project_files = [
        ("README.md", "项目说明文档"),
        ("requirements.txt", "Python依赖列表"),
        ("config.json", "项目配置文件"),
        ("LICENSE", "许可证文件"),
        (".gitignore", "Git忽略文件"),
        ("DEPLOYMENT.md", "部署指南"),
        ("IPINFO_MIGRATION.md", "迁移报告")
    ]
    
    project_results = []
    for file_path, desc in project_files:
        project_results.append(check_file_exists(file_path, desc))
    
    # 验证配置文件格式
    print("\n🔧 配置文件格式验证:")
    format_results = []
    
    if os.path.exists("config.json"):
        format_results.append(verify_json_file("config.json"))
    
    if os.path.exists("vercel.json"):
        format_results.append(verify_json_file("vercel.json"))
    
    if os.path.exists(".github/workflows/ipinfo-purity-check.yml"):
        format_results.append(verify_yaml_file(".github/workflows/ipinfo-purity-check.yml"))
    
    # 总结
    print("\n" + "=" * 50)
    print("📊 验证结果总结:")
    
    total_checks = (len(dir_results) + len(module_results) + len(script_results) + 
                   len(api_results) + len(config_results) + len(project_results) + 
                   len(format_results))
    passed_checks = (sum(dir_results) + sum(module_results) + sum(script_results) + 
                    sum(api_results) + sum(config_results) + sum(project_results) + 
                    sum(format_results))
    
    print(f"总检查项: {total_checks}")
    print(f"通过检查: {passed_checks}")
    print(f"失败检查: {total_checks - passed_checks}")
    print(f"通过率: {passed_checks/total_checks*100:.1f}%")
    
    if passed_checks == total_checks:
        print("\n🎉 项目结构验证完全通过！")
        return True
    else:
        print(f"\n⚠️ 项目结构存在 {total_checks - passed_checks} 个问题，请检查上述缺失的文件。")
        return False

if __name__ == "__main__":
    main()
