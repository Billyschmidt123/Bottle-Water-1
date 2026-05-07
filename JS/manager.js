// manager.js
// Manager portal + GitHub route importer

function managerInit() {
    console.log("Manager module ready");
}

function loadManagerPortal() {
    fetch("MODULES/manager-portal.html")
        .then(r => r.text())
        .then(html => {
            showModal(html);
        })
        .catch(err => console.error("Failed to load manager portal:", err));
}

const GITHUB_BASE =
    "https://raw.githubusercontent.com/Billyschmidt123/Bottle-Water-/main/routes/";
const GITHUB_API =
    "https://api.github.com/repos/Billyschmidt123/Bottle-Water-/contents/routes/";
const ROUTE_FOLDERS = ["week1", "week2", "week3", "week4", "other"];

async function importAllRoutesFromGitHub() {
    console.log("Importing routes from GitHub...");

    if (!window.appState) window.appState = {};
    if (!appState.routes) appState.routes = {};

    for (const folder of ROUTE_FOLDERS) {
        const apiUrl = `${GITHUB_API}${folder}`;

        let files;
        try {
            files = await fetch(apiUrl).then(r => r.json());
        } catch (e) {
            console.warn("Failed to read folder:", folder);
            continue;
        }

        if (!Array.isArray(files)) continue;

        for (const file of files) {
            if (!file.name.endsWith(".csv")) continue;

            const csvUrl = `${GITHUB_BASE}${folder}/${file.name}`;
            let csvText;

            try {
                csvText = await fetch(csvUrl).then(r => r.text());
            } catch (e) {
                console.warn("Failed to load CSV:", csvUrl);
                continue;
            }

            const customers = parseCsv(csvText);
            const routeKey = `${folder}-${file.name.replace(".csv", "")}`;

            appState.routes[routeKey] = {
                name: routeKey,
                customers
            };
        }
    }

    console.log("Routes imported:", Object.keys(appState.routes));
    populateRouteDropdown();
}

function parseCsv(text) {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length);
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = cols[idx] ? cols[idx].trim() : "";
        });
        rows.push(obj);
    }

    return rows;
}

function populateRouteDropdown() {
    const dd = document.getElementById("routeDropdown");
    if (!dd) {
        console.warn("Route dropdown not found on page.");
        return;
    }

    dd.innerHTML = `<option value="">-- Select a route --</option>`;

    for (const key of Object.keys(appState.routes)) {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = appState.routes[key].name;
        dd.appendChild(opt);
    }

    console.log("Route dropdown populated.");
}

function enhanceManagerPortalIfPresent() {
    const modals = document.querySelectorAll(".modal");
    if (!modals.length) return;

    let managerModal = null;

    modals.forEach(m => {
        const header = m.querySelector(".modal-header");
        if (header && header.textContent.includes("Manager Portal")) {
            managerModal = m;
        }
    });

    if (!managerModal) return;

    const importBtn = managerModal.querySelector("#btnImportRoutes");
    if (importBtn && !importBtn._bound) {
        importBtn.addEventListener("click", () => {
            console.log("Load routes clicked");
            importAllRoutesFromGitHub();
        });
        importBtn._bound = true;
    }
}

(function () {
    const originalShowModal = window.showModal;

    if (typeof originalShowModal === "function") {
        window.showModal = function (html) {
            originalShowModal(html);

            setTimeout(() => {
                try {
                    enhanceManagerPortalIfPresent();
                } catch (e) {
                    console.warn("Manager portal enhancement failed:", e);
                }
            }, 0);
        };
    }
})();
