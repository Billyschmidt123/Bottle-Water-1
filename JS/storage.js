// storage.js
// Delivery edits + completion state

const DELIVERY_EDITS_KEY = "deliveryEdits_v1";

function loadDeliveryEdits() {
    try {
        const raw = localStorage.getItem(DELIVERY_EDITS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        console.warn("Failed to load delivery edits:", e);
        return {};
    }
}

function saveDeliveryEdits(edits) {
    try {
        localStorage.setItem(DELIVERY_EDITS_KEY, JSON.stringify(edits));
    } catch (e) {
        console.warn("Failed to save delivery edits:", e);
    }
}

function getStopKey(stop) {
    if (!stop) return null;
    if (stop.id) return String(stop.id);

    const parts = [];
    if (stop.company) parts.push(stop.company);
    if (stop.addressCombined) parts.push(stop.addressCombined);
    if (stop.address) parts.push(stop.address);
    return parts.join("|") || null;
}

function saveStopEdit(stop, data) {
    const key = getStopKey(stop);
    if (!key) return;

    const edits = loadDeliveryEdits();
    if (!edits[key]) edits[key] = {};
    Object.assign(edits[key], data);
    saveDeliveryEdits(edits);
}

function saveSignatureForStop(stop, base64Signature) {
    const key = getStopKey(stop);
    if (!key) return;

    const edits = loadDeliveryEdits();
    if (!edits[key]) edits[key] = {};
    edits[key].signature = base64Signature;
    saveDeliveryEdits(edits);
}

function markStopCompleted(stop) {
    const key = getStopKey(stop);
    if (!key) return;

    const edits = loadDeliveryEdits();
    if (!edits[key]) edits[key] = {};
    edits[key].completed = true;
    edits[key].completedAt = new Date().toISOString();
    saveDeliveryEdits(edits);
}

function isStopCompleted(stop) {
    const key = getStopKey(stop);
    if (!key) return false;

    const edits = loadDeliveryEdits();
    return !!(edits[key] && edits[key].completed);
}

function getStopEdits(stop) {
    const key = getStopKey(stop);
    if (!key) return null;

    const edits = loadDeliveryEdits();
    return edits[key] || null;
}
