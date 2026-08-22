const GAS_URL = "https://script.google.com/macros/s/AKfycbxb3cScYhic7VOl7nn0sgOFRuhiTiApcrwlDV9XTMA1UUD_pNZRBuywOAewUeAv1jWmrw/exec";

let rawSigns = [];
let approvedData = {};
let isExpanded = false;
let isAdmin = false;
let currentViewPath = { level: 'categories', category: null, name: null, id: null, risk: null };
let scannerStream = null;
let scanningAnimationId = null;

document.addEventListener("DOMContentLoaded", () => {
    initI18n();
    setupEventListeners();
    fetchSignsFromSheet();
    setupHeaderLongPress();
    
    setInterval(fetchGASData, 10000);
    setInterval(fetchPendingCount, 15000);
});

function initI18n() {}

function setupEventListeners() {
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

    document.querySelectorAll('button').forEach(btn => {
        if (btn.innerText.includes('資料庫模式')) {
            btn.onclick = () => {
                currentViewPath = { level: 'categories', category: null };
                renderCurrentView();
            };
        }
    });

    document.querySelectorAll('button').forEach(btn => {
        if (btn.innerText.includes('QR')) {
            btn.onclick = startQRCodeScanner;
        }
    });
}

async function fetchSignsFromSheet() {
    try {
        let res = await fetch(`${GAS_URL}?action=getData`);
        let json = await res.json();
        let fetchedSigns = json.signs || [];
        approvedData = json.approved || {};

        if (fetchedSigns.length === 0) {
            document.getElementById('app-container').innerHTML = `<p style="text-align:center; color:red;">警告：從 Google 試算表抓到的資料為空，請檢查 GAS 部署或工作表名稱！</p>`;
            return;
        }

        if (!isExpanded) {
            rawSigns = expandWSigns(fetchedSigns);
            isExpanded = true;
        } else {
            rawSigns = updateExistingSigns(fetchedSigns);
        }
        
        renderCurrentView();
    } catch (e) {
        console.error("資料載入失敗", e);
        document.getElementById('app-container').innerHTML = `<p style="text-align:center; color:red;">連線至 GAS 失敗: ${e.message}</p>`;
    }
}

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
        if (badge && json.count > 0) {
            badge.innerText = `待審批: ${json.count}`;
            badge.style.display = 'inline-block';
        } else if (badge) {
            badge.style.display = 'none';
        }
    } catch (e) { console.error(e); }
}

function renderCurrentView() {
    const container = document.getElementById('app-container');
    if (!container) return;
    container.innerHTML = '';

    if (currentViewPath.level === 'categories') renderCategoryView(container);
    else if (currentViewPath.level === 'signs') renderSignsView(container, currentViewPath.category);
    else if (currentViewPath.level === 'names') renderNamesView(container, currentViewPath.category);
    else if (currentViewPath.level === 'risks') renderRisksView(container, currentViewPath.name);
    else if (currentViewPath.level === 'detail') renderDetailView(container, currentViewPath.id, currentViewPath.risk);
}

function renderCategoryView(container) {
    let categories = [...new Set(rawSigns.map(s => s.category))];
    let html = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:16px;">`;
    categories.forEach(cat => {
        let firstSign = rawSigns.find(s => s.category === cat);
        html += `
            <div style="background:white; border-radius:8px; padding:16px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.1); cursor:pointer;" onclick="navigateToCategory('${cat}')">
                <img src="${firstSign?.svg_url || firstSign?.image || ''}" alt="${cat}" style="max-width:100px; height:100px; object-fit:contain; margin-bottom:8px;">
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
    let html = `<button onclick="backToCategories()" style="margin-bottom:15px; padding:6px 12px; cursor:pointer;">⬅ 返回分類</button><h2>${cat} 標誌列表</h2><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:16px;">`;
    signs.forEach(s => {
        html += `
            <div style="background:white; border-radius:8px; padding:16px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.1); cursor:pointer;" onclick="handleSignClick('${s.id}', '${s.category}', '${s.name}')">
                <img src="${s.svg_url || s.image}" alt="${s.name}" style="max-width:100px; height:100px; object-fit:contain; margin-bottom:8px;">
                <p><strong>${s.id}</strong><br>${s.name}</p>
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
    let html = `<button onclick="navigateToCategory('${cat}')" style="margin-bottom:15px; padding:6px 12px; cursor:pointer;">⬅ 返回 ${cat}</button><h2>注意標誌群組</h2><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:16px;">`;
    uniqueNames.forEach(name => {
        let sample = wSigns.find(s => s.name === name);
        html += `
            <div style="background:white; border-radius:8px; padding:16px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.1); cursor:pointer;" onclick="navigateToRisks('${name}')">
                <img src="${sample.svg_url || sample.image}" alt="${name}" style="max-width:100px; height:100px; object-fit:contain; margin-bottom:8px;">
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
    let html = `<button onclick="currentViewPath.level='names'; renderCurrentView();" style="margin-bottom:15px; padding:6px 12px; cursor:pointer;">⬅ 返回群組</button><h2>${name} - 風險等級選擇</h2><div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:16px;">`;
    
    for (let i = 1; i <= 4; i++) {
        let variant = variants.find(v => Number(v.risk) === i) || sample;
        html += `
            <div style="background:white; border-radius:8px; padding:16px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.1); cursor:pointer;" onclick="navigateToDetail('${variant.id}', '${i}')">
                <img src="${variant.svg_url || variant.image}" alt="Risk ${i}" style="max-width:100px; height:100px; object-fit:contain; margin-bottom:8px;">
                <p><strong>Risk Level: ${i}</strong></p>
            </div>
        `;
    }
    container.innerHTML = html + `</div>`;
};

window.navigateToDetail = (id, risk) => {
    currentViewPath = { level: 'detail', id: id, risk: risk };
    renderCurrentView();
};

function renderDetailView(container, id, risk) {
    let sign = rawSigns.find(s => s.id === id);
    let uniqueKey = `${sign.id}_Risk${risk}`;
    let currentData = approvedData[uniqueKey] || approvedData[`${sign.id}_Normal`] || sign;

    let html = `
        <button onclick="currentViewPath.level='signs'; renderCurrentView();" style="margin-bottom:15px; padding:6px 12px; cursor:pointer;">⬅ 返回列表</button>
        <div style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
            <h2>${sign.name} (ID: ${sign.id})</h2>
            <img src="${sign.svg_url || sign.image}" style="max-width:120px; height:120px; object-fit:contain; display:block; margin: 0 auto 1rem auto;">
            <p><strong>風險等級 (Risk Level):</strong> ${risk} <span style="font-size:0.8rem; color:gray;">(唯讀不可編輯)</span></p>
            
            <table style="width:100%; border-collapse:collapse; margin-top:15px;">
                <tr><th style="border:1px solid #cbd5e1; padding:10px; background:#e2e8f0;">控制項欄位</th><th style="border:1px solid #cbd5e1; padding:10px; background:#e2e8f0;">內容值</th></tr>
                <tr><td style="border:1px solid #cbd5e1; padding:10px;">頻率 (freq)</td><td style="border:1px solid #cbd5e1; padding:10px; background:#f8fafc; cursor:pointer;" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'freq', this)">${currentData.freq || ''}</td></tr>
                <tr><td style="border:1px solid #cbd5e1; padding:10px;">排除 (elim)</td><td style="border:1px solid #cbd5e1; padding:10px; background:#f8fafc; cursor:pointer;" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'elim', this)">${currentData.elim || ''}</td></tr>
                <tr><td style="border:1px solid #cbd5e1; padding:10px;">替代 (sub)</td><td style="border:1px solid #cbd5e1; padding:10px; background:#f8fafc; cursor:pointer;" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'sub', this)">${currentData.sub || ''}</td></tr>
                <tr><td style="border:1px solid #cbd5e1; padding:10px;">工程 (eng)</td><td style="border:1px solid #cbd5e1; padding:10px; background:#f8fafc; cursor:pointer;" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'eng', this)">${currentData.eng || ''}</td></tr>
                <tr><td style="border:1px solid #cbd5e1; padding:10px;">管理 (admin)</td><td style="border:1px solid #cbd5e1; padding:10px; background:#f8fafc; cursor:pointer;" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'admin', this)">${currentData.admin || ''}</td></tr>
                <tr><td style="border:1px solid #cbd5e1; padding:10px;">防護具 (ppe)</td><td style="border:1px solid #cbd5e1; padding:10px; background:#f8fafc; cursor:pointer;" ondblclick="handleCellEdit('${sign.id}', '${risk}', 'ppe', this)">${currentData.ppe || ''}</td></tr>
            </table>
        </div>
    `;
    container.innerHTML = html;
}

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

function setupHeaderLongPress() {
    let header = document.querySelector('header');
    let timer = null;

    const triggerAdmin = () => {
        isAdmin = true;
        alert("【系統提示】管理員權限已啟動！");
    };

    if (header) {
        header.addEventListener('mousedown', () => { timer = setTimeout(triggerAdmin, 3000); });
        header.addEventListener('mouseup', () => clearTimeout(timer));
        header.addEventListener('touchstart', () => { timer = setTimeout(triggerAdmin, 3000); });
        header.addEventListener('touchend', () => clearTimeout(timer));
    }
}

// 【真・QR 掃描與解碼相機模組】結合 jsQR 即時辨識
async function startQRCodeScanner() {
    let container = document.getElementById('qr-scanner-modal');
    if (!container) {
        container = document.createElement('div');
        container.id = 'qr-scanner-modal';
        container.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:9999;";
        container.innerHTML = `
            <div style="background:white; padding:20px; border-radius:8px; text-align:center; max-width:90%; position:relative;">
                <h3>請將鏡頭對準 QR Code</h3>
                <div style="position:relative; width:300px; height:300px; margin:0 auto; background:#000;">
                    <video id="preview-video" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
                    <canvas id="qr-canvas" style="display:none;"></canvas>
                </div>
                <p id="scanner-status" style="font-size:0.9rem; color:#007bff; margin-top:10px;">正在尋找 QR Code...</p>
                <br>
                <button id="close-scanner-btn" style="padding:8px 20px; background:red; color:white; border:none; border-radius:4px; cursor:pointer;">關閉相機</button>
            </div>
        `;
        document.body.appendChild(container);
    }
    container.style.display = 'flex';

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("您的瀏覽器不支援相機存取，或目前非安全連線 (HTTPS)。");
        }

        scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const videoElement = document.getElementById('preview-video');
        videoElement.srcObject = scannerStream;
        videoElement.play();

        const canvasElement = document.getElementById('qr-canvas');
        const canvasContext = canvasElement.getContext('2d', { willReadFrequently: true });
        const statusText = document.getElementById('scanner-status');

        // 即時每格掃描迴圈
        const scanTick = () => {
            if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;
                canvasContext.drawImage(videoElement, 0, canvasElement.width, canvasElement.height);
                
                const imageData = canvasContext.getImageData(0, 0, canvasElement.width, canvasElement.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });

                if (code) {
                    // 成功掃描到 QR Code！
                    statusText.innerHTML = `<span style="color:green;">成功識別：${code.data}</span>`;
                    stopScannerCamera();
                    container.style.display = 'none';

                    // 依照規格解析 id (支援直接是代碼如 P001 或網址帶有 ?id=P001)
                    let targetId = code.data;
                    if (code.data.includes('?id=')) {
                        const urlParams = new URLSearchParams(code.data.split('?')[1]);
                        targetId = urlParams.get('id');
                    }

                    let target = rawSigns.find(s => s.id === targetId);
                    if (target) {
                        currentViewPath = { level: 'detail', id: target.id, risk: '1' };
                        renderCurrentView();
                    } else {
                        alert(`掃描成功，但在資料庫中找不到 ID: ${targetId}`);
                    }
                    return;
                }
            }
            if (scannerStream) {
                scanningAnimationId = requestAnimationFrame(scanTick);
            }
        };

        scanningAnimationId = requestAnimationFrame(scanTick);

        document.getElementById('close-scanner-btn').onclick = () => {
            stopScannerCamera();
            container.style.display = 'none';
        };

    } catch (error) {
        console.warn("相機啟用失敗：", error);
        alert("無法開啟相機： " + error.message);
        container.style.display = 'none';
    }
}

function stopScannerCamera() {
    if (scanningAnimationId) {
        cancelAnimationFrame(scanningAnimationId);
        scanningAnimationId = null;
    }
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
}
