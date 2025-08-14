#!/usr/bin/env node

/**
 * 部署验证脚本
 * 用于验证IP纯净度检查工具的JavaScript功能是否正常工作
 */

const https = require('https');
const fs = require('fs');

// 配置
const WORKER_URL = process.env.WORKER_URL || 'https://ip-purity-checker.twj1234560.workers.dev';
const TIMEOUT = 10000; // 10秒超时

console.log('🚀 开始验证部署...');
console.log('Worker URL:', WORKER_URL);

// 测试用例
const testCases = [
    {
        name: '主页面加载测试',
        path: '/',
        expectedContent: ['switchTab', 'checkSingleIP', 'IP地址纯净度检查工具'],
        critical: true
    },
    {
        name: '最小化测试页面',
        path: '/minimal',
        expectedContent: ['testSwitchTab', 'testCheckSingleIP', '最小化JavaScript测试'],
        critical: false
    },
    {
        name: '完整测试页面',
        path: '/test',
        expectedContent: ['testFunction', 'JavaScript功能测试'],
        critical: false
    }
];

// HTTP请求函数
function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: TIMEOUT }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时'));
        });
        
        req.on('error', (err) => {
            reject(err);
        });
    });
}

// 验证单个测试用例
async function verifyTestCase(testCase) {
    console.log(`\n📋 测试: ${testCase.name}`);
    
    try {
        const url = WORKER_URL + testCase.path;
        console.log(`   URL: ${url}`);
        
        const response = await makeRequest(url);
        
        // 检查HTTP状态码
        if (response.statusCode !== 200) {
            throw new Error(`HTTP状态码错误: ${response.statusCode}`);
        }
        console.log(`   ✅ HTTP状态码: ${response.statusCode}`);
        
        // 检查Content-Type
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.includes('text/html')) {
            console.log(`   ⚠️  Content-Type: ${contentType} (期望: text/html)`);
        } else {
            console.log(`   ✅ Content-Type: ${contentType}`);
        }
        
        // 检查缓存控制头
        const cacheControl = response.headers['cache-control'];
        if (cacheControl && cacheControl.includes('no-cache')) {
            console.log(`   ✅ 缓存控制: ${cacheControl}`);
        } else {
            console.log(`   ⚠️  缓存控制: ${cacheControl || '未设置'}`);
        }
        
        // 检查期望内容
        let contentChecks = 0;
        for (const expectedContent of testCase.expectedContent) {
            if (response.body.includes(expectedContent)) {
                console.log(`   ✅ 包含内容: "${expectedContent}"`);
                contentChecks++;
            } else {
                console.log(`   ❌ 缺少内容: "${expectedContent}"`);
            }
        }
        
        // 检查JavaScript语法错误
        const jsErrors = [
            'SyntaxError',
            'ReferenceError',
            'TypeError',
            'undefined is not a function',
            'is not defined'
        ];
        
        let hasJsErrors = false;
        for (const error of jsErrors) {
            if (response.body.includes(error)) {
                console.log(`   ❌ 发现JavaScript错误: ${error}`);
                hasJsErrors = true;
            }
        }
        
        if (!hasJsErrors) {
            console.log(`   ✅ 无明显JavaScript语法错误`);
        }
        
        // 计算成功率
        const successRate = contentChecks / testCase.expectedContent.length;
        console.log(`   📊 内容检查成功率: ${(successRate * 100).toFixed(1)}%`);
        
        return {
            name: testCase.name,
            success: response.statusCode === 200 && contentChecks > 0,
            critical: testCase.critical,
            statusCode: response.statusCode,
            contentChecks: contentChecks,
            totalChecks: testCase.expectedContent.length,
            successRate: successRate,
            hasJsErrors: hasJsErrors
        };
        
    } catch (error) {
        console.log(`   ❌ 测试失败: ${error.message}`);
        return {
            name: testCase.name,
            success: false,
            critical: testCase.critical,
            error: error.message
        };
    }
}

// 主验证函数
async function verifyDeployment() {
    console.log('=' .repeat(60));
    
    const results = [];
    let criticalFailures = 0;
    let totalFailures = 0;
    
    // 执行所有测试用例
    for (const testCase of testCases) {
        const result = await verifyTestCase(testCase);
        results.push(result);
        
        if (!result.success) {
            totalFailures++;
            if (result.critical) {
                criticalFailures++;
            }
        }
    }
    
    // 生成总结报告
    console.log('\n' + '=' .repeat(60));
    console.log('📊 验证结果总结');
    console.log('=' .repeat(60));
    
    for (const result of results) {
        const status = result.success ? '✅' : '❌';
        const critical = result.critical ? '[关键]' : '[可选]';
        console.log(`${status} ${critical} ${result.name}`);
        
        if (result.error) {
            console.log(`    错误: ${result.error}`);
        } else if (result.successRate !== undefined) {
            console.log(`    成功率: ${(result.successRate * 100).toFixed(1)}%`);
        }
    }
    
    console.log('\n📈 统计信息:');
    console.log(`   总测试数: ${results.length}`);
    console.log(`   成功数: ${results.length - totalFailures}`);
    console.log(`   失败数: ${totalFailures}`);
    console.log(`   关键失败数: ${criticalFailures}`);
    
    // 生成建议
    console.log('\n💡 建议:');
    
    if (criticalFailures === 0) {
        console.log('   ✅ 所有关键功能正常，部署成功！');
    } else {
        console.log('   ❌ 存在关键功能问题，需要立即修复！');
    }
    
    if (totalFailures > 0) {
        console.log('   🔧 建议检查以下项目:');
        console.log('      - 清除浏览器和Cloudflare缓存');
        console.log('      - 验证最新代码已正确部署');
        console.log('      - 检查Worker日志中的错误信息');
        console.log('      - 使用浏览器开发者工具调试');
    }
    
    // 生成验证报告文件
    const reportData = {
        timestamp: new Date().toISOString(),
        workerUrl: WORKER_URL,
        results: results,
        summary: {
            total: results.length,
            success: results.length - totalFailures,
            failures: totalFailures,
            criticalFailures: criticalFailures
        }
    };
    
    try {
        fs.writeFileSync('deployment-verification-report.json', JSON.stringify(reportData, null, 2));
        console.log('\n📄 验证报告已保存到: deployment-verification-report.json');
    } catch (error) {
        console.log('\n⚠️  无法保存验证报告:', error.message);
    }
    
    console.log('\n🏁 验证完成!');
    
    // 设置退出码
    process.exit(criticalFailures > 0 ? 1 : 0);
}

// 运行验证
verifyDeployment().catch((error) => {
    console.error('❌ 验证过程中发生错误:', error);
    process.exit(1);
});
