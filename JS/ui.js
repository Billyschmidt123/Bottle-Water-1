// ui.js
// UI wiring, stop modal, sidebar, navigation, signature

function uiInit() {
    console.log("UI initialized");

    const mgrBtn = document.getElementById("openManagerBtn");
    if (mgrBtn) {
        mgrBtn.addEventListener("click", () => loadManagerPortal());
    }

    const btnPrev = document.getElementById("btnPrevStop");
    const btnNext = document.getElementById("btnNextStop");
    const btnStart = document.getElementById("btnStartRoute");
    const btnFinish = document.getElementById("btnFinishRoute");
    const btnDirections = document.getElementById("btnDirections");

    if (btnPrev) btnPrev.addEventListener("click", goToPreviousStop);
    if (btnNext) btnNext.addEventListener("click", goToNextStop);
    if (btnStart) btnStart.addEventListener("click", startRouteFlow);
    if (btnFinish) btnFinish.addEventListener("click", finishRouteFlow);
    if (btnDirections) btnDirections.addEventListener("click", openDirectionsForCurrentStop);

    if (typeof loadRouteFromCsv === "function") {
        loadRouteFromCsv();
    }
}

function showModal(html) {
    const container = document.getElementById("modalContainer");
    if (!container) return;
    container.innerHTML = html;
    container.style.display = "flex";
}

function closeModal() {
    const container = document.getElementById("modalContainer");
    if (!container) return;
    container.style.display = "none";
}

function updateCurrentStopInfo() {
    const el = document.getElementById("currentStopInfo");
    if (!el) return;

    const idx = appState.currentStopIndex;
    const stop = appState.stops[idx];

    if (!stop) {
        el.textContent = "No stop selected";
        return;
    }

    const parts = [];
    if (stop.company) parts.push(stop.company);
    if (stop.addressCombined) parts.push(stop.addressCombined);
    if (stop.phone) parts.push("Phone: " + stop.phone);

    el.textContent = parts.join(" | ");
}

function openStopModal(index) {
    const stop = appState.stops[index];
    if (!stop) return;

    fetch("MODULES/stop-modal.html")
        .then(r => r.text())
        .then(html => {
            const filled = html
                .replace(/{{COMPANY}}/g, stop.company || "")
                .replace(/{{ADDRESS_HEADER}}/g, stop.addressCombined || "")
                .replace(/{{PHONE}}/g, stop.phone || "")
                .replace(/{{EMAIL}}/g, stop.email || "")
                .replace(/{{DELIVERY_FEE}}/g, stop.deliveryFee || "")
                .replace(/{{TRAVEL}}/g, stop.travel || "")
                .replace(/{{SPECIAL_INSTRUCTIONS}}/g, stop.specialInstructions || "")
                .replace(/{{RECEIVED_BY}}/g, stop.receivedBy || "");

            showModal(filled);

            initSignaturePad();
            populateProductDropdowns(stop);
            attachStopModalHandlers(index);
        })
        .catch(err => console.error("Failed to load stop modal:", err));
}

// Route navigation + sidebar

function startRouteFlow() {
    if (!appState.stops || !appState.stops.length) {
        console.warn("No stops loaded.");
        return;
    }

    appState.currentStopIndex = 0;
    updateCurrentStopInfo();
    updateMapForCurrentStop();
    renderSidebarStops();
}

function finishRouteFlow() {
    appState.currentStopIndex = -1;
    updateCurrentStopInfo();
    clearSidebarStops();
    console.log("Route finished.");
}

function goToNextStop() {
    if (!appState.stops || !appState.stops.length) return;

    if (appState.currentStopIndex < appState.stops.length - 1) {
        appState.currentStopIndex++;
        updateCurrentStopInfo();
        updateMapForCurrentStop();
        highlightSidebarStop(appState.currentStopIndex);
    }
}

function goToPreviousStop() {
    if (!appState.stops || !appState.stops.length) return;

    if (appState.currentStopIndex > 0) {
        appState.currentStopIndex--;
        updateCurrentStopInfo();
        updateMapForCurrentStop();
        highlightSidebarStop(appState.currentStopIndex);
    }
}

function openDirectionsForCurrentStop() {
    const idx = appState.currentStopIndex;
    const stop = appState.stops[idx];
    if (!stop || !stop.lat || !stop.lng) return;

    const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`;
    window.open(url, "_blank");
}

function renderSidebarStops() {
    const container = document.getElementById("sidebarStops");
    if (!container) return;

    container.innerHTML = "";

    appState.stops.forEach((stop, index) => {
        const div = document.createElement("div");
        div.className = "sidebar-stop";
        div.textContent = stop.company || stop.address || ("Stop " + (index + 1));
        div.dataset.index = index;

        if (typeof isStopCompleted === "function" && isStopCompleted(stop)) {
            div.classList.add("completed-stop");
        }

        div.addEventListener("click", () => {
            appState.currentStopIndex = index;
            updateCurrentStopInfo();
            updateMapForCurrentStop();
            highlightSidebarStop(index);
            openStopModal(index);
        });

        container.appendChild(div);
    });

    highlightSidebarStop(appState.currentStopIndex);
}

function highlightSidebarStop(index) {
    const container = document.getElementById("sidebarStops");
    if (!container) return;

    const children = container.querySelectorAll(".sidebar-stop");
    children.forEach((el, i) => {
        if (i === index) {
            el.classList.add("active-stop");
        } else {
            el.classList.remove("active-stop");
        }
    });
}

function clearSidebarStops() {
    const container = document.getElementById("sidebarStops");
    if (container) container.innerHTML = "";
}

// Signature + stop completion

let signaturePad = null;
let signatureCanvasEl = null;
let signatureHintEl = null;

function initSignaturePad() {
    signatureCanvasEl = document.getElementById("signatureCanvas");
    signatureHintEl = document.getElementById("signatureHint");

    if (!signatureCanvasEl) {
        console.warn("No signature canvas found.");
        return;
    }

    const ctx = signatureCanvasEl.getContext("2d");
    let drawing = false;
    let hasDrawn = false;

    function getPos(evt) {
        const rect = signatureCanvasEl.getBoundingClientRect();
        const x = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
        const y = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;
        return { x, y };
    }

    function startDraw(evt) {
        drawing = true;
        hasDrawn = true;
        if (signatureHintEl) signatureHintEl.style.display = "none";
        const pos = getPos(evt);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        evt.preventDefault();
    }

    function moveDraw(evt) {
        if (!drawing) return;
        const pos = getPos(evt);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        evt.preventDefault();
    }

    function endDraw(evt) {
        drawing = false;
        evt && evt.preventDefault();
    }

    signatureCanvasEl.addEventListener("mousedown", startDraw);
    signatureCanvasEl.addEventListener("mousemove", moveDraw);
    signatureCanvasEl.addEventListener("mouseup", endDraw);
    signatureCanvasEl.addEventListener("mouseleave", endDraw);

    signatureCanvasEl.addEventListener("touchstart", startDraw, { passive: false });
    signatureCanvasEl.addEventListener("touchmove", moveDraw, { passive: false });
    signatureCanvasEl.addEventListener("touchend", endDraw, { passive: false });

    signaturePad = {
        hasDrawn: () => hasDrawn,
        toDataURL: () => signatureCanvasEl.toDataURL("image/png")
    };
}

function populateProductDropdowns(stop) {
    const waterSel = document.getElementById("waterProducts");
    const coffeeSel = document.getElementById("coffeeProducts");

    if (waterSel) {
        waterSel.innerHTML = "";
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Select water product";
        waterSel.appendChild(opt);
    }

    if (coffeeSel) {
        coffeeSel.innerHTML = "";
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Select coffee product";
        coffeeSel.appendChild(opt);
    }
}

function attachStopModalHandlers(index) {
    const stop = appState.stops[index];
    if (!stop) return;

    const btnSave = document.getElementById("btnSaveAndReceipt");
    const btnNotDelivered = document.getElementById("btnNotDelivered");

    if (btnSave && !btnSave._bound) {
        btnSave.addEventListener("click", () => {
            const emailEl = document.getElementById("stopEmail");
            const feeEl = document.getElementById("stopDeliveryFee");
            const travelEl = document.getElementById("stopTravel");
            const instrEl = document.getElementById("stopSpecialInstructions");
            const recvEl = document.getElementById("stopReceivedBy");
            const waterSel = document.getElementById("waterProducts");
            const coffeeSel = document.getElementById("coffeeProducts");

            stop.email = emailEl ? emailEl.value : stop.email;
            stop.deliveryFee = feeEl ? feeEl.value : stop.deliveryFee;
            stop.travel = travelEl ? travelEl.value : stop.travel;
            stop.specialInstructions = instrEl ? instrEl.value : stop.specialInstructions;
            stop.receivedBy = recvEl ? recvEl.value : stop.receivedBy;
            stop.waterProduct = waterSel ? waterSel.value : stop.waterProduct;
            stop.coffeeProduct = coffeeSel ? coffeeSel.value : stop.coffeeProduct;

            if (typeof saveStopEdit === "function") {
                saveStopEdit(stop, {
                    email: stop.email,
                    deliveryFee: stop.deliveryFee,
                    travel: stop.travel,
                    specialInstructions: stop.specialInstructions,
                    receivedBy: stop.receivedBy,
                    waterProduct: stop.waterProduct,
                    coffeeProduct: stop.coffeeProduct
                });
            }

            if (signaturePad && signaturePad.hasDrawn()) {
                const sigData = signaturePad.toDataURL();
                if (typeof saveSignatureForStop === "function") {
                    saveSignatureForStop(stop, sigData);
                }
            }

            if (typeof markStopCompleted === "function") {
                markStopCompleted(stop);
            }

            renderSidebarStops();
            renderStopsOnMap();

            closeModal();
        });
        btnSave._bound = true;
    }

    if (btnNotDelivered && !btnNotDelivered._bound) {
        btnNotDelivered.addEventListener("click", () => {
            console.log("Marked as not delivered:", stop.company || stop.address);
            closeModal();
        });
        btnNotDelivered._bound = true;
    }
}
