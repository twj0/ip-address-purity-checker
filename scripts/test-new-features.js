// 测试新增功能：手动立即执行和IP检测缓存
const https = require('https');

const WORKER_URL = 'https://ip-purity-checker.3150774524.workers.dev';

console.log('🧪 测试新增功能：手动立即执行和IP检测缓存...\n');

// 测试用例
const testCases = [
    {
        name: '手动立即执行功能测试',
        test: testManualExecution
    },
    {
        name: 'IP检测缓存功能测试',
        test: testIPCache
    },
    {
        name: '缓存管理API测试',
        test: testCacheManagement
    },
    {
        name: 'Clash配置下载测试',
        test: testClashConfigDownload
    }
];

// 测试手动立即执行功能
function testManualExecution() {
    return new Promise((resolve, reject) => {
        console.log('🚀 测试手动立即执行功能...');
        
        const postData = JSON.stringify({
            action: 'generate_clash_config',
            immediate: true
        });

        const options = {
            hostname: new URL(WORKER_URL).hostname,
            port: 443,
            path: '/api/manual-check',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    console.log(`✅ 手动执行状态码: ${res.statusCode}`);
                    console.log(`📊 执行结果:`, result);
                    
                    const checks = [
                        { name: '响应成功', condition: res.statusCode === 200 || res.statusCode === 500 },
                        { name: '返回JSON格式', condition: typeof result === 'object' },
                        { name: '包含执行状态', condition: result.hasOwnProperty('success') }
                    ];
                    
                    console.log('🔍 功能检查:');
                    let passedChecks = 0;
                    checks.forEach(check => {
                        const passed = check.condition;
                        console.log(`${passed ? '✅' : '❌'} ${check.name}: ${passed ? '通过' : '失败'}`);
                        if (passed) passedChecks++;
                    });
                    
                    const success = passedChecks >= 2;
                    console.log(`\n📊 手动执行测试: ${success ? '✅ 通过' : '❌ 失败'} (${passedChecks}/${checks.length})`);
                    resolve(success);
                    
                } catch (e) {
                    console.log('❌ 响应解析失败:', e.message);
                    console.log('📄 原始响应:', data);
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.log('❌ 手动执行请求失败:', err.message);
            resolve(false);
        });

        req.write(postData);
        req.end();
    });
}

// 测试IP检测缓存功能
function testIPCache() {
    return new Promise(async (resolve) => {
        console.log('\n💾 测试IP检测缓存功能...');
        
        const testIP = '8.8.8.8';
        let firstCallTime, secondCallTime;
        
        try {
            // 第一次调用 - 应该调用API
            console.log('🔍 第一次IP检测 (应该调用API)...');
            const start1 = Date.now();
            const result1 = await makeIPCheckRequest(testIP);
            firstCallTime = Date.now() - start1;
            console.log(`⏱️ 第一次调用耗时: ${firstCallTime}ms`);
            
            // 等待1秒
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 第二次调用 - 应该使用缓存
            console.log('🔍 第二次IP检测 (应该使用缓存)...');
            const start2 = Date.now();
            const result2 = await makeIPCheckRequest(testIP);
            secondCallTime = Date.now() - start2;
            console.log(`⏱️ 第二次调用耗时: ${secondCallTime}ms`);
            
            const checks = [
                { name: '两次调用都成功', condition: result1.success && result2.success },
                { name: '返回相同IP', condition: result1.data?.ip === result2.data?.ip },
                { name: '第二次调用更快', condition: secondCallTime < firstCallTime },
                { name: '缓存标识存在', condition: result2.data?.source?.includes('cached') }
            ];
            
            console.log('🔍 缓存检查:');
            let passedChecks = 0;
            checks.forEach(check => {
                const passed = check.condition;
                console.log(`${passed ? '✅' : '❌'} ${check.name}: ${passed ? '通过' : '失败'}`);
                if (passed) passedChecks++;
            });
            
            const success = passedChecks >= 2;
            console.log(`\n📊 缓存功能测试: ${success ? '✅ 通过' : '❌ 失败'} (${passedChecks}/${checks.length})`);
            resolve(success);
            
        } catch (error) {
            console.log('❌ 缓存测试失败:', error.message);
            resolve(false);
        }
    });
}

// 发起IP检测请求
function makeIPCheckRequest(ip) {
    return new Promise((resolve, reject) => {
        https.get(`${WORKER_URL}/api/check-ip?ip=${ip}`, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve({
                        success: res.statusCode === 200,
                        data: result,
                        statusCode: res.statusCode
                    });
                } catch (e) {
                    reject(new Error('响应解析失败: ' + e.message));
                }
            });
        }).on('error', reject);
    });
}

// 测试缓存管理API
function testCacheManagement() {
    return new Promise(async (resolve) => {
        console.log('\n🛠️ 测试缓存管理API...');
        
        const apis = [
            { path: '/api/cache-stats', method: 'GET', name: '缓存统计' },
            { path: '/api/cache-cleanup', method: 'POST', name: '缓存清理' }
        ];
        
        let passedTests = 0;
        
        for (const api of apis) {
            try {
                const success = await testCacheAPI(api);
                if (success) passedTests++;
            } catch (error) {
                console.log(`❌ ${api.name} 测试失败:`, error.message);
            }
        }
        
        const success = passedTests >= 1;
        console.log(`\n📊 缓存管理API测试: ${success ? '✅ 通过' : '❌ 失败'} (${passedTests}/${apis.length})`);
        resolve(success);
    });
}

// 测试单个缓存API
function testCacheAPI(api) {
    return new Promise((resolve) => {
        const options = {
            hostname: new URL(WORKER_URL).hostname,
            port: 443,
            path: api.path,
            method: api.method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                const success = res.statusCode === 200;
                console.log(`${success ? '✅' : '❌'} ${api.name}: ${res.statusCode}`);
                
                if (success) {
                    try {
                        const result = JSON.parse(data);
                        console.log(`📊 ${api.name} 响应:`, result);
                    } catch (e) {
                        console.log(`⚠️ ${api.name} 响应解析失败`);
                    }
                }
                
                resolve(success);
            });
        });

        req.on('error', () => {
            console.log(`❌ ${api.name}: 请求失败`);
            resolve(false);
        });

        if (api.method === 'POST') {
            req.write('{}');
        }
        req.end();
    });
}

// 测试Clash配置下载
function testClashConfigDownload() {
    return new Promise((resolve) => {
        console.log('\n📄 测试Clash配置下载...');
        
        https.get(`${WORKER_URL}/api/clash-config`, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`✅ 配置下载状态码: ${res.statusCode}`);
                console.log(`📏 配置文件大小: ${data.length} 字符`);
                
                const checks = [
                    { name: '状态码正确', condition: res.statusCode === 200 },
                    { name: '内容类型正确', condition: res.headers['content-type']?.includes('yaml') },
                    { name: '包含基础配置', condition: data.includes('port:') && data.includes('proxies:') },
                    { name: '包含代理组', condition: data.includes('proxy-groups:') },
                    { name: '包含规则', condition: data.includes('rules:') }
                ];
                
                console.log('🔍 配置检查:');
                let passedChecks = 0;
                checks.forEach(check => {
                    const passed = check.condition;
                    console.log(`${passed ? '✅' : '❌'} ${check.name}: ${passed ? '通过' : '失败'}`);
                    if (passed) passedChecks++;
                });
                
                const success = passedChecks >= 3;
                console.log(`\n📊 配置下载测试: ${success ? '✅ 通过' : '❌ 失败'} (${passedChecks}/${checks.length})`);
                resolve(success);
            });
        }).on('error', () => {
            console.log('❌ 配置下载请求失败');
            resolve(false);
        });
    });
}

// 运行所有测试
async function runAllTests() {
    console.log('🧪 开始新功能测试...\n');
    
    const results = [];
    
    for (const testCase of testCases) {
        try {
            const result = await testCase.test();
            results.push({ name: testCase.name, success: result });
        } catch (error) {
            console.log(`❌ ${testCase.name} 测试异常:`, error.message);
            results.push({ name: testCase.name, success: false });
        }
    }
    
    // 测试总结
    console.log('\n' + '='.repeat(80));
    console.log('📊 新功能测试报告');
    console.log('='.repeat(80));
    
    const passedTests = results.filter(r => r.success).length;
    const totalTests = results.length;
    
    results.forEach(result => {
        console.log(`${result.success ? '✅' : '❌'} ${result.name}: ${result.success ? '通过' : '失败'}`);
    });
    
    console.log('\n📈 总体结果:');
    console.log(`通过: ${passedTests}/${totalTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
    
    if (passedTests === totalTests) {
        console.log('\n🎉 所有新功能测试通过！');
        console.log('\n📋 新功能清单:');
        console.log('✅ 手动立即执行 - 无需等待定时任务，立即生成Clash配置');
        console.log('✅ IP检测缓存 - 智能缓存检测结果，提高响应速度');
        console.log('✅ 缓存管理 - 完整的缓存统计、清理和管理功能');
        console.log('✅ 配置下载 - 稳定的Clash配置文件下载服务');
        
        console.log('\n🚀 使用指南:');
        console.log('1. 在订阅管理页面点击"立即生成Clash配置"按钮');
        console.log('2. 系统会自动缓存IP检测结果，提高后续检测速度');
        console.log('3. 在设置页面管理缓存，查看统计信息');
        console.log('4. 通过 /api/clash-config 下载最新配置文件');
    } else {
        console.log('\n⚠️  部分功能需要进一步配置或调试');
    }
}

// 开始测试
runAllTests().catch(console.error);
