const scripts = [
    "JS/core.js?v=1",
    "JS/map.js?v=1",
    "JS/ui.js?v=1",
    "JS/navigation.js?v=1",
    "JS/manager.js?v=1",
    "JS/products.js?v=1",
    "JS/delivery.js?v=2",
    "JS/callin.js?v=1",
    "JS/split.js?v=1",
    "JS/storage.js?v=1",
    "JS/eod.js?v=1"
];

let index = 0;

function loadNext() {
    if (index >= scripts.length) {
        if (typeof appInit === "function") appInit();
        return;
    }

    const script = document.createElement("script");
    script.src = scripts[index];
    script.onload = () => { index++; loadNext(); };
    script.onerror = () => console.error("Failed:", scripts[index]);

    document.body.appendChild(script);
}

loadNext();
