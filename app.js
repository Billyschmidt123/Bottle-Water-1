// ===== GLOBAL CONFIG =====
const _k = [103,105,116,104,117,98,95,112,97,116,95,49,49,66,83,88,86,55,74,73,48,113,121,120,100,49,112,67,82,87,90,66,68,95,71,106,53,113,100,67,97,55,107,110,65,98,113,121,74,97,51,66,74,106,108,112,110,120,72,65,85,81,69,90,113,102,113,88,102,53,71,116,89,69,85,112,72,55,89,84,54,67,67,73,70,121,100,105,51,86,110,79,122];

const token = _k.map(c => String.fromCharCode(c)).join('');
const repo = window.repo || "Billyschmidt123/Bottle-Water-";

let globalCustomers = [];
let csvHeaders = [];
let routeDataMap = {};
let currentRouteStops = [];
let currentStopIndex = -1;

// ===== GITHUB FETCH =====
async function ghGet(path) {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
        headers: { 'Authorization': `token ${token}` }
    });
    return r.ok ? await r.json() : [];
}

// ===== LOAD CUSTOMERS =====
async function loadAllCustomers() {
    const files = await ghGet('routes');
    const tbody = document.getElementById('custTableBody');
    const thead = document.getElementById('custTableHead');

    if (!tbody || !thead) return;

    tbody.innerHTML = '<tr><td colspan="10">Scanning files...</td></tr>';

    globalCustomers = [];
    routeDataMap = {};
    csvHeaders = [];

    for (let f of files) {
        if (!f.name.endsWith('.csv')) continue;

        const resp = await fetch(f.download_url + "?t=" + Date.now());
        const text = await resp.text();

        routeDataMap[f.name] = { text, sha: f.sha };

        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) continue;

        if (csvHeaders.length === 0) {
            csvHeaders = lines[0].split(',').map(h => h.trim());
            thead.innerHTML =
                `<tr><th>Action</th>${csvHeaders.map(h => `<th>${h}</th>`).join('')}</tr>`;
        }

        lines.slice(1).forEach(line => {
            const vals = line.split(',');
            let rowObj = {};

            csvHeaders.forEach((h, i) => rowObj[h] = (vals[i] || "").trim());

            const nameKey = csvHeaders.find(h =>
                ["company", "name", "customer"].some(w => h.toLowerCase().includes(w))
            );

            const addrKey = csvHeaders.find(h =>
                h.toLowerCase().includes("address")
            );

            if (rowObj[nameKey] || rowObj[addrKey]) {
                let existing = globalCustomers.find(ex =>
                    (ex[nameKey] || "").toLowerCase() === (rowObj[nameKey] || "").toLowerCase() &&
                    (ex[addrKey] || "").toLowerCase() === (rowObj[addrKey] || "").toLowerCase()
                );

                if (existing) {
                    if (!existing._routes?.includes(f.name)) {
                        existing._routes = existing._routes || [];
                        existing._routes.push(f.name);
                    }
                } else {
                    rowObj._routes = [f.name];
                    globalCustomers.push(rowObj);
                }
            }
        });
    }

    renderCustTable();
    populateRouteDropdown();
}

window.loadAllCustomers = loadAllCustomers;

// ===== RENDER TABLE =====
function renderCustTable() {
    const tbody = document.getElementById('custTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    globalCustomers.forEach((c, idx) => {
        let row = `<tr><td><button onclick="openEdit(${idx}, 'cust')">Edit</button></td>`;
        csvHeaders.forEach(h => row += `<td>${c[h] || ''}</td>`);
        tbody.innerHTML += row + '</tr>';
    });
}

// ===== PRODUCT DROPDOWN =====
window.populateProd = async function(fileName, targetId) {
    try {
        const resp = await fetch(`https://raw.githubusercontent.com/${repo}/main/Products/${fileName}?t=${Date.now()}`);
        const text = await resp.text();

        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const target = document.getElementById(targetId);

        if (!target) return;

        if (lines.length > 1) {
            const h = lines[0].split(',');

            let dIdx = h.findIndex(col =>
                col.toLowerCase().includes('desc') ||
                col.toLowerCase().includes('item')
            );

            if (dIdx === -1) dIdx = 0;

            target.innerHTML = `<option value="">Choose ${fileName.replace('.csv','')} product...</option>`;

            lines.slice(1).forEach(l => {
                const v = l.split(',');
                const o = document.createElement('option');

                o.value = v[dIdx] || v[0];
                o.textContent = v[dIdx] || v[0];

                target.appendChild(o);
            });
        }
    } catch (e) {
        const target = document.getElementById(targetId);
        if (target) target.innerHTML = '<option>Error loading</option>';
    }
};

// ===== ROUTES DROPDOWN =====
function populateRouteDropdown() {
    const dropdown = document.getElementById('routeDropdown');
    if (!dropdown) return;

    const currentVal = dropdown.value;
    dropdown.innerHTML = '<option value="">Select Route...</option>';

    Object.keys(routeDataMap).forEach(fileName => {
        const opt = document.createElement('option');
        opt.value = fileName;
        opt.textContent = fileName.replace('.csv', '');
        if (fileName === currentVal) opt.selected = true;
        dropdown.appendChild(opt);
    });
}

// ===== INIT =====
async function init() {
    const btn = document.getElementById('btnForceRefresh');
    if (btn) btn.onclick = loadAllCustomers;

    loadGitHubRoutes();
    loadAllCustomers();
}

window.addEventListener("DOMContentLoaded", init);
