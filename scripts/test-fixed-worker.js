// 测试修复后的Worker部署
const https = require('https');

const WORKER_URL = 'https://ip-purity-checker.3150774524.workers.dev/';

console.log('🧪 测试修复后的Worker部署...\n');

// 测试主页面
function testMainPage() {
    return new Promise((resolve, reject) => {
        console.log('📄 测试主页面...');
        
        https.get(WORKER_URL, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`✅ 状态码: ${res.statusCode}`);
                console.log(`📏 响应大小: ${data.length} 字符`);
                
                // 检查关键JavaScript函数
                const checks = [
                    { name: 'switchTab函数', pattern: /function switchTab\s*\(/ },
                    { name: 'checkSingleIP函数', pattern: /function checkSingleIP\s*\(/ },
                    { name: 'HTML结构完整', pattern: /<\/html>\s*$/ },
                    { name: 'script标签闭合', pattern: /<\/script>/ },
                    { name: 'onclick事件', pattern: /onclick="switchTab\(/ }
                ];
                
                console.log('\n🔍 功能检查:');
                checks.forEach(check => {
                    const found = check.pattern.test(data);
                    console.log(`${found ? '✅' : '❌'} ${check.name}: ${found ? '存在' : '缺失'}`);
                });
                
                // 检查是否有截断
                const isComplete = data.includes('</html>');
                console.log(`\n📋 响应完整性: ${isComplete ? '✅ 完整' : '❌ 截断'}`);
                
                if (isComplete && data.includes('function switchTab')) {
                    console.log('\n🎉 主页面测试通过！');
                    resolve(true);
                } else {
                    console.log('\n❌ 主页面测试失败！');
                    resolve(false);
                }
            });
        }).on('error', (err) => {
            console.log('❌ 请求失败:', err.message);
            reject(err);
        });
    });
}

// 测试API端点
function testAPI() {
    return new Promise((resolve, reject) => {
        console.log('\n🔌 测试API端点...');
        
        const apiUrl = WORKER_URL + 'api/check-ip?ip=8.8.8.8';
        
        https.get(apiUrl, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`✅ API状态码: ${res.statusCode}`);
                
                try {
                    const result = JSON.parse(data);
                    console.log('✅ API响应格式: 有效JSON');
                    console.log('✅ API功能: 正常');
                    console.log('📊 示例响应:', JSON.stringify(result, null, 2));
                    resolve(true);
                } catch (e) {
                    console.log('❌ API响应格式: 无效JSON');
                    console.log('📄 原始响应:', data);
                    resolve(false);
                }
            });
        }).on('error', (err) => {
            console.log('❌ API请求失败:', err.message);
            reject(err);
        });
    });
}

// 运行所有测试
async function runTests() {
    try {
        const mainPageOK = await testMainPage();
        const apiOK = await testAPI();
        
        console.log('\n📊 测试总结:');
        console.log(`主页面: ${mainPageOK ? '✅ 通过' : '❌ 失败'}`);
        console.log(`API端点: ${apiOK ? '✅ 通过' : '❌ 失败'}`);
        
        if (mainPageOK && apiOK) {
            console.log('\n🎉 所有测试通过！Worker部署成功！');
            console.log('\n📋 下一步:');
            console.log('1. 访问Worker URL测试界面功能');
            console.log('2. 测试标签页切换功能');
            console.log('3. 测试IP检测功能');
            console.log('4. 检查浏览器控制台无JavaScript错误');
        } else {
            console.log('\n❌ 部分测试失败，需要进一步调试');
        }
        
    } catch (error) {
        console.log('\n💥 测试过程中发生错误:', error.message);
    }
}

// 开始测试
runTests();
