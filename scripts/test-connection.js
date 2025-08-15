// 简单的连接测试脚本
const https = require('https');

const WORKER_URL = 'https://ip-purity-checker.3150774524.workers.dev';

console.log('🔗 测试Worker连接性...');
console.log('URL:', WORKER_URL);

// 测试基本连接
function testBasicConnection() {
    return new Promise((resolve, reject) => {
        console.log('\n📡 测试基本HTTP连接...');
        
        const options = {
            hostname: 'ip-purity-checker.3150774524.workers.dev',
            port: 443,
            path: '/',
            method: 'GET',
            headers: {
                'User-Agent': 'Node.js Test Script'
            },
            // 忽略SSL证书问题
            rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
            console.log(`✅ 状态码: ${res.statusCode}`);
            console.log(`📋 响应头:`, res.headers);
            
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`📏 响应大小: ${data.length} 字符`);
                
                if (data.length > 0) {
                    console.log('📄 响应内容预览:');
                    console.log(data.substring(0, 200) + '...');
                    
                    // 检查关键内容
                    const checks = [
                        { name: 'HTML文档', pattern: /<html/i },
                        { name: '页面标题', pattern: /<title.*IP.*纯净度/i },
                        { name: '立即生成按钮', pattern: /立即生成.*配置/i },
                        { name: 'JavaScript代码', pattern: /<script>/i }
                    ];
                    
                    console.log('\n🔍 内容检查:');
                    checks.forEach(check => {
                        const found = check.pattern.test(data);
                        console.log(`${found ? '✅' : '❌'} ${check.name}: ${found ? '存在' : '缺失'}`);
                    });
                }
                
                resolve(res.statusCode === 200);
            });
        });

        req.on('error', (err) => {
            console.log('❌ 连接失败:', err.message);
            console.log('错误详情:', err);
            resolve(false);
        });

        req.setTimeout(10000, () => {
            console.log('❌ 请求超时');
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// 测试API端点
function testAPIEndpoint() {
    return new Promise((resolve, reject) => {
        console.log('\n🔌 测试API端点...');
        
        const options = {
            hostname: 'ip-purity-checker.3150774524.workers.dev',
            port: 443,
            path: '/api/status',
            method: 'GET',
            headers: {
                'User-Agent': 'Node.js Test Script'
            },
            rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
            console.log(`✅ API状态码: ${res.statusCode}`);
            
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`📊 API响应:`, data);
                
                try {
                    const result = JSON.parse(data);
                    console.log('✅ JSON格式有效');
                    resolve(true);
                } catch (e) {
                    console.log('❌ JSON格式无效');
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.log('❌ API请求失败:', err.message);
            resolve(false);
        });

        req.setTimeout(10000, () => {
            console.log('❌ API请求超时');
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

// 运行测试
async function runTests() {
    console.log('开始连接测试...\n');
    
    try {
        const basicOK = await testBasicConnection();
        const apiOK = await testAPIEndpoint();
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 连接测试结果');
        console.log('='.repeat(50));
        console.log(`基本连接: ${basicOK ? '✅ 成功' : '❌ 失败'}`);
        console.log(`API端点: ${apiOK ? '✅ 成功' : '❌ 失败'}`);
        
        if (basicOK && apiOK) {
            console.log('\n🎉 Worker连接正常！可以进行功能测试。');
        } else {
            console.log('\n⚠️ Worker连接有问题，需要检查部署状态。');
        }
        
    } catch (error) {
        console.log('\n💥 测试过程中发生错误:', error.message);
    }
}

// 开始测试
runTests();
