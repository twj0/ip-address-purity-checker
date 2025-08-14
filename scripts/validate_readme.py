#!/usr/bin/env python3
"""
README文件验证脚本
检查README文件的完整性和格式
"""

import os
import re
from pathlib import Path
from typing import List, Tuple

def check_file_exists(filepath: str) -> bool:
    """检查文件是否存在"""
    return Path(filepath).exists()

def check_markdown_structure(content: str) -> List[str]:
    """检查Markdown结构"""
    issues = []
    
    # 检查标题层级
    headers = re.findall(r'^(#{1,6})\s+(.+)$', content, re.MULTILINE)
    if not headers:
        issues.append("未找到任何标题")
    
    # 检查是否有主标题
    if not any(h[0] == '#' for h, _ in headers):
        issues.append("缺少主标题 (#)")
    
    # 检查代码块是否配对
    code_blocks = content.count('```')
    if code_blocks % 2 != 0:
        issues.append("代码块未正确配对")
    
    # 检查链接格式
    broken_links = re.findall(r'\[([^\]]+)\]\(\)', content)
    if broken_links:
        issues.append(f"发现空链接: {broken_links}")
    
    return issues

def check_required_sections(content: str, language: str = 'zh') -> List[str]:
    """检查必需的章节"""
    issues = []
    
    if language == 'zh':
        required_sections = [
            '主要功能', '安装', '配置', '使用方法', 
            'API配置', '常见问题', '贡献指南'
        ]
    else:
        required_sections = [
            'Key Features', 'Installation', 'Configuration', 'Usage',
            'API Configuration', 'FAQ', 'Contributing'
        ]
    
    for section in required_sections:
        if section not in content:
            issues.append(f"缺少必需章节: {section}")
    
    return issues

def check_badges(content: str) -> List[str]:
    """检查徽章"""
    issues = []
    
    badge_pattern = r'!\[([^\]]*)\]\(([^)]+)\)'
    badges = re.findall(badge_pattern, content)
    
    expected_badges = ['Python', 'License', 'GitHub Actions']
    found_badges = [badge[0] for badge in badges]
    
    for expected in expected_badges:
        if not any(expected in found for found in found_badges):
            issues.append(f"缺少徽章: {expected}")
    
    return issues

def validate_readme_file(filepath: str, language: str = 'zh') -> Tuple[bool, List[str]]:
    """验证README文件"""
    if not check_file_exists(filepath):
        return False, [f"文件不存在: {filepath}"]
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    all_issues = []
    
    # 检查基本结构
    all_issues.extend(check_markdown_structure(content))
    
    # 检查必需章节
    all_issues.extend(check_required_sections(content, language))
    
    # 检查徽章
    all_issues.extend(check_badges(content))
    
    # 检查文件长度
    if len(content) < 1000:
        all_issues.append("文件内容过短，可能不完整")
    
    return len(all_issues) == 0, all_issues

def main():
    """主验证函数"""
    print("=" * 60)
    print("README文件验证")
    print("=" * 60)
    
    files_to_check = [
        ("README.md", "zh"),
        ("README-en.md", "en")
    ]
    
    all_passed = True
    
    for filepath, language in files_to_check:
        print(f"\n检查文件: {filepath}")
        print("-" * 40)
        
        is_valid, issues = validate_readme_file(filepath, language)
        
        if is_valid:
            print("✅ 验证通过")
        else:
            print("❌ 发现问题:")
            for issue in issues:
                print(f"  - {issue}")
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 所有README文件验证通过！")
        return 0
    else:
        print("⚠️  部分README文件存在问题，请检查并修复。")
        return 1

if __name__ == "__main__":
    import sys
    sys.exit(main())
