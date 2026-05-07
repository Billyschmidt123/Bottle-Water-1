// ============================================================
//  LogiFlow Delivery - Inline Logic Moved From index.html
//  This file centralizes all inline script functionality.
// ============================================================

// GLOBALS
window.globalCustomers = window.globalCustomers || [];
window.repo = "YOUR_GITHUB_USERNAME/YOUR_REPO_NAME";   // <-- Replace with your repo
window.token = "";  // <-- If using GitHub API auth, insert token here

// ============================================================
//  UTILITY
// ============================================================

function getTodayISO() {
    const d = new Date();
    return d.toISOString().split("T")[0];
}

// ============================================================
//  STOP SELECTION + EDITING
// ============================================================

window.selectAndEditStop = function(globalIdx, routeIdx, routeFile) {
    const stop = globalCustomers[globalIdx];
    if (!stop) return;

    // Populate edit modal
    const editFields = document.getElementById("editFields");
    editFields.innerHTML = Object.keys(stop).map(key => {
        if (key.startsWith("__")) return "";
        return `
            <label>${key}</label>
            <input type="text" id="edit_${key}" value="${stop[key] || ""}">
        `;
    }).join("");

    document.getElementById("btnSaveEdit").onclick = async () => {
        Object.keys(stop).forEach(key => {
            if (key.startsWith("__")) return;
            const el = document.getElementById("edit_" + key);
            if (el) stop[key] = el.value.trim();
        });

        await saveRouteToGitHub(routeFile);
        closeEditModal();
        refreshStopListForRoute(routeFile);
    };

    openEditModal();
};

// ============================================================
//  ROUTE SAVING TO GITHUB
// ============================================================

async function saveRouteToGitHub(routeFile) {
    try {
        const rows = globalCustomers.filter(c => c.__route === routeFile && !c.__callin);
        if (!rows.length) return;

        const headers = Object.keys(rows[0]).filter(h => !h.startsWith("__"));
        const csv = [
            headers.join(","),
            ...rows.map(r => headers.map(h => r[h] || "").join(","))
        ].join("\n");

        const path = `routes/${routeFile}`;
        const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            headers: { "Authorization": `token ${token}` }
        });

        let sha = "";
        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
        }

        await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            method: "PUT",
            headers: { "Authorization": `token ${token}` },
            body: JSON.stringify({
                message: `Update route ${routeFile}`,
                content: btoa(csv),
                sha
            })
        });

    } catch (e) {
        console.error("Error saving route:", e);
    }
}

// ============================================================
//  CALL-IN SYSTEM
// ============================================================

async function saveCallInToGitHub() {
    try {
        const today = getTodayISO();
        const routeFile = document.getElementById("routeDropdown").value;
        if (!routeFile) return;

        const fields = document.querySelectorAll("#callinFields input, #callinFields select");
        const row = {};
        fields.forEach(f => row[f.dataset.key] = f.value.trim());

        const cartItems = Array.from(document.querySelectorAll("#callin_CartItems .cart-item"))
            .map(el => el.dataset.product);

        row["Products"] = cartItems.join("|");

        const headers = Object.keys(row);
        const csv = [
            headers.join(","),
            headers.map(h => row[h] || "").join(",")
        ].join("\n");

        const filename = `Callin-${today}-${routeFile}-${Date.now()}.csv`;
        const path = `routes/${filename}`;

        await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            method: "PUT",
            headers: { "Authorization": `token ${token}` },
            body: JSON.stringify({
                message: `Add call-in order ${filename}`,
                content: btoa(csv)
            })
        });

        closeCallInModal();

    } catch (e) {
        console.error("Error saving call-in:", e);
    }
}

function enhanceCallInSaveButton() {
    try {
        const overlay = document.getElementById("callInModalOverlay");
        if (!overlay) return;

        const buttons = overlay.querySelectorAll("button");
        buttons.forEach(btn => {
            if (btn.textContent && btn.textContent.toLowerCase().includes("save order")) {
                btn.addEventListener("click", () => {
                    saveCallInToGitHub();
                });
            }
        });

    } catch (e) {
        console.warn("Could not enhance call-in save button", e);
    }
}

async function loadCallInsForRoute(routeFile) {
    const results = [];
    try {
        const today = getTodayISO();
        const r = await fetch(`https://api.github.com/repos/${repo}/contents/routes`, {
            headers: { "Authorization": `token ${token}` }
        });

        if (!r.ok) return results;
        const files = await r.json();

        const prefix = `Callin-${today}-`;
        const matches = files.filter(f =>
            f.name.startsWith(prefix) &&
            f.name.endsWith(".csv") &&
            f.name.includes(routeFile)
        );

        for (let f of matches) {
            const text = await (await fetch(f.download_url + "?t=" + Date.now())).text();
            const lines = text.split("\n").map(l => l.trim()).filter(l => l);
            if (!lines.length) continue;

            const headers = lines[0].split(",").map(h => h.trim());
            lines.slice(1).forEach(line => {
                const vals = line.split(",");
                let rowObj = { "__route": routeFile, "__callin": true };
                headers.forEach((h, i) => rowObj[h] = (vals[i] || "").trim());
                results.push(rowObj);
            });
        }

    } catch (e) {
        console.error("Error loading call-ins", e);
    }

    return results;
}

function injectCallInsIntoRoute(routeFile, callins) {
    if (!callins || !callins.length) return;
    callins.forEach(ci => globalCustomers.push(ci));
}

function refreshStopListForRoute(routeFile) {
    const filteredStops = globalCustomers.filter(c => c.__route === routeFile);
    const stopListEl = document.getElementById("stopList");
    if (!stopListEl) return;

    stopListEl.innerHTML = filteredStops.map((s, idx) => {
        const globalIdx = globalCustomers.indexOf(s);
        const displayName =
            s["Company Name"] ||
            s["Company"] ||
            s["Customer Name"] ||
            "Unnamed Stop";

        const isCallIn = s.__callin ? " (CALL-IN)" : "";

        return `
            <div class="route-stop-item"
                 onclick="window.selectAndEditStop(${globalIdx}, ${idx}, '${routeFile}')"
                 style="padding:12px; border-bottom:1px solid #eee; cursor:pointer;">
                <strong>${idx + 1}. ${displayName}${isCallIn}</strong><br>
                <small style="color:#666;">${s["Address"] || "No Address"}</small>
            </div>
        `;
    }).join("");
}

function flashCallInBanner() {
    const titleEl = document.getElementById("currentRouteTitle");
    if (!titleEl) return;

    const original = titleEl.innerText;
    titleEl.innerText = original + "  ⚠ CALL-IN ORDERS LOADED";
    titleEl.style.color = "#d9534f";

    setTimeout(() => {
        titleEl.innerText = original;
        titleEl.style.color = "";
    }, 4000);
}

function enhanceStartRouteForCallIns() {
    try {
        const btn = document.getElementById("btnStartRoute");
        if (!btn) return;

        btn.addEventListener("click", async () => {
            await saveCallInToGitHub();

            const routeFile = document.getElementById("routeDropdown").value;
            if (!routeFile) return;

            const callins = await loadCallInsForRoute(routeFile);
            if (callins && callins.length) {
                injectCallInsIntoRoute(routeFile, callins);
                refreshStopListForRoute(routeFile);
                flashCallInBanner();
            }
        });

    } catch (e) {
        console.warn("Could not enhance start route for call-ins", e);
    }
}

// ============================================================
//  INIT
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    enhanceCallInSaveButton();
    enhanceStartRouteForCallIns();
});
