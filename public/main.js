// 标签页切换函数
function switchTab(tabName) {
    // 隐藏所有标签页内容
    document.querySelectorAll('.tab-content').forEach(function(content) {
        content.classList.remove('active');
    });

    // 移除所有标签页的active类
    document.querySelectorAll('.tab').forEach(function(tab) {
        tab.classList.remove('active');
    });

    // 显示选中的标签页
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
}

// 检查单个IP
async function checkSingleIP() {
    const ip = prompt("请输入要查询的IP地址:", "8.8.8.8");
    if (!ip) return;

    const resultDiv = document.getElementById('ipCheckResult');
    if (!resultDiv) {
        console.error('Element with id "ipCheckResult" not found.');
        return;
    }
    resultDiv.style.display = 'block';
    resultDiv.textContent = `正在查询 ${ip}...`;

    try {
        const response = await fetch(`/api/check-ip?ip=${ip}`);
        const data = await response.json();
        
        if (response.ok) {
            resultDiv.textContent = JSON.stringify(data, null, 2);
        } else {
            throw new Error(data.error || '查询失败');
        }
    } catch (error) {
        resultDiv.textContent = `查询出错: ${error.message}`;
    }
}
