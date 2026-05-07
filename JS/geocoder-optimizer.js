/****************************************************
 * geocoder-optimizer.js
 * ADDITIVE-ONLY MODULE
 * - Hybrid geocoder (civic + LLD)
 * - Nearest-neighbor circular route optimizer
 * - Map rendering with colored pins + polylines
 * - Stop status tracking (pending/complete/missed)
 * - Call-in integration hooks
 *
 * NO EXISTING CODE IS MODIFIED OR DELETED.
 ****************************************************/

/* ===========================
   CONFIG: WAREHOUSE LOCATION
   =========================== */

const GEO_WAREHOUSE = {
    name: "Warehouse",
    address: "9541 112 St Grande Prairie, AB T8V 5C1",
    lat: 55.170330,
    lon: -118.794510
};

/* ===========================
   GLOBAL STATE (ADDITIVE)
   =========================== */

const GEO_STATE = {
    stops: [],          // [{ id, name, address, type, lat, lon, isCallIn }]
    stopStatus: {},     // { id: "pending" | "completed" | "missed" }
    map: null,
    mapMarkers: {},     // { id: markerInstance }
    mapPolyline: null,
    nominatimQueue: [],
    nominatimBusy: false
};

/* ===========================
   UTILS
   =========================== */

function geoDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function geoIsLikelyLLD(address) {
    if (!address) return false;
    const s = address.toUpperCase();
    return /[0-9]+\s*-[0-9]+\s*-[0-9]+\s*W[0-9]+M/.test(s) ||
           /[0-9]+\s*-[0-9]+\s*-[0-9]+\s*W[0-9]+/.test(s) ||
           /[0-9]+\s*-[0-9]+\s*-[0-9]+/.test(s);
}

/* ===========================
   LLD PARSER + APPROX CONVERTER
   (VERY SIMPLE, APPROXIMATE)
   =========================== */

function parseLLD(address) {
    if (!address) return null;
    const s = address.toUpperCase().replace(/\s+/g, '');
    // Very rough patterns: LSD-SEC-TWP-RGE-WxM
    // Example: 4-32-72-6-W6
    const m = s.match(/(\d+)-(\d+)-(\d+)-(\d+)-W(\d+)/);
    if (!m) return null;
    return {
        lsd: parseInt(m[1], 10),
        section: parseInt(m[2], 10),
        township: parseInt(m[3], 10),
        range: parseInt(m[4], 10),
        meridian: parseInt(m[5], 10)
    };
}

// NOTE: This is a VERY rough approximation for ATS.
// It is good enough for relative routing, not for legal survey work.
function convertLLDToLatLon(lld) {
    if (!lld) return null;

    // Base reference for Grande Prairie region (approx)
    const baseLat = 55.0;
    const baseLon = -119.0;

    // Crude scaling factors per township/range/section/lsd
    const latPerTownship = 0.06;   // ~6.7km
    const lonPerRange = 0.10;      // ~7-8km
    const latPerSection = 0.01;
    const lonPerSection = 0.015;
    const latPerLSD = 0.002;
    const lonPerLSD = 0.003;

    const lat =
        baseLat +
        (lld.township - 70) * latPerTownship +
        (lld.section - 1) * latPerSection +
        (lld.lsd - 1) * latPerLSD;

    const lon =
        baseLon +
        (lld.range - 6) * lonPerRange +
        (lld.section - 1) * lonPerSection +
        (lld.lsd - 1) * lonPerLSD;

    return { lat, lon };
}

/* ===========================
   NOMINATIM CIVIC GEOCODER
   =========================== */

function enqueueNominatimQuery(address) {
    return new Promise((resolve) => {
        GEO_STATE.nominatimQueue.push({ address, resolve });
        processNominatimQueue();
    });
}

function processNominatimQueue() {
    if (GEO_STATE.nominatimBusy) return;
    if (!GEO_STATE.nominatimQueue.length) return;

    GEO_STATE.nominatimBusy = true;
    const item = GEO_STATE.nominatimQueue.shift();
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
        encodeURIComponent(item.address + ", Alberta, Canada");

    fetch(url, {
        headers: {
            "Accept-Language": "en",
            "User-Agent": "LogiFlow-Delivery-System-Geocoder"
        }
    })
        .then(r => r.json())
        .then(data => {
            if (Array.isArray(data) && data.length > 0) {
                const first = data[0];
                item.resolve({
                    ok: true,
                    lat: parseFloat(first.lat),
                    lon: parseFloat(first.lon),
                    type: "civic",
                    error: null
                });
            } else {
                item.resolve({
                    ok: false,
                    lat: null,
                    lon: null,
                    type: "civic",
                    error: "No result from Nominatim"
                });
            }
        })
        .catch(err => {
            item.resolve({
                ok: false,
                lat: null,
                lon: null,
                type: "civic",
                error: String(err)
            });
        })
        .finally(() => {
            GEO_STATE.nominatimBusy = false;
            setTimeout(processNominatimQueue, 1100); // ~1 req/sec
        });
}

/* ===========================
   HYBRID GEOCODER
   =========================== */

async function geocodeAddressHybrid(address) {
    if (!address || !address.trim()) {
        return {
            ok: false,
            lat: null,
            lon: null,
            type: "unknown",
            error: "Empty address"
        };
    }

    if (geoIsLikelyLLD(address)) {
        const parsed = parseLLD(address);
        if (!parsed) {
            return {
                ok: false,
                lat: null,
                lon: null,
                type: "lld",
                error: "Could not parse LLD"
            };
        }
        const coords = convertLLDToLatLon(parsed);
        if (!coords) {
            return {
                ok: false,
                lat: null,
                lon: null,
                type: "lld",
                error: "Could not convert LLD"
            };
        }
        return {
            ok: true,
            lat: coords.lat,
            lon: coords.lon,
            type: "lld",
            error: null
        };
    }

    // Civic address via Nominatim
    const civicResult = await enqueueNominatimQuery(address);
    return civicResult;
}

/* ===========================
   ROUTE OPTIMIZER
   NEAREST NEIGHBOR CIRCULAR
   =========================== */

function optimizeRouteNearestNeighborCircular(stops) {
    if (!Array.isArray(stops) || stops.length === 0) return [];

    const remaining = stops.slice();
    const route = [];

    // Start at warehouse
    let currentLat = GEO_WAREHOUSE.lat;
    let currentLon = GEO_WAREHOUSE.lon;

    while (remaining.length > 0) {
        let bestIndex = 0;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const s = remaining[i];
            const d = geoDistanceKm(currentLat, currentLon, s.lat, s.lon);
            if (d < bestDist) {
                bestDist = d;
                bestIndex = i;
            }
        }
        const next = remaining.splice(bestIndex, 1)[0];
        route.push(next);
        currentLat = next.lat;
        currentLon = next.lon;
    }

    // Circular: end at warehouse (for map polyline)
    return route;
}

/* ===========================
   MAP LAYER (LEAFLET-STYLE)
   =========================== */

/*
  This module assumes you will include Leaflet or a similar map library
  in your main HTML. Example:

  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

  And a container:

  <div id="routeMap" style="width:100%;height:400px;"></div>
*/

function initRouteMapIfNeeded() {
    if (GEO_STATE.map) return;
    const el = document.getElementById('routeMap');
    if (!el || typeof L === "undefined") return;

    GEO_STATE.map = L.map('routeMap').setView([GEO_WAREHOUSE.lat, GEO_WAREHOUSE.lon], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(GEO_STATE.map);
}

function getStatusColor(status) {
    if (status === "completed") return "green";
    if (status === "missed") return "red";
    return "blue"; // pending
}

function renderRouteOnMap() {
    initRouteMapIfNeeded();
    if (!GEO_STATE.map) return;

    // Clear old markers
    Object.values(GEO_STATE.mapMarkers).forEach(m => {
        if (GEO_STATE.map.hasLayer(m)) {
            GEO_STATE.map.removeLayer(m);
        }
    });
    GEO_STATE.mapMarkers = {};

    // Clear old polyline
    if (GEO_STATE.mapPolyline && GEO_STATE.map.hasLayer(GEO_STATE.mapPolyline)) {
        GEO_STATE.map.removeLayer(GEO_STATE.mapPolyline);
    }
    GEO_STATE.mapPolyline = null;

    const route = GEO_STATE.stops;
    if (!route.length) return;

    const latlngs = [];

    // Warehouse marker
    const whMarker = L.circleMarker([GEO_WAREHOUSE.lat, GEO_WAREHOUSE.lon], {
        radius: 6,
        color: "black",
        fillColor: "yellow",
        fillOpacity: 1
    }).addTo(GEO_STATE.map);
    whMarker.bindTooltip("Warehouse: " + GEO_WAREHOUSE.address);
    latlngs.push([GEO_WAREHOUSE.lat, GEO_WAREHOUSE.lon]);

    // Stops
    route.forEach((stop, idx) => {
        const status = GEO_STATE.stopStatus[stop.id] || "pending";
        const color = getStatusColor(status);
        const marker = L.circleMarker([stop.lat, stop.lon], {
            radius: 6,
            color,
            fillColor: color,
            fillOpacity: 1
        }).addTo(GEO_STATE.map);

        const label = (idx + 1) + ". " + (stop.name || "") + "<br>" +
            (stop.address || "") +
            (stop.isCallIn ? "<br><b>CALL-IN</b>" : "");

        marker.bindTooltip(label);
        GEO_STATE.mapMarkers[stop.id] = marker;
        latlngs.push([stop.lat, stop.lon]);
    });

    // Return to warehouse for circular visual
    latlngs.push([GEO_WAREHOUSE.lat, GEO_WAREHOUSE.lon]);

    GEO_STATE.mapPolyline = L.polyline(latlngs, {
        color: "blue",
        weight: 3
    }).addTo(GEO_STATE.map);

    GEO_STATE.map.fitBounds(GEO_STATE.mapPolyline.getBounds(), { padding: [20, 20] });
}

/* ===========================
   STOP STATUS MANAGEMENT
   =========================== */

function markStopStatus(id, status) {
    GEO_STATE.stopStatus[id] = status;
    const marker = GEO_STATE.mapMarkers[id];
    if (marker) {
        const color = getStatusColor(status);
        marker.setStyle({
            color,
            fillColor: color
        });
    }
    updateStopCardStatusIcon(id, status);
}

function markStopCompleted(id) {
    markStopStatus(id, "completed");
}

function markStopMissed(id) {
    markStopStatus(id, "missed");
}

function markStopPending(id) {
    markStopStatus(id, "pending");
}

/* ===========================
   STOP CARD ICONS (ADDITIVE)
   =========================== */

/*
  This assumes each stop card has an element with an attribute like:
  data-stop-id="someId"

  And we will append a small status span inside it.
*/

function updateStopCardStatusIcon(id, status) {
    const card = document.querySelector('[data-stop-id="' + id + '"]');
    if (!card) return;

    let badge = card.querySelector('.stop-status-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'stop-status-badge';
        badge.style.marginLeft = '8px';
        badge.style.fontWeight = 'bold';
        card.appendChild(badge);
    }

    if (status === "completed") {
        badge.textContent = "✓";
        badge.style.color = "green";
    } else if (status === "missed") {
        badge.textContent = "✗";
        badge.style.color = "red";
    } else {
        badge.textContent = "•";
        badge.style.color = "blue";
    }
}

/* ===========================
   PUBLIC API: BUILD + OPTIMIZE
   =========================== */

/*
  You can call this from your existing route loader once you have
  a list of stops.

  stopsInput: [
    {
      id: string,
      name: string,
      address: string,
      isCallIn: boolean
    },
    ...
  ]
*/

async function buildAndOptimizeRouteWithGeocoding(stopsInput) {
    GEO_STATE.stops = [];
    GEO_STATE.stopStatus = {};

    const geocoded = [];
    for (const s of stopsInput) {
        const result = await geocodeAddressHybrid(s.address);
        if (!result.ok) {
            // Flag address error on stop card
            flagStopAddressErrorOnCard(s.id, result.error || "Address error");
            continue;
        }
        geocoded.push({
            id: s.id,
            name: s.name,
            address: s.address,
            isCallIn: !!s.isCallIn,
            lat: result.lat,
            lon: result.lon
        });
        GEO_STATE.stopStatus[s.id] = "pending";
    }

    const optimized = optimizeRouteNearestNeighborCircular(geocoded);
    GEO_STATE.stops = optimized;
    renderRouteOnMap();
    refreshStopCardsOrderFromGeoState();
}

/* ===========================
   ADDRESS ERROR FLAGGING
   =========================== */

function flagStopAddressErrorOnCard(id, message) {
    const card = document.querySelector('[data-stop-id="' + id + '"]');
    if (!card) return;
    let badge = card.querySelector('.stop-address-error');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'stop-address-error';
        badge.style.marginLeft = '8px';
        badge.style.color = 'red';
        badge.style.fontWeight = 'bold';
        card.appendChild(badge);
    }
    badge.textContent = "ADDRESS ERROR";
    badge.title = message || "Address error";
}

/* ===========================
   STOP CARD ORDER SYNC
   =========================== */

/*
  This assumes your stop cards live in a container like:
  <div id="stopListContainer"> ... </div>
  and each card has data-stop-id="id".
*/

function refreshStopCardsOrderFromGeoState() {
    const container = document.getElementById('stopListContainer');
    if (!container) return;
    const frag = document.createDocumentFragment();

    GEO_STATE.stops.forEach(stop => {
        const card = document.querySelector('[data-stop-id="' + stop.id + '"]');
        if (card) {
            frag.appendChild(card);
        }
    });

    container.appendChild(frag);
}

/* ===========================
   CALL-IN INTEGRATION HOOK
   =========================== */

/*
  Call this AFTER a call-in is saved and injected into your route list.
  You pass in the full list of stops again (including the new call-in),
  and this function will re-geocode (if needed), re-optimize, and re-render.
*/

async function onCallInAddedRebuildRoute(stopsInput) {
    await buildAndOptimizeRouteWithGeocoding(stopsInput);
}

/* ===========================
   GLOBAL EXPORTS (ATTACH TO WINDOW)
   =========================== */

window.LogiGeo = {
    GEO_WAREHOUSE,
    GEO_STATE,
    geocodeAddressHybrid,
    optimizeRouteNearestNeighborCircular,
    buildAndOptimizeRouteWithGeocoding,
    onCallInAddedRebuildRoute,
    markStopCompleted,
    markStopMissed,
    markStopPending
};

/****************************************************
 * VALIDATION (HARD RULES)
 * - This file is entirely new.
 * - No existing code is modified or deleted.
 * - All functionality is additive.
 ****************************************************/
