// 测试WebDAV云备份功能
const https = require('https');

const WORKER_URL = 'https://ip-purity-checker.3150774524.workers.dev';

console.log('🧪 测试WebDAV云备份功能...\n');

// 测试WebDAV配置 (请替换为您的实际WebDAV服务器信息)
const testWebDAVConfig = {
    url: 'https://demo.nextcloud.com/remote.php/dav/files/demo/',
    username: 'demo',
    password: 'demo',
    path: 'ip-purity-checker-test/'
};

// 测试配置数据
const testConfigData = {
    subscriptions: [
        {
            id: 'test1',
            name: 'WebDAV测试订阅',
            url: 'https://example.com/test-sub',
            isActive: true,
            addedAt: new Date().toISOString()
        }
    ],
    apiKeysManager: {
        proxycheck: {
            keys: [
                {
                    id: 'pk1',
                    name: 'WebDAV测试ProxyCheck密钥',
                    value: 'test-webdav-key-123',
                    isActive: true,
                    status: 'active'
                }
            ],
            strategy: 'round-robin',
            currentIndex: 0
        },
        ipinfo: {
            tokens: [],
            strategy: 'round-robin',
            currentIndex: 0
        }
    },
    settings: {},
    backupTime: new Date().toISOString(),
    version: '2.0'
};

// 发送HTTP请求
function makeRequest(path, method, data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: new URL(WORKER_URL).hostname,
            port: 443,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    resolve({
                        statusCode: res.statusCode,
                        data: result
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        data: { error: '响应解析失败', raw: responseData }
                    });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// 测试用例
async function runWebDAVTests() {
    console.log('📋 WebDAV配置信息:');
    console.log(`服务器: ${testWebDAVConfig.url}`);
    console.log(`用户名: ${testWebDAVConfig.username}`);
    console.log(`备份路径: ${testWebDAVConfig.path}\n`);

    const tests = [
        {
            name: 'WebDAV连接测试',
            test: async () => {
                console.log('🔍 测试WebDAV服务器连接...');
                const result = await makeRequest('/api/webdav/test', 'POST', testWebDAVConfig);
                
                if (result.statusCode === 200 && result.data.success) {
                    console.log(`✅ 连接成功 - 服务器: ${result.data.serverInfo?.server || 'Unknown'}`);
                    return true;
                } else {
                    console.log(`❌ 连接失败: ${result.data.error || '未知错误'}`);
                    return false;
                }
            }
        },
        {
            name: 'WebDAV备份测试',
            test: async () => {
                console.log('☁️ 测试配置备份到WebDAV...');
                const result = await makeRequest('/api/webdav/backup', 'POST', {
                    webdavConfig: testWebDAVConfig,
                    configData: testConfigData
                });
                
                if (result.statusCode === 200 && result.data.success) {
                    console.log(`✅ 备份成功 - 文件: ${result.data.filename}, 大小: ${result.data.size} 字节`);
                    return true;
                } else {
                    console.log(`❌ 备份失败: ${result.data.error || '未知错误'}`);
                    return false;
                }
            }
        },
        {
            name: 'WebDAV文件列表测试',
            test: async () => {
                console.log('📋 测试获取WebDAV文件列表...');
                const result = await makeRequest('/api/webdav/list', 'POST', {
                    webdavConfig: testWebDAVConfig
                });
                
                if (result.statusCode === 200 && result.data.success) {
                    const fileCount = result.data.files?.length || 0;
                    console.log(`✅ 获取文件列表成功 - 找到 ${fileCount} 个备份文件`);
                    
                    if (fileCount > 0) {
                        console.log('📁 备份文件列表:');
                        result.data.files.forEach(file => {
                            const size = file.size ? `${(file.size / 1024).toFixed(1)} KB` : '-';
                            const date = file.lastModified ? new Date(file.lastModified).toLocaleString() : '-';
                            console.log(`   - ${file.name} (${size}, ${date})`);
                        });
                    }
                    return true;
                } else {
                    console.log(`❌ 获取文件列表失败: ${result.data.error || '未知错误'}`);
                    return false;
                }
            }
        },
        {
            name: 'WebDAV恢复测试',
            test: async () => {
                console.log('📥 测试从WebDAV恢复配置...');
                const result = await makeRequest('/api/webdav/restore', 'POST', {
                    webdavConfig: testWebDAVConfig
                });
                
                if (result.statusCode === 200 && result.data.success) {
                    const config = result.data.configData;
                    const subCount = config.subscriptions?.length || 0;
                    const keyCount = (config.apiKeysManager?.proxycheck?.keys?.length || 0) + 
                                   (config.apiKeysManager?.ipinfo?.tokens?.length || 0);
                    
                    console.log(`✅ 恢复成功 - 订阅: ${subCount} 个, API密钥: ${keyCount} 个`);
                    console.log(`📅 备份时间: ${config.backupTime ? new Date(config.backupTime).toLocaleString() : '未知'}`);
                    return true;
                } else {
                    console.log(`❌ 恢复失败: ${result.data.error || '未知错误'}`);
                    return false;
                }
            }
        }
    ];

    let passedTests = 0;
    let totalTests = tests.length;

    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        console.log(`\n🧪 测试 ${i + 1}/${totalTests}: ${test.name}`);
        
        try {
            const passed = await test.test();
            if (passed) {
                passedTests++;
            }
        } catch (error) {
            console.log(`💥 测试异常: ${error.message}`);
        }
        
        // 测试间隔
        if (i < tests.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // 测试总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 WebDAV云备份测试报告');
    console.log('='.repeat(60));
    console.log(`总测试数: ${totalTests}`);
    console.log(`通过数: ${passedTests}`);
    console.log(`失败数: ${totalTests - passedTests}`);
    console.log(`成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
        console.log('\n🎉 所有WebDAV测试通过！云备份功能正常工作。');
        console.log('\n📋 功能清单:');
        console.log('✅ WebDAV服务器连接测试');
        console.log('✅ 配置数据备份到WebDAV');
        console.log('✅ WebDAV文件列表获取');
        console.log('✅ 配置数据从WebDAV恢复');
        
        console.log('\n🚀 使用指南:');
        console.log('1. 在设置页面的"WebDAV云备份"区域配置您的WebDAV服务器');
        console.log('2. 点击"测试连接"验证配置正确性');
        console.log('3. 使用"备份到WebDAV"保存当前配置');
        console.log('4. 在其他设备上使用相同配置"从WebDAV恢复"');
        console.log('5. 通过"查看备份"管理您的备份文件');
        
        console.log('\n🌐 支持的WebDAV服务:');
        console.log('- Nextcloud');
        console.log('- ownCloud');
        console.log('- Synology NAS');
        console.log('- QNAP NAS');
        console.log('- 其他标准WebDAV服务');
    } else {
        console.log('\n⚠️ 部分测试失败，请检查WebDAV配置和网络连接。');
        console.log('\n🔧 故障排除建议:');
        console.log('1. 确认WebDAV服务器URL正确（包含完整路径）');
        console.log('2. 验证用户名和密码正确');
        console.log('3. 检查WebDAV服务器是否支持PROPFIND和PUT方法');
        console.log('4. 确认网络连接正常');
        console.log('5. 检查WebDAV服务器的访问权限设置');
    }
}

// 开始测试
console.log('⚠️ 注意: 请在运行测试前修改 testWebDAVConfig 中的WebDAV服务器信息');
console.log('当前使用的是Nextcloud演示服务器，仅用于测试目的\n');

runWebDAVTests().catch(console.error);
