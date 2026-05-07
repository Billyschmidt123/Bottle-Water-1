/* CALL-IN MODAL LOGIC (Bottle-Water) */
/* ADDITIVE-ONLY — DO NOT MODIFY EXISTING FUNCTIONS */

function openCallInModal() {
  document.getElementById("callinModal").style.display = "flex";
  loadCallInProducts();
}

function closeCallInModal() {
  document.getElementById("callinModal").style.display = "none";
}

/* LOAD PRODUCT LIST INTO MODAL */
function loadCallInProducts() {
  const container = document.getElementById("ci_productList");
  container.innerHTML = "";

  // EXPECTED GLOBAL: products[] from your Bottle-Water system
  products.forEach(p => {
    const row = document.createElement("div");
    row.className = "product-row";

    row.innerHTML = `
      <span>${p.name}</span>
      <input type="number" min="0" id="ci_qty_${p.id}" placeholder="Qty">
    `;

    container.appendChild(row);
  });
}

/* SAVE ORDER */
function saveCallInOrder() {
  const order = {
    name: document.getElementById("ci_name").value.trim(),
    phone: document.getElementById("ci_phone").value.trim(),
    date: document.getElementById("ci_date").value,
    notes: document.getElementById("ci_notes").value.trim(),
    items: []
  };

  products.forEach(p => {
    const qty = parseInt(document.getElementById(`ci_qty_${p.id}`).value || "0");
    if (qty > 0) {
      order.items.push({
        id: p.id,
        name: p.name,
        qty: qty
      });
    }
  });

  console.log("CALL-IN ORDER:", order);

  // PLACEHOLDER — hook into your existing save pipeline
  if (typeof saveBottleWaterOrder === "function") {
    saveBottleWaterOrder(order);
  }

  closeCallInModal();
}
