function loadProducts() {
    console.log("Loading product list...");
}

// === ADDED: Simple in-memory product catalog from CSV columns (placeholder) ===
// In a real system, this would be populated from the CSV.
// Here we keep a simple structure to drive the dropdowns.
const productCatalog = {
    water: [
        { name: "Culligan Water 18.9L", unitSize: "18.9L" },
        { name: "Culligan Water 11.3L", unitSize: "11.3L" }
    ],
    coffee: [
        { name: "Culligan Coffee Dark Roast", unitSize: "1kg" },
        { name: "Culligan Coffee Medium Roast", unitSize: "1kg" }
    ]
};
// === END ADDED: Simple product catalog ===
