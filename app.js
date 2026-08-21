const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxb3cScYhic7VOl7nn0sgOFRuhiTiApcrwlDV9XTMA1UUD_pNZRBuywOAewUeAv1jWmrw/exec";

let rawSignsData = [];      
let processedSigns = [];    
let approvedDataMap = {};   
let currentLang = 'zh';

// 導覽狀態變數
let currentView = 'categories'; // 'categories' | 'signs_in_category' | 'sign_detail'
let selectedCategory = null;
let selectedSignDetail = null;

const i18nText = {
    zh: { app_title: "ISO7010 安全標誌系統", export_excel: "匯出 Excel", search_placeholder: "輸入關鍵字搜尋標誌...", mode_db: "資料庫模式", mode_qr: "QR 掃描模式", submit_approval: "提交審批", approval_title: "待審批清單", back_categories: "返回分類" },
    en: { app_title: "ISO7010 Safety PWA", export_excel: "Export Excel", search_placeholder: "Search signs...", mode_db: "Database", mode_qr: "QR Scanner", submit_approval: "Submit Approval", approval_title: "Pending Approvals", back_categories: "Back to Categories" },
    de: { app_title: "ISO7010 Sicherheitszeichen", export_excel: "Excel exportieren", search_placeholder: "Zeichen suchen...", mode_db: "Datenbank", mode_qr: "QR-Scanner", submit_approval: "Genehmigung einreichen", approval_title: "Ausstehende Genehmigungen", back_categories: "Zurück zu Kategorien" }
};

document.addEventListener("DOMContentLoaded", () => {
    initI18n();
    setupEventListeners();
    setupHeaderLongPress();
    fetchSignsFromSheet();
    fetchGASData();
    fetchPendingCount();

    setInterval(fetchGASData, 10000);       
    setInterval(fetchPendingCount, 15000);  

    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('id');
    if (targetId) {
        setTimeout(() => handleQRDirectOpen(targetId), 1000);
    }
});

function initI18n() {
    const select = document.getElementById('lang-select');
    select.value = currentLang;
    select.addEventListener('change', (e) => {
        currentLang = e.target.value;
        updateUIText();
    });
}

function updateUIText() {
    const texts = i18nText[currentLang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (texts[key]) el.textContent = texts[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (texts[key]) el.placeholder = texts[key];
    });
}

function setupEventListeners() {
    document.getElementById('search-input').addEventListener('input', () => {
        currentView = 'categories';
        renderSigns();
    });
    document.getElementById('export-btn').addEventListener('click', exportExcel);
    
    document.getElementById('mode-db').addEventListener('click', () => {
        document.getElementById('mode-db').classList.add('active');
        document.getElementById('mode-qr').classList.remove('active');
        document.getElementById('qr-reader-section').style.display = 'none';
        document.getElementById('signs-container').style.display = 'grid';
        currentView = 'categories';
        renderSigns();
    });

    document.getElementById('mode-qr').addEventListener('click', () => {
        document.getElementById('mode-qr').classList.add('active');
        document.getElementById('mode-db').classList.remove('active');
        document.getElementById('qr-reader-section').style.display = 'block';
        document.getElementById('signs-container').style.display = 'none';
        startQRScanner();
    });

    document.getElementById('close-edit-modal').onclick = () => document.getElementById('edit-modal').style.display = 'none';
    document.getElementById('close-approval-modal').onclick = () => document.getElementById('approval-modal').style.display = 'none';

    document.getElementById('edit-form').addEventListener('submit', handleSignSubmit);
}

function setupHeaderLongPress() {
    let timer = null;
    const header = document.getElementById('main-header');

    const startPress = () => { timer = setTimeout(openApprovalModal, 3000); };
    const cancelPress = () => clearTimeout(timer);

    header.addEventListener('mousedown', startPress);
    header.addEventListener('mouseup', cancelPress);
    header.addEventListener('mouseleave', cancelPress);
    header.addEventListener('touchstart', startPress);
    header.addEventListener('touchend', cancelPress);
}

async function fetchSignsFromSheet() {
    try {
        const res = await fetch(`${GAS_API_URL}?action=getSigns`);
        const data = await res.json();
        rawSignsData = data || [];
        processAndRender();
    } catch (e) {
        console.error("fetchSignsFromSheet error:", e);
    }
}

async function fetchGASData() {
    try {
        const res = await fetch(`${GAS_API_URL}?action=getData`);
        const result = await res.json();
        approvedDataMap = {};
        if (result && result.subDirectories) {
            result.subDirectories.forEach(item => {
                const key = `${item.ID}_${item.Risk}`;
                approvedDataMap[key] = item;
            });
        }
        processAndRender();
    } catch (e) {
        console.error("fetchGASData error:", e);
    }
}

async function fetchPendingCount() {
    try {
        const res = await fetch(`${GAS_API_URL}?action=getPendingCount`);
        const data = await res.json();
        document.getElementById('pending-badge').textContent = data.count || 0;
    } catch (e) {
        console.error("fetchPendingCount error:", e);
    }
}

function processAndRender() {
    processedSigns = [];
    rawSignsData.forEach(sign => {
        const cat = sign.category || 'Uncategorized';
        if (cat === 'Warning sign') {
            for (let i = 1; i <= 4; i++) {
                const riskLevel = `Risk${i}`;
                const uniqueKey = `${sign.id}_${riskLevel}`;
                const approvedInfo = approvedDataMap[uniqueKey] || {};

                processedSigns.push({
                    ...sign,
                    category: cat,
                    risk: riskLevel,
                    freq: approvedInfo.Field === 'freq' ? approvedInfo.Value : (sign.freq || ''),
                    elim: approvedInfo.Field === 'elim' ? approvedInfo.Value : (sign.elim || ''),
                    sub: approvedInfo.Field === 'sub' ? approvedInfo.Value : (sign.sub || ''),
                    eng: approvedInfo.Field === 'eng' ? approvedInfo.Value : (sign.eng || ''),
                    admin: approvedInfo.Field === 'admin' ? approvedInfo.Value : (sign.admin || ''),
                    ppe: approvedInfo.Field === 'ppe' ? approvedInfo.Value : (sign.ppe || '')
                });
            }
        } else {
            const riskLevel = sign.risk || 'Risk1';
            const uniqueKey = `${sign.id}_${riskLevel}`;
            const approvedInfo = approvedDataMap[uniqueKey] || {};
            processedSigns.push({
                ...sign,
                category: cat,
                risk: riskLevel,
                freq: approvedInfo.Field === 'freq' ? approvedInfo.Value : (sign.freq || ''),
                elim: approvedInfo.Field === 'elim' ? approvedInfo.Value : (sign.elim || ''),
                sub: approvedInfo.Field === 'sub' ? approvedInfo.Value : (sign.sub || ''),
                eng: approvedInfo.Field === 'eng' ? approvedInfo.Value : (sign.eng || ''),
                admin: approvedInfo.Field === 'admin' ? approvedInfo.Value : (sign.admin || ''),
                ppe: approvedInfo.Field === 'ppe' ? approvedInfo.Value : (sign.ppe || '')
            });
        }
    });
    renderSigns();
}

function renderSigns() {
    const container = document.getElementById('signs-container');
    const keyword = document.getElementById('search-input').value.toLowerCase();
    const backBtn = document.getElementById('back-to-categories');
    container.innerHTML = '';

    if (keyword.trim() !== '') {
        backBtn.style.display = 'inline-block';
        backBtn.onclick = () => {
            document.getElementById('search-input').value = '';
            currentView = 'categories';
            renderSigns();
        };
        const filtered = processedSigns.filter(s => 
            (s.name && s.name.toLowerCase().includes(keyword)) || 
            (s.id && s.id.toLowerCase().includes(keyword))
        );
        renderSignCards(filtered, container);
        return;
    }

    if (currentView === 'categories') {
        backBtn.style.display = 'none';
        const categories = [...new Set(processedSigns.map(s => s.category))];
        
        categories.forEach(cat => {
            const representative = processedSigns.find(s => s.category === cat);
            const card = document.createElement('div');
            card.className = 'category-card';
            card.innerHTML = `
                <img src="${representative ? representative.svg_url : ''}" alt="${cat}" onerror="this.src='https://via.placeholder.com/100'">
                <h3>${cat}</h3>
                <p>點擊進入分類</p>
            `;
            card.onclick = () => {
                selectedCategory = cat;
                currentView = 'signs_in_category';
                renderSigns();
            };
            container.appendChild(card);
        });
    } else if (currentView === 'signs_in_category') {
        backBtn.style.display = 'inline-block';
        backBtn.onclick = () => {
            currentView = 'categories';
            selectedCategory = null;
            renderSigns();
        };
        const signsInCat = processedSigns.filter(s => s.category === selectedCategory);
        renderSignCards(signsInCat, container);
    } else if (currentView === 'sign_detail') {
        backBtn.style.display = 'inline-block';
        backBtn.onclick = () => {
            currentView = 'signs_in_category';
            renderSigns();
        };
        renderSignDetailView(selectedSignDetail, container);
    }
}

function renderSignCards(signs, container) {
    signs.forEach(sign => {
        const card = document.createElement('div');
        card.className = 'sign-card';
        card.innerHTML = `
            <img src="${sign.svg_url}" alt="${sign.name}" onerror="this.src='https://via.placeholder.com/100'">
            <h3>${sign.id}: ${sign.name || ''}</h3>
            <span class="risk-badge">${sign.risk}</span>
            <p>Freq: ${sign.freq} | Elim: ${sign.elim}</p>
        `;
        card.onclick = () => {
            selectedSignDetail = sign;
            currentView = 'sign_detail';
            renderSigns();
        };
        container.appendChild(card);
    });
}

function renderSignDetailView(sign, container) {
    container.innerHTML = `
        <div class="detail-card" style="grid-column: 1 / -1;">
            <div style="display:flex; gap:20px; align-items:center; width:100%; margin-bottom:20px;">
                <img src="${sign.svg_url}" alt="${sign.name}" style="width:120px;height:120px;object-fit:contain;">
                <div>
                    <h2>${sign.id}: ${sign.name || ''}</h2>
                    <p><b>分類 (Category):</b> ${sign.category}</p>
                    <p><b>風險等級 (Risk):</b> <span class="risk-badge">${sign.risk}</span></p>
                </div>
            </div>
            <h3>詳細危害控制資訊</h3>
            <div class="detail-list" style="margin-top:15px;">
                <div class="detail-item"><b>Freq:</b> ${sign.freq || '無'}</div>
                <div class="detail-item"><b>Elim:</b> ${sign.elim || '無'}</div>
                <div class="detail-item"><b>Sub:</b> ${sign.sub || '無'}</div>
                <div class="detail-item"><b>Eng:</b> ${sign.eng || '無'}</div>
                <div class="detail-item"><b>Admin:</b> ${sign.admin || '無'}</div>
                <div class="detail-item"><b>PPE:</b> ${sign.ppe || '無'}</div>
            </div>
            <button onclick="openEditModal('${sign.id}', '${sign.risk}')" style="margin-top:20px; padding:10px 20px; background:#3b82f6; color:white; border:none; border-radius:4px; cursor:pointer;">編輯此標誌控制項</button>
        </div>
    `;
}

function openEditModal(signId, riskLevel) {
    const sign = processedSigns.find(s => s.id === signId && s.risk === riskLevel);
    if (!sign) return;

    document.getElementById('edit-sign-id').value = sign.id;
    document.getElementById('edit-risk-level').value = sign.risk; // 確保與畫面三角形下方一致且唯讀
    document.getElementById('val-freq').value = sign.freq;
    document.getElementById('val-elim').value = sign.elim;
    document.getElementById('val-sub').value = sign.sub;
    document.getElementById('val-eng').value = sign.eng;
    document.getElementById('val-admin').value = sign.admin;
    document.getElementById('val-ppe').value = sign.ppe;
    document.getElementById('val-applicant').value = '';

    document.getElementById('edit-modal').style.display = 'flex';
}

async function handleSignSubmit(e) {
    e.preventDefault();
    const payload = {
        action: 'submitApproval',
        signId: document.getElementById('edit-sign-id').value,
        risk: document.getElementById('edit-risk-level').value,
        field: 'all',
        value: JSON.stringify({
            freq: document.getElementById('val-freq').value,
            elim: document.getElementById('val-elim').value,
            sub: document.getElementById('val-sub').value,
            eng: document.getElementById('val-eng').value,
            admin: document.getElementById('val-admin').value,
            ppe: document.getElementById('val-ppe').value
        }),
        applicant: document.getElementById('val-applicant').value
    };

    try {
        const res = await fetch(GAS_API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            alert('已成功送審 (PENDING)');
            document.getElementById('edit-modal').style.display = 'none';
            fetchPendingCount();
        } else {
            alert('送審失敗: ' + result.message);
        }
    } catch (err) {
        console.error(err);
        alert('送審發生錯誤');
    }
}

async function openApprovalModal() {
    const container = document.getElementById('approval-list-container');
    container.innerHTML = '載入中...';
    document.getElementById('approval-modal').style.display = 'flex';

    try {
        const res = await fetch(`${GAS_API_URL}?action=getPendingApprovals`);
        const list = await res.json();
        container.innerHTML = '';

        if (!list || list.length === 0) {
            container.innerHTML = '<p>目前沒有待審批項目。</p>';
            return;
        }

        list.forEach(item => {
            const div = document.createElement('div');
            div.style.borderBottom = '1px solid #ddd';
            div.style.padding = '10px 0';
            div.innerHTML = `
                <p><b>ID:</b> ${item.signId} | <b>Risk:</b> ${item.risk} | <b>申請人:</b> ${item.applicant}</p>
                <p><b>內容:</b> ${item.value}</p>
                <button onclick="reviewApproval('${item.timestamp}', '${item.signId}', '${item.risk}', 'APPROVED')">核准 (APPROVED)</button>
                <button onclick="reviewApproval('${item.timestamp}', '${item.signId}', '${item.risk}', 'REJECTED')" style="background:#ef4444; color:white;">駁回 (REJECTED)</button>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        container.innerHTML = '<p>載入失敗</p>';
    }
}

async function reviewApproval(timestamp, signId, risk, status) {
    const reviewer = prompt("請輸入審批人姓名:") || "Admin";
    try {
        const res = await fetch(GAS_API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'reviewApproval', timestamp, signId, risk, status, reviewer })
        });
        const result = await res.json();
        if (result.success) {
            alert(`已完成審批: ${status}`);
            openApprovalModal();
            fetchGASData();
            fetchPendingCount();
        } else {
            alert('審批失敗');
        }
    } catch (e) {
        console.error(e);
        alert('審批發生錯誤');
    }
}

function handleQRDirectOpen(id) {
    document.getElementById('search-input').value = id;
    renderSigns();
}

function startQRScanner() {
    const html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
            try {
                const url = new URL(decodedText);
                const id = url.searchParams.get('id');
                if (id) {
                    html5QrCode.stop();
                    document.getElementById('mode-db').click();
                    document.getElementById('search-input').value = id;
                    renderSigns();
                }
            } catch {
                html5QrCode.stop();
                document.getElementById('mode-db').click();
                document.getElementById('search-input').value = decodedText;
                renderSigns();
            }
        },
        (error) => {}
    ).catch(err => console.log("QR Scanner error:", err));
}

function exportExcel() {
    const exportData = processedSigns.map(s => ({
        ID: s.id,
        Name: s.name,
        Category: s.category,
        Risk: s.risk,
        Freq: s.freq,
        Elim: s.elim,
        Sub: s.sub,
        Eng: s.eng,
        Admin: s.admin,
        PPE: s.ppe
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ISO7010_Data");

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timestampStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    
    XLSX.writeFile(workbook, `ISO7010_Database_${timestampStr}.xlsx`);
}
