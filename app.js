const GAS_URL = "https://script.google.com/macros/s/AKfycbxb3cScYhic7VOl7nn0sgOFRuhiTiApcrwlDV9XTMA1UUD_pNZRBuywOAewUeAv1jWmrw/exec";

let rawSigns = [];
let approvedData = {};
let currentViewPath = { level: 'categories', category: null, name: null, id: null };

document.addEventListener("DOMContentLoaded", () => {
    initI18n();
    setupEventListeners();
    fetchSignsFromSheet();
    setupHeaderLongPress();
    
    // 定期同步
    setInterval(fetchGASData, 10000);
    setInterval(fetchPendingCount, 15000);
});

function initI18n() {
    // 預留多語系初始化
}

function setupEventListeners() {
    // QR Code 支援
    const urlParams = new URLSearchParams(window.location.search);
    const qid = urlParams.get('id');
    if (qid) {
        // 若帶有 id 則直接導向該標誌詳細頁
        setTimeout(() => {
            let target = rawSigns.find(s => s.id === qid);
            if (target) showDetailView(target);
        }, 1000);
    }
}

async function fetchSignsFromSheet() {
    try {
        let res = await fetch(`${GAS_URL}?action=getData`);
        let json = await res.json();
        rawSigns = json.signs || [];
        approvedData = json.approved || {};
        
        renderCurrentView();
    } catch (e) {
        console.error("資料載入失敗", e);
    }
}

async function fetchGASData() {
    try {
        let res = await fetch(`${GAS_URL}?action=getData`);
        let json = await res.json();
        approvedData = json.approved || {};
    } catch (e) {
        console.error("背景同步失敗", e);
    }
}

async function fetchPendingCount() {
    try {
        let res = await fetch(`${GAS_URL}?action=getPendingCount`);
        let json = await res.json();
        let badge = document.getElementById('pending-badge');
        if (json.count > 0) {
            badge.innerText = `待審批: ${json.count}`;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    } catch (e) {
        console.error("取得待審批數量失敗", e);
    }
}

// 檢視層級切換核心
function renderCurrentView() {
    const container = document.getElementById('app-container');
    container.innerHTML = '';

    if (currentViewPath.level === 'categories') {
        renderCategoryView(container);
    } else if (currentViewPath.level === 'signs') {
        renderSignsView(container, currentViewPath.category);
    } else if (currentViewPath.level === 'names') {
        renderNamesView(container, currentViewPath.category);
    } else if (currentViewPath.level === 'risks') {
        renderRisksView(container, currentViewPath.name);
    } else if (currentViewPath.level === 'detail') {
        renderDetailView(container, currentViewPath.id);
    }
}

// 第一層：顯示 Category 代表圖示
function renderCategoryView(container) {
    let categories = [...new Set(rawSigns.map(s => s.category))];
    let html = `<div class="grid-container">`;
    
    categories.forEach(cat => {
        let firstSign = rawSigns.find(s => s.category === cat);
        html += `
            <div class="card" onclick="navigateToCategory('${cat}')">
                <img src="${firstSign.svg_url || firstSign.image}" alt="${cat}">
                <h3>${cat}</h3>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

window.navigateToCategory = function(cat) {
    currentViewPath = { level: 'signs', category: cat };
    renderCurrentView();
};

// 第二層：顯示該 Category 的所有標誌
function renderSignsView(container, cat) {
    let signs = rawSigns.filter(s => s.category === cat);
    let html = `<button onclick="backToCategories()">⬅ 返回分類</button><h2>${cat} 標誌列表</h2><div class="grid-container">`;
    
    signs.forEach(s => {
        html += `
            <div class="card" onclick="handleSignClick('${s.id}', '${s.category}', '${s.name}')">
                <img src="${s.svg_url || s.image}" alt="${s.name}">
                <p>${s.id} - ${s.name}</p>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

window.backToCategories = function() {
    currentViewPath = { level: 'categories', category: null };
    renderCurrentView();
};

window.handleSignClick = function(id, category, name) {
    if (category === 'Warning sign') {
        // W 類進入 Name 檢視
        currentViewPath = { level: 'names', category: category, name: name };
        renderCurrentView();
    } else {
        // 非 W 類直接進詳細頁
        currentViewPath = { level: 'detail', id: id };
        renderCurrentView();
    }
};

// 第三層：Warning sign 的 Name 檢視
function renderNamesView(container, cat) {
    // 找出該 category 下不重複的 name
    let wSigns = rawSigns.filter(s => s.category === cat);
    let uniqueNames = [...new Set(wSigns.map(s => s.name))];
    
    let html = `<button onclick="navigateToCategory('${cat}')">⬅ 返回 ${cat}</button><h2>注意標誌群組</h2><div class="grid-container">`;
    uniqueNames.forEach(name => {
        let sample = wSigns.find(s => s.name === name);
        html += `
            <div class="card" onclick="navigateToRisks('${name}')">
                <img src="${sample.svg_url || sample.image}" alt="${name}">
                <p>${name}</p>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;
}

window.navigateToRisks = function(name) {
    currentViewPath = { level: 'risks', name: name };
    renderCurrentView();
};

// 第四層：Warning sign 的 4 個 Risk 等級檢視
function renderRisksView(container, name) {
    let variants = rawSigns.filter(s => s.name === name); // 應展開為 4 個風險等級
    let html = `<button onclick="currentViewPath.level='names'; renderCurrentView();">⬅ 返回群組</button><h2>${name} - 風險等級選擇</h2><div class="grid-container">`;
    
    // 動態產生 1~4 風險等級呈現
    for(let i=1; i<=4; i++) {
        let variant = variants.find(v => String(v.risk) === String(i)) || variants[0];
        html += `
            <div class="card" onclick="navigateToDetail('${variant.id}_Risk${i}')">
                <img src="${variant.svg_url || variant.image}" alt="Risk ${i}">
                <p>風險等級 (Risk Level): ${i}</p>
            </div>
        `;
    }
    html += `</div>`;
    container.innerHTML = html;
}

window.navigateToDetail = function(compoundId) {
    // compoundId 格式為 id_RiskX
    let realId = compoundId.split('_')[0];
    let riskLv = compoundId.split('_Risk')[1];
    currentViewPath = { level: 'detail', id: realId, risk: riskLv };
    renderCurrentView();
};

// 第五層：詳細頁與 7 大危害控制表單 (支援雙擊編輯)
function renderDetailView(container, id) {
    let sign = rawSigns.find(s => s.id === id);
    let riskLevel = currentViewPath.risk || sign.risk || '1';
    let uniqueKey = `${sign.id}_${riskLevel}`;
    
    // 套用已審批資料
    let currentData = approvedData[uniqueKey] || sign;

    let html = `
        <button onclick="window.history.back()">⬅ 返回</button>
        <div class="table-container">
            <h2>標誌詳情: ${sign.name} (ID: ${sign.id})</h2>
            <img src="${sign.svg_url || sign.image}" style="max-width:150px; display:block; margin: 0 auto 1rem auto;">
            <p><strong>風險等級 (Risk Level):</strong> ${riskLevel}</p>
            <p style="color: #64748b; font-size: 0.9rem;">提示：雙擊表格右側 6 個控制欄位即可輸入新資訊並送審（支援手機與電腦雙擊）。</p>
            
            <table class="control-table">
                <tr><th>控制項欄位</th><th>內容值</th></tr>
                <tr><td class="readonly-cell">頻率 (freq)</td><td class="editable-cell" ondblclick="makeEditable(this, '${sign.id}', '${riskLevel}', 'freq')">${currentData.freq || ''}</td></tr>
                <tr><td class="readonly-cell">排除 (elim)</td><td class="editable-cell" ondblclick="makeEditable(this, '${sign.id}', '${riskLevel}', 'elim')">${currentData.elim || ''}</td></tr>
                <tr><td class="readonly-cell">替代 (sub)</td><td class="editable-cell" ondblclick="makeEditable(this, '${sign.id}', '${riskLevel}', 'sub')">${currentData.sub || ''}</td></tr>
                <tr><td class="readonly-cell">工程控制 (eng)</td><td class="editable-cell" ondblclick="makeEditable(this, '${sign.id}', '${riskLevel}', 'eng')">${currentData.eng || ''}</td></tr>
                <tr><td class="readonly-cell">管理控制 (admin)</td><td class="editable-cell" ondblclick="makeEditable(this, '${sign.id}', '${riskLevel}', 'admin')">${currentData.admin || ''}</td></tr>
                <tr><td class="readonly-cell">個人防護具 (ppe)</td><td class="editable-cell" ondblclick="makeEditable(this, '${sign.id}', '${riskLevel}', 'ppe')">${currentData.ppe || ''}</td></tr>
            </table>
        </div>
    `;
    container.innerHTML = html;
}

// 雙擊編輯並提交送審
window.makeEditable = function(cell, signId, risk, field) {
    if (cell.querySelector('input')) return;
    let oldVal = cell.innerText;
    cell.innerHTML = `<input type="text" value="${oldVal}" style="width:90%; padding:4px;" />`;
    let input = cell.querySelector('input');
    input.focus();

    input.onblur = async function() {
        let newVal = input.value;
        cell.innerText = newVal;
        if (newVal !== oldVal) {
            await submitApproval(signId, risk, field, newVal);
        }
    };

    input.onkeydown = function(e) {
        if (e.key === 'Enter') {
            input.blur();
        }
    };
};

async function submitApproval(signId, risk, field, value) {
    try {
        let res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'submitApproval', // 對應你原本 GAS 的 submitApproval
                signId: signId,
                risk: risk,
                field: field,
                value: value,
                applicant: 'User'
            })
        });
        let result = await res.json();
        if (result.success) {
            alert('已成功送交審批！');
        }
    } catch (e) {
        console.error("送審失敗", e);
    }
}

// 長按 Header 3 秒開啟管理員審批後台
function setupHeaderLongPress() {
    let header = document.getElementById('main-header');
    let timer = null;

    header.addEventListener('mousedown', () => {
        timer = setTimeout(openApprovalModal, 3000);
    });
    header.addEventListener('mouseup', () => clearTimeout(timer));
    header.addEventListener('touchstart', () => {
        timer = setTimeout(openApprovalModal, 3000);
    });
    header.addEventListener('touchend', () => clearTimeout(timer));
}

async function openApprovalModal() {
    let modal = document.getElementById('approval-modal');
    let listDiv = document.getElementById('approval-list');
    modal.style.display = 'flex';
    listDiv.innerHTML = '載入中...';

    try {
        let res = await fetch(`${GAS_URL}?action=getPending`);
        let pendingItems = await res.json();

        if (pendingItems.length === 0) {
            listDiv.innerHTML = '<p>目前沒有待審批項目。</p>';
            return;
        }

        let html = '';
        pendingItems.forEach((item, idx) => {
            html += `
                <div style="border-bottom: 1px solid #ccc; padding: 10px 0;">
                    <p><strong>標誌 ID:</strong> ${item.signId} | <strong>風險:</strong> ${item.risk} | <strong>欄位:</strong> ${item.field}</p>
                    <p><strong>新內容:</strong> ${item.value}</p>
                    <button onclick="reviewItem(${idx}, 'APPROVED', '${item.signId}', '${item.risk}', '${item.field}', '${item.value}')" style="background:green; color:white;">通過</button>
                    <button onclick="reviewItem(${idx}, 'REJECTED', '${item.signId}', '${item.risk}', '${item.field}', '${item.value}')" style="background:red; color:white;">拒絕</button>
                </div>
            `;
        });
        listDiv.innerHTML = html;
    } catch (e) {
        listDiv.innerHTML = '載入失敗';
    }
}

window.reviewItem = async function(index, status, signId, risk, field, value) {
    await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'review', signId, risk, field, value, status, reviewer: 'Admin' })
    });
    alert(`審批結果已儲存: ${status}`);
    openApprovalModal(); // 重新整理列表
    fetchSignsFromSheet(); // 更新前端
};

document.getElementById('close-modal-btn').onclick = () => {
    document.getElementById('approval-modal').style.display = 'none';
};
