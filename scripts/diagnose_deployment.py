#!/usr/bin/env python3
"""
部署问题诊断脚本
自动检测和诊断常见的部署问题
"""

import os
import json
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple

class DeploymentDiagnostic:
    def __init__(self):
        self.issues = []
        self.warnings = []
        self.suggestions = []
    
    def log_issue(self, message: str):
        """记录问题"""
        self.issues.append(message)
        print(f"❌ {message}")
    
    def log_warning(self, message: str):
        """记录警告"""
        self.warnings.append(message)
        print(f"⚠️  {message}")
    
    def log_suggestion(self, message: str):
        """记录建议"""
        self.suggestions.append(message)
        print(f"💡 {message}")
    
    def log_success(self, message: str):
        """记录成功"""
        print(f"✅ {message}")
    
    def check_project_structure(self) -> bool:
        """检查项目结构"""
        print("\n🔍 检查项目结构...")
        
        required_files = [
            'README.md',
            'requirements.txt',
            'config.json',
            'api/check-ip.py',
            'api/requirements.txt',
            'src/ip_checker/__init__.py'
        ]
        
        optional_files = [
            'vercel.json',
            'wrangler.toml',
            'public/index.html',
            'cloudflare/worker.js'
        ]
        
        all_good = True
        
        for file_path in required_files:
            if Path(file_path).exists():
                self.log_success(f"必需文件存在: {file_path}")
            else:
                self.log_issue(f"缺少必需文件: {file_path}")
                all_good = False
        
        for file_path in optional_files:
            if Path(file_path).exists():
                self.log_success(f"可选文件存在: {file_path}")
            else:
                self.log_warning(f"可选文件缺失: {file_path}")
        
        return all_good
    
    def check_vercel_config(self) -> bool:
        """检查 Vercel 配置"""
        print("\n🔍 检查 Vercel 配置...")
        
        if not Path('vercel.json').exists():
            self.log_warning("vercel.json 文件不存在")
            return False
        
        try:
            with open('vercel.json', 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            # 检查必需字段
            required_fields = ['version', 'builds', 'routes']
            for field in required_fields:
                if field in config:
                    self.log_success(f"Vercel 配置包含: {field}")
                else:
                    self.log_issue(f"Vercel 配置缺少: {field}")
            
            # 检查 Python 构建配置
            builds = config.get('builds', [])
            python_build = any(
                build.get('use') == '@vercel/python' 
                for build in builds
            )
            
            if python_build:
                self.log_success("Python 构建配置正确")
            else:
                self.log_issue("缺少 Python 构建配置")
            
            # 检查函数配置
            functions = config.get('functions', {})
            if 'api/**/*.py' in functions:
                func_config = functions['api/**/*.py']
                if 'runtime' in func_config:
                    self.log_success(f"Python 运行时: {func_config['runtime']}")
                else:
                    self.log_warning("未指定 Python 运行时版本")
            
            return True
            
        except json.JSONDecodeError as e:
            self.log_issue(f"vercel.json 格式错误: {e}")
            return False
        except Exception as e:
            self.log_issue(f"读取 vercel.json 失败: {e}")
            return False
    
    def check_cloudflare_config(self) -> bool:
        """检查 Cloudflare Workers 配置"""
        print("\n🔍 检查 Cloudflare Workers 配置...")
        
        if not Path('wrangler.toml').exists():
            self.log_warning("wrangler.toml 文件不存在")
            return False
        
        try:
            with open('wrangler.toml', 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 检查必需字段
            required_fields = ['name', 'main', 'compatibility_date']
            for field in required_fields:
                if f'{field} =' in content:
                    self.log_success(f"Wrangler 配置包含: {field}")
                else:
                    self.log_issue(f"Wrangler 配置缺少: {field}")
            
            # 检查 KV 配置
            if 'kv_namespaces' in content:
                self.log_success("KV 存储配置存在")
                if 'your-kv-namespace-id' in content:
                    self.log_warning("KV namespace ID 需要替换为实际值")
            else:
                self.log_warning("缺少 KV 存储配置")
            
            # 检查 Worker 脚本
            if Path('cloudflare/worker.js').exists():
                self.log_success("Worker 脚本文件存在")
            else:
                self.log_issue("Worker 脚本文件不存在")
            
            return True
            
        except Exception as e:
            self.log_issue(f"读取 wrangler.toml 失败: {e}")
            return False
    
    def check_dependencies(self) -> bool:
        """检查依赖"""
        print("\n🔍 检查依赖...")
        
        # 检查主要依赖文件
        if Path('requirements.txt').exists():
            self.log_success("主 requirements.txt 存在")
        else:
            self.log_issue("缺少主 requirements.txt")
        
        # 检查 API 依赖文件
        if Path('api/requirements.txt').exists():
            self.log_success("API requirements.txt 存在")
            
            try:
                with open('api/requirements.txt', 'r') as f:
                    deps = f.read()
                
                required_deps = ['requests']
                for dep in required_deps:
                    if dep in deps:
                        self.log_success(f"API 依赖包含: {dep}")
                    else:
                        self.log_warning(f"API 依赖可能缺少: {dep}")
                        
            except Exception as e:
                self.log_warning(f"读取 API 依赖失败: {e}")
        else:
            self.log_issue("缺少 API requirements.txt")
        
        return True
    
    def check_environment_variables(self) -> bool:
        """检查环境变量"""
        print("\n🔍 检查环境变量...")
        
        # 检查 IPinfo token
        ipinfo_token = os.environ.get('IPINFO_TOKEN')
        if ipinfo_token:
            self.log_success(f"IPINFO_TOKEN 已设置 (长度: {len(ipinfo_token)})")
        else:
            self.log_warning("IPINFO_TOKEN 环境变量未设置")
            self.log_suggestion("获取免费 token: https://ipinfo.io/signup")
        
        # 检查 token 文件
        if Path('ipinfo-token.txt').exists():
            self.log_success("IPinfo token 文件存在")
        else:
            self.log_warning("IPinfo token 文件不存在")
        
        return True
    
    def check_cli_tools(self) -> bool:
        """检查 CLI 工具"""
        print("\n🔍 检查 CLI 工具...")
        
        tools = [
            ('vercel', 'Vercel CLI'),
            ('wrangler', 'Wrangler CLI'),
            ('node', 'Node.js'),
            ('npm', 'NPM')
        ]
        
        all_good = True
        
        for tool, name in tools:
            try:
                result = subprocess.run(
                    [tool, '--version'], 
                    capture_output=True, 
                    text=True, 
                    timeout=10
                )
                if result.returncode == 0:
                    version = result.stdout.strip()
                    self.log_success(f"{name} 已安装: {version}")
                else:
                    self.log_warning(f"{name} 未安装或无法访问")
                    if tool in ['vercel', 'wrangler']:
                        all_good = False
            except (subprocess.TimeoutExpired, FileNotFoundError):
                self.log_warning(f"{name} 未安装")
                if tool in ['vercel', 'wrangler']:
                    all_good = False
        
        return all_good
    
    def check_api_syntax(self) -> bool:
        """检查 API 文件语法"""
        print("\n🔍 检查 API 文件语法...")
        
        api_files = ['api/check-ip.py', 'api/scheduled-check.py']
        
        for api_file in api_files:
            if Path(api_file).exists():
                try:
                    with open(api_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # 简单的语法检查
                    compile(content, api_file, 'exec')
                    self.log_success(f"{api_file} 语法正确")
                    
                except SyntaxError as e:
                    self.log_issue(f"{api_file} 语法错误: {e}")
                    return False
                except Exception as e:
                    self.log_warning(f"检查 {api_file} 时出错: {e}")
            else:
                self.log_warning(f"API 文件不存在: {api_file}")
        
        return True
    
    def generate_report(self) -> Dict:
        """生成诊断报告"""
        return {
            'issues': self.issues,
            'warnings': self.warnings,
            'suggestions': self.suggestions,
            'summary': {
                'total_issues': len(self.issues),
                'total_warnings': len(self.warnings),
                'deployment_ready': len(self.issues) == 0
            }
        }
    
    def run_full_diagnostic(self) -> Dict:
        """运行完整诊断"""
        print("🔧 IP地址纯净度检查工具 - 部署诊断")
        print("=" * 60)
        
        # 检查项目是否在正确目录
        if not Path('README.md').exists():
            self.log_issue("请在项目根目录运行此脚本")
            return self.generate_report()
        
        # 运行各项检查
        checks = [
            self.check_project_structure,
            self.check_dependencies,
            self.check_environment_variables,
            self.check_cli_tools,
            self.check_api_syntax,
            self.check_vercel_config,
            self.check_cloudflare_config
        ]
        
        for check in checks:
            try:
                check()
            except Exception as e:
                self.log_issue(f"检查过程中出错: {e}")
        
        # 生成报告
        report = self.generate_report()
        
        print("\n" + "=" * 60)
        print("📊 诊断总结")
        print("=" * 60)
        
        print(f"发现问题: {report['summary']['total_issues']}")
        print(f"警告数量: {report['summary']['total_warnings']}")
        print(f"部署就绪: {'是' if report['summary']['deployment_ready'] else '否'}")
        
        if report['summary']['deployment_ready']:
            print("\n🎉 项目已准备好部署！")
        else:
            print("\n⚠️  请先解决上述问题再进行部署。")
        
        if self.suggestions:
            print("\n💡 建议:")
            for suggestion in self.suggestions:
                print(f"   • {suggestion}")
        
        return report

def main():
    """主函数"""
    diagnostic = DeploymentDiagnostic()
    report = diagnostic.run_full_diagnostic()
    
    # 保存报告
    save_report = input("\n是否保存诊断报告? (y/N): ").lower() == 'y'
    if save_report:
        try:
            with open('deployment_diagnostic_report.json', 'w', encoding='utf-8') as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
            print("📄 诊断报告已保存: deployment_diagnostic_report.json")
        except Exception as e:
            print(f"❌ 保存报告失败: {e}")
    
    # 返回退出码
    sys.exit(0 if report['summary']['deployment_ready'] else 1)

if __name__ == "__main__":
    main()
