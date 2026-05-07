/* ============================================================
   END OF DAY ARCHIVE MODULE (Dynamic Modal Version)
   Fully stand‑alone. No base code modifications required.
   Only requirement: managerEndOfDay() must call EOD.open()
   ============================================================ */

const EOD = (() => {

    /* ------------------------------------------------------------
       1. Inject Modal HTML + CSS dynamically (no HTML edits needed)
       ------------------------------------------------------------ */
    function injectModal() {
        if (document.getElementById("eodModal")) return; // already injected

        const modalHTML = `
        <div id="eodModal" style="
            display:none; position:fixed; top:0; left:0; width:100%; height:100%;
            background:rgba(0,0,0,0.6); z-index:9999; align-items:center; justify-content:center;
        ">
            <div style="
                background:#fff; padding:20px; border-radius:8px; width:420px; max-width:90%;
                text-align:left; box-shadow:0 4px 12px rgba(0,0,0,0.3);
            ">
                <h2 style="margin-top:0; margin-bottom:10px;">End of Day Archive</h2>

                <p style="margin-top:0; font-size:13px;">
                    Select a date to collect all Trip Logs from <code>trip-reports</code> and PDFs from <code>Pdf</code>,
                    zip and download them, then archive them into:
                    <br><strong>Eod-YYYY-MM-DD</strong>
                </p>

                <label style="font-size:13px;">Select date:</label><br>
                <input type="date" id="eodDate" style="margin:6px 0 12px 0; padding:4px; width:100%;">

                <div id="eodStatus" style="
                    border:1px solid #ddd; padding:8px; height:120px; overflow:auto;
                    font-size:12px; background:#fafafa; margin-bottom:10px;
                ">Waiting for date selection...</div>

                <div style="text-align:right;">
                    <button onclick="EOD.close()" style="margin-right:8px; padding:6px 10px;">Cancel</button>
                    <button onclick="EOD.run()" style="
                        padding:6px 12px; background:#007bff; color:#fff;
                        border:none; border-radius:3px; cursor:pointer;
                    ">Run End of Day</button>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML("beforeend", modalHTML);
    }

    /* ------------------------------------------------------------
       2. Logging helper
       ------------------------------------------------------------ */
    function log(msg) {
        const box = document.getElementById("eodStatus");
        if (!box) return;
        const t = new Date().toLocaleTimeString();
        box.innerHTML += `[${t}] ${msg}<br>`;
        box.scrollTop = box.scrollHeight;
    }

    /* ------------------------------------------------------------
       3. GitHub API helpers (isolated)
       ------------------------------------------------------------ */
    function getOwnerRepo() {
        if (typeof repo === "string") {
            const p = repo.split("/");
            if (p.length === 2) return { owner: p[0], repo: p[1] };
        }
        throw new Error("Global 'repo' not found or invalid.");
    }

    function authHeaders() {
        const h = { "Accept": "application/vnd.github+json" };
        if (typeof GITHUB_TOKEN === "string") h["Authorization"] = "Bearer " + GITHUB_TOKEN;
        if (typeof ghToken === "string") h["Authorization"] = "Bearer " + ghToken;
        return h;
    }

    async function ghList(path) {
        const { owner, repo } = getOwnerRepo();
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const r = await fetch(url, { headers: authHeaders() });
        if (!r.ok) throw new Error(`List failed: ${path}`);
        return r.json();
    }

    async function ghGet(path) {
        const { owner, repo } = getOwnerRepo();
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const r = await fetch(url, { headers: authHeaders() });
        if (!r.ok) throw new Error(`Get failed: ${path}`);
        const j = await r.json();
        return { content: atob(j.content.replace(/\n/g, "")), sha: j.sha };
    }

    async function ghPut(path, content) {
        const { owner, repo } = getOwnerRepo();
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const body = {
            message: `EOD archive: ${path}`,
            content: btoa(unescape(encodeURIComponent(content)))
        };
        const r = await fetch(url, {
            method: "PUT",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error(`Put failed: ${path}`);
        return r.json();
    }

    async function ghDelete(path, sha) {
        const { owner, repo } = getOwnerRepo();
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const body = {
            message: `EOD cleanup delete: ${path}`,
            sha
        };
        const r = await fetch(url, {
            method: "DELETE",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error(`Delete failed: ${path}`);
        return r.json();
    }

    /* ------------------------------------------------------------
       4. ZIP creation (JSZip)
       ------------------------------------------------------------ */
    function ensureZipLoaded() {
        return new Promise((resolve) => {
            if (window.JSZip) return resolve();
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
            s.onload = resolve;
            document.head.appendChild(s);
        });
    }

    /* ------------------------------------------------------------
       5. Main EOD workflow
       ------------------------------------------------------------ */
    async function run() {
        try {
            const date = document.getElementById("eodDate").value;
            if (!date) return alert("Select a date first.");

            document.getElementById("eodStatus").innerHTML = "";
            log("Starting EOD for " + date);

            const tripDir = "trip-reports";
            const pdfDir = "Pdf";
            const eodFolder = "Eod-" + date;

            /* 1. List trip logs */
            log("Listing trip logs...");
            const tripList = await ghList(tripDir);
            const day = date.split("-")[2];
            const tripFiles = tripList
                .filter(f => f.type === "file" && f.name.endsWith(".csv") && f.name.includes(day))
                .map(f => ({ path: `${tripDir}/${f.name}`, name: f.name }));

            log(`Found ${tripFiles.length} trip logs.`);

            /* 2. List PDFs */
            log("Listing PDFs...");
            const pdfList = await ghList(pdfDir);
            const dateCompact = date.replace(/-/g, "");
            const pdfFiles = pdfList
                .filter(f => f.type === "file" && f.name.endsWith(".pdf") && f.name.includes(dateCompact))
                .map(f => ({ path: `${pdfDir}/${f.name}`, name: f.name }));

            log(`Found ${pdfFiles.length} PDFs.`);

            const all = [...tripFiles, ...pdfFiles];
            if (all.length === 0) {
                log("No matching files.");
                return alert("No files found for that date.");
            }

            /* 3. ZIP creation */
            await ensureZipLoaded();
            const zip = new JSZip();

            log("Fetching file contents...");
            const meta = [];
            for (const f of all) {
                try {
                    const { content, sha } = await ghGet(f.path);
                    zip.file(f.name, content);
                    meta.push({ ...f, sha });
                    log("Added: " + f.name);
                } catch (e) {
                    log("ERROR reading " + f.path);
                }
            }

            log("Generating ZIP...");
            const blob = await zip.generateAsync({ type: "blob" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `EOD-${date}.zip`;
            a.click();
            log("ZIP downloaded.");

            /* 4. Upload to EOD folder */
            log("Archiving to GitHub...");
            for (const f of meta) {
                const { content } = await ghGet(f.path);
                await ghPut(`${eodFolder}/${f.name}`, content);
                log("Archived: " + f.name);
            }

            /* 5. Verify */
            log("Verifying EOD folder...");
            const verify = await ghList(eodFolder);
            const names = verify.filter(f => f.type === "file").map(f => f.name);
            log("EOD contains:");
            names.forEach(n => log(" - " + n));

            /* 6. Double confirmation */
            if (!confirm(`EOD folder contains ${names.length} files.\nDelete originals?`)) {
                log("Cleanup cancelled.");
                return alert("Archive complete. Originals kept.");
            }
            if (!confirm("FINAL CONFIRMATION: Delete originals permanently?")) {
                log("Cleanup cancelled.");
                return alert("Archive complete. Originals kept.");
            }

            /* 7. Delete originals */
            log("Deleting originals...");
            for (const f of meta) {
                try {
                    const { sha } = await ghGet(f.path);
                    await ghDelete(f.path, sha);
                    log("Deleted: " + f.path);
                } catch (e) {
                    log("ERROR deleting " + f.path);
                }
            }

            log("EOD complete.");
            alert("End of Day complete.");

        } catch (err) {
            log("FATAL: " + err.message);
            alert("EOD failed: " + err.message);
        }
    }

    /* ------------------------------------------------------------
       6. Public API
       ------------------------------------------------------------ */
    return {
        open: () => {
            injectModal();
            document.getElementById("eodModal").style.display = "flex";
        },
        close: () => {
            const m = document.getElementById("eodModal");
            if (m) m.style.display = "none";
        },
        run
    };

})();
