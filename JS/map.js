let map;
let markers = [];

function initMap() {
    // Defaulting to Grande Prairie area
    map = L.map('map').setView([55.1707, -118.7947], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);
}

window.processCSV = function(csvText) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    const lines = csvText.split('\n').filter(l => l.trim());
    if (lines.length === 0) return;

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    lines.slice(1).forEach(line => {
        const vals = line.split(',');
        let data = {};
        headers.forEach((h, i) => data[h] = vals[i] ? vals[i].trim() : "");
        
        const lat = parseFloat(data.latitude || data.lat);
        const lng = parseFloat(data.longitude || data.lng || data.long);

        if (!isNaN(lat) && !isNaN(lng)) {
            const m = L.marker([lat, lng]).addTo(map).bindPopup(data.company || "Delivery Stop");
            markers.push(m);
        }
    });

    if (markers.length > 0) {
        map.fitBounds(L.featureGroup(markers).getBounds(), { padding: [50, 50] });
    }
};

document.addEventListener('DOMContentLoaded', initMap);
