// navigation.js
// Original code (UNTOUCHED)

function navigationInit() {
    console.log("Navigation system ready");
}

function setActiveRoute(routeId) {
    appState.activeRoute = routeId;
    console.log("Active route:", routeId);
}



// ======================================================
// ADD-ONLY: Navigation + Stop Marker System
// ======================================================

// Global reference to current route + stops
window.currentRoute = null;
window.activeStop = null;

// Load active route from localStorage when navigation starts
window.loadActiveRouteForNavigation = function () {
    const saved = localStorage.getItem("activeRoute");
    if (!saved) {
        console.warn("No active route found in storage.");
        return;
    }

    try {
        const route = JSON.parse(saved);
        console.log("Loaded active route:", route.name);
        window.currentRoute = route;

        // Convert customers → stops
        window.currentRoute.stops = route.customers.map((c, idx) => ({
            id: idx,
            name: c.Customer || c.Name || `Stop ${idx + 1}`,
            lat: parseFloat(c.Latitude || c.lat || c.Lat),
            lng: parseFloat(c.Longitude || c.lng || c.Lng),
            email: c.Email || "",
            deliveryFee: "",
            travel: "",
            specialInstructions: "",
            receivedBy: "",
            signature: null,
            completed: false,
            notDelivered: false,
            marker: null
        }));

        renderStopsOnMap(window.currentRoute.stops);
    } catch (e) {
        console.error("Failed to parse active route:", e);
    }
};

// Render stops as markers on the map
window.renderStopsOnMap = function (stops) {
    if (!window.map) {
        console.warn("Map not initialized yet.");
        return;
    }

    stops.forEach(stop => {
        if (!stop.lat || !stop.lng) return;

        const icon = L.icon({
            iconUrl: stop.completed ? "assets/markers/green.png" : "assets/markers/red.png",
            iconSize: [32, 32]
        });

        const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(map);
        stop.marker = marker;

        marker.on("click", () => {
            window.activeStop = stop;
            openStopModal(stop);
        });
    });
};

// Open stop modal (bridge to UI system)
window.openStopModal = function (stop) {
    fetch("MODULES/stop-modal.html")
        .then(r => r.text())
        .then(html => {
            // Replace placeholders
            html = html
                .replace("{{EMAIL}}", stop.email || "")
                .replace("{{DELIVERY_FEE}}", stop.deliveryFee || "")
                .replace("{{TRAVEL}}", stop.travel || "")
                .replace("{{SPECIAL_INSTRUCTIONS}}", stop.specialInstructions || "")
                .replace("{{RECEIVED_BY}}", stop.receivedBy || "")
                .replace("{{COMPANY}}", "Company")
                .replace("{{ADDRESS_HEADER}}", "Address")
                .replace("{{PHONE}}", "Phone");

            showModal(html);

            // Load into modal fields
            if (typeof window.loadStopIntoModal === "function") {
                setTimeout(() => window.loadStopIntoModal(stop), 50);
            }
        })
        .catch(err => console.error("Failed to load stop modal:", err));
};

// Update marker color when stop is completed or undone
window.updateStopMarker = function (stop) {
    if (!stop.marker) return;

    const icon = L.icon({
        iconUrl: stop.completed ? "assets/markers/green.png" : "assets/markers/red.png",
        iconSize: [32, 32]
    });

    stop.marker.setIcon(icon);
};

// Auto-load route when navigation initializes
(function () {
    console.log("Navigation extension loaded.");
    setTimeout(() => {
        try {
            loadActiveRouteForNavigation();
        } catch (e) {
            console.warn("Failed to auto-load active route:", e);
        }
    }, 300);
})();
