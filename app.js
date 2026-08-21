const GAS_URL = "https://script.google.com/macros/s/AKfycbxb3cScYhic7VOl7nn0sgOFRuhiTiApcrwlDV9XTMA1UUD_pNZRBuywOAewUeAv1jWmrw/exec";

let rawSigns = [];
let approvedData = {};
let isExpanded = false; // 防重複展開旗標
let isAdmin = false;    // 管理員狀態（透過長按啟用）
let currentViewPath = { level: 'categories', category: null, name: null, id: null, risk: null };

document.addEventListener("DOMContentLoaded", () => {
    initI18n();
    setupEventListeners();
    fetchSignsFromSheet();
    setupHeaderLongPress();
    
    // 背景定時同步
    setInterval(fetchGASData, 10000);
    setInterval(fetchPendingCount, 15000);
});

function initI18n() {}

function setupEventListeners() {
    // 網址參數帶 ?id=P001 偵測
    const urlParams = new URLSearchParams(window.location.search);
    const qid = urlParams.get('id');
    if (qid) {
        setTimeout(() => {
            let target = rawSigns.find(s => s.id === qid);
            if (target) {
                currentViewPath = { level: 'detail', id: target.id, risk: '1' };
                renderCurrentView();
            }
        }, 1000);
    }

    // 掃描 QR 按鈕事件
    document.getElementById('scan-qr-btn').addEventListener('click', startQRCodeScanner);
}

// 取得主表與已核准資料
async function fetchSignsFromSheet() {
    try {
        let res = await fetch(`${GAS_URL}?action=getData`);
        let json = await res.json();
        let fetchedSigns = json.signs || [];
        approvedData = json.approved || {};

        // W類防重複展開機制：僅初次執行一次
        if (!isExpanded) {
            rawSigns = expandWSigns(fetchedSigns);
            isExpanded = true;
        } else {
            rawSigns = updateExistingSigns(fetchedSigns);
        }
        
        renderCurrentView();
    } catch (e) {
        console.error("資料載入失敗", e);
    }
}

// W類前端動態展開 (Category='Warning sign' 1 變 4，唯一鍵 = ID + Risk)
function expandWSigns(signs) {
    let expandedList = [];
    signs.forEach(sign => {
        if (sign.category === 'Warning sign') {
            for (let i = 1; i <= 4; i++) {
                expandedList.push({
                    ...sign,
                    risk: i,
                    uniqueKey: `${sign.id}_Risk${i}`
                });
            }
        } else {
            expandedList.push({
                ...sign,
                risk: sign.risk || 1,
                uniqueKey: `${sign.id}_Normal`
            });
        }
    });
    return expandedList;
}

function updateExistingSigns(fetchedSigns) {
    return rawSigns.map(existing => {
        let match = fetchedSigns.find(s => s.id === existing.id);
        return match ? { ...match, risk: existing.risk, uniqueKey: existing.uniqueKey } : existing;
    });
}

async function fetchGASData() {
    try {
        let res = await fetch(`${GAS_URL}?action=getData`);
        let json = await res.json();
        approvedData = json.approved || {};
        if (currentViewPath.level === 'detail') renderCurrentView();
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
}

// 檢視層級切換
function renderCurrentView() {
    const container = document.getElementById('app-container');
    container.innerHTML = '';

    if (currentViewPath.level === 'categories') renderCategoryView(container);
    else if (currentViewPath.level === 'signs') renderSignsView(container, currentViewPath.category);
    else if (currentViewPath.level === 'names') renderNamesView(container, currentViewPath.category);
    else if (currentViewPath.level === 'risks') renderRisksView(container, currentViewPath.name);
    else if (currentViewPath.level === 'detail') renderDetailView(container, currentViewPath.id, currentViewPath.risk);
}

function renderCategoryView(container) {
    let categories = [...new Set(rawSigns.map(s => s.category))];
    let html = `<div class="grid-container">`;
    categories.forEach(cat => {
        let firstSign = rawSigns.find(s => s.category === cat);
        html += `
            <div class="card" onclick="navigateToCategory('${cat}')">
                <img src="${firstSign?.svg_url || firstSign?.image || ''}" alt="${cat}">
                <h3>${cat}</h3>
            </div>
        `;
    });
    container.innerHTML = html + `</div>`;
}

window.navigateToCategory = (cat) => {
    currentViewPath = { level: 'signs', category: cat };
    renderCurrentView();
};

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
    container.innerHTML = html + `</div>`;
}

window.backToCategories = () => {
    currentViewPath = { level: 'categories', category: null };
    renderCurrentView();
};

window.handleSignClick = (id, category, name) => {
    if (category === 'Warning sign') {
        currentViewPath = { level: 'names', category: category, name: name };
        renderCurrentView();
    } else {
        currentViewPath = { level: 'detail', id: id, risk: '1' };
        renderCurrentView();
    }
};

function renderNamesView(container, cat) {
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
    container.innerHTML = html + `</div>`;
}

window.navigateToRisks = (name) => {
    currentViewPath = { level: 'risks', name: name };
    renderCurrentView();
};

function renderRisksView(container, name) {
    let variants = rawSigns.filter(s => s.name === name);
    let sample = variants[0];
    let html = `<button onclick="currentViewPath.level='names'; renderCurrentView();">⬅ 返回群組</button><h2>${name} - 風險等級選擇</h2><div class="grid-container">`;
    
    for (let i = 1; i <= 4; i++) {
        let variant = variants.find(v => Number(v.risk) === i) || sample;
        html += `
            <div class="card" onclick="navigateToDetail('${variant.id}', '${i}')">
                <img src="${variant.svg_url || variant.image}" alt="Risk ${i}">
                <p>Risk Level: ${i}</p>
            </div>
        `;
    }
    container.innerHTML = html + `</div>`;
}

window.navigateToDetail = (id, risk) => {
    currentViewPath = { level: 'detail', id: id, risk: risk };
    renderCurrentView();
};

function renderDetailView(container, id, risk) {
    let sign = rawSigns.find(s => s.id === id);
    let uniqueKey = `${sign.id}_Risk${risk}`;
    let currentData = approvedData[uniqueKey] || approvedData[`${sign.id}_Normal`] || sign;

    let html = `
        <button onclick="window.history.back()">⬅ 返回</button>
        <div class="table-container" style="margin-top:15px;">
            <h2>${sign.name} (ID: ${sign.id})</h2>
            <img src="${sign.svg_url || sign.image}" style="max-width:150px; display:block; margin: 0 auto 1rem auto;">
            <p><strong>風險等級 (Risk Level):</strong> ${risk} <span style="font-size:0.8rem; color:gray;">(唯讀不可編輯)</span></p>
            <p style="color: #64748b; font-size: 0.9rem;">提示：一般雙擊送審；管理員模式下雙擊可直接修改或清空刪除資料。</p>
            
            <table class="control-table">
                <tr><th>控制項欄位</th><th>內容值</th></tr>
                <tr><td>頻率 (freq)</td><td class="editable-cell" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'freq', this)">${currentData.freq || ''}</td></tr>
                <tr><td>排除 (elim)</td><td class="editable-cell" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'elim', this)">${currentData.elim || ''}</td></tr>
                <tr><td>替代 (sub)</td><td class="editable-cell" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'sub', this)">${currentData.sub || ''}</td></tr>
                <tr><td>工程 (eng)</td><td class="editable-cell" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'eng', this)">${currentData.eng || ''}</td></tr>
                <tr><td>管理 (admin)</td><td class="editable-cell" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'admin', this)">${currentData.admin || ''}</td></tr>
                <tr><td>防護具 (ppe)</td><td class="editable-cell" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'ppe', this)">${currentData.ppe || ''}</td></tr>
            </table>
        </div>
    `;
    container.innerHTML = html;
}

// 雙擊互動：支援一般送審與管理員修改／刪除
window.handleCellEdit = function(signId, risk, field, cell) {
    if (cell.querySelector('input')) return;
    let oldText = cell.innerText;
    
    if (isAdmin) {
        let actionChoice = prompt("【管理員模式】請選擇動作：\n1. 輸入新內容\n2. 輸入 delete 或留空以刪除此欄位資料", "");
        if (actionChoice === null) return;
        
        if (actionChoice.toLowerCase() === 'delete' || actionChoice.trim() === '') {
            cell.innerText = '';
            sendDirectDelete(signId, risk, field);
        } else {
            let newVal = oldText ? `${oldText}, ${actionChoice}` : actionChoice;
            cell.innerText = newVal;
            sendDirectUpdate(signId, risk, field, newVal);
        }
    } else {
        cell.innerHTML = `<input type="text" value="" placeholder="輸入新值..." style="width:90%; padding:4px;" />`;
        let input = cell.querySelector('input');
        input.focus();

        input.onblur = async function() {
            let val = input.value.trim();
            cell.innerText = oldText;
            if (val) await submitApproval(signId, risk, field, val);
        };
        input.onkeydown = function(e) { if (e.key === 'Enter') input.blur(); };
    }
};

async function submitApproval(signId, risk, field, value) {
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'submitApproval', signId, risk, field, value, applicant: 'User' })
        });
        alert('已成功送交審批 (PENDING)');
    } catch (e) { console.error(e); }
}

async function sendDirectUpdate(signId, risk, field, value) {
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'directUpdate', signId, risk, field, value, reviewer: 'Admin' })
        });
        alert('管理員修改成功並已同步！');
        fetchGASData();
    } catch (e) { console.error(e); }
}

async function sendDirectDelete(signId, risk, field) {
    try {
        await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'directUpdate', signId, risk, field, value: '', reviewer: 'Admin' })
        });
        alert('管理員已成功清除該欄位資料！');
        fetchGASData();
    } catch (e) { console.error(e); }
}

// Header 長按 3 秒啟用管理員與開啟 Modal 審批
function setupHeaderLongPress() {
    let header = document.getElementById('main-header');
    let timer = null;

    const triggerAdmin = () => {
        isAdmin = true;
        alert("【系統提示】管理員權限已啟動！");
        openApprovalModal();
    };

    header.addEventListener('mousedown', () => { timer = setTimeout(triggerAdmin, 3000); });
    header.addEventListener('mouseup', () => clearTimeout(timer));
    header.addEventListener('touchstart', () => { timer = setTimeout(triggerAdmin, 3000); });
    header.addEventListener('touchend', () => clearTimeout(timer));

    document.getElementById('pending-badge').addEventListener('click', () => {
        if (isAdmin) openApprovalModal();
        else alert("請先透過 Header 長按 3 秒啟動管理員權限！");
    });
}

async function openApprovalModal() {
    let modal = document.getElementById('approval-modal');
    let listDiv = document.getElementById('approval-list');
    modal.style.display = 'flex';
    listDiv.innerHTML = '載入中...';

    try {
        let res = await fetch(`${GAS_URL}?action=getPendingApprovals`);
        let json = await res.json();
        let items = json.data || [];

        if (items.length === 0) {
            listDiv.innerHTML = '<p>目前沒有待審批項目。</p>';
            return;
        }

        let html = '';
        items.forEach((item) => {
            html += `
                <div style="border-bottom: 1px solid #ccc; padding: 10px 0;">
                    <p><strong>ID:</strong> ${item.signId} | <strong>Risk:</strong> ${item.risk} | <strong>欄位:</strong> ${item.field}</p>
                    <p><strong>新內容:</strong> ${item.value}</p>
                    <button onclick="reviewItem('${item.signId}', '${item.risk}', '${item.field}', '${item.value}', 'APPROVED')" style="background:green; color:white; padding:4px 8px;">通過</button>
                    <button onclick="reviewItem('${item.signId}', '${item.risk}', '${item.field}', '${item.value}', 'REJECTED')" style="background:red; color:white; padding:4px 8px;">拒絕</button>
                </div>
            `;
        });
        listDiv.innerHTML = html;
    } catch (e) { listDiv.innerHTML = '載入失敗'; }
}

window.reviewItem = async function(signId, risk, field, value, status) {
    await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'processApproval', signId, risk, field, value, status, reviewer: 'Admin' })
    });
    alert(`已完成審批: ${status}`);
    openApprovalModal();
    fetchSignsFromSheet();
};

document.getElementById('close-modal-btn').onclick = () => {
    document.getElementById('approval-modal').style.display = 'none';
};

// QR 碼相機掃描與權限防呆實作
async function startQRCodeScanner() {
    let container = document.getElementById('qr-scanner-modal');
    if (!container) {
        container = document.createElement('div');
        container.id = 'qr-scanner-modal';
        container.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:9999;";
        container.innerHTML = `
            <div style="background:white; padding:20px; border-radius:8px; text-align:center; max-width:90%;">
                <h3>請對準 QR Code 進行掃描</h3>
                <video id="preview-video" style="width:100%; max-width:300px; height:auto; background:#000;"></video>
                <br><br>
                <button id="close-scanner-btn" style="padding:8px 16px; background:red; color:white; border:none; border-radius:4px;">關閉相機</button>
            </div>
        `;
        document.body.appendChild(container);
    }
    container.style.display = 'flex';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const videoElement = document.getElementById('preview-video');
        videoElement.srcObject = stream;
        videoElement.play();

        document.getElementById('close-scanner-btn').onclick = () => {
            stream.getTracks().forEach(track => track.stop());
            container.style.display = 'none';
        };
    } catch (error) {
        // 嚴格落實：若使用者不允許權限，則關閉相機模組與視窗
        alert("已拒絕相機權限或不支援相機，將關閉相機模組。");
        container.style.display = 'none';
    }
}
