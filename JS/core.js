// core.js
// App bootstrap and shared state

window.appState = {
    stops: [],
    currentStopIndex: -1,
    routes: {}
};

function appInit() {
    console.log("App initialized");

    if (typeof initMap === "function") initMap();
    if (typeof uiInit === "function") uiInit();
    if (typeof managerInit === "function") managerInit();
    if (typeof navigationInit === "function") navigationInit();
}

document.addEventListener("DOMContentLoaded", appInit);
