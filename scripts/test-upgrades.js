#!/usr/bin/env node
/* End-to-end checks for the kitchen, thermal receipts, reports, menu editor,
 * table map, inventory controls and customer QR menu. Runs against an isolated
 * temporary database; never writes to data/sharri.db. */
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-upgrade-test");
const PORT = Number(process.env.UPGRADE_TEST_PORT || 3988);
const BASE = "http://127.0.0.1:" + PORT;
let passes = 0, fails = 0, server;
const ok = (condition, message, extra) => {
  if (condition) { passes++; console.log("  ✓ " + message); }
  else { fails++; console.log("  ✗ " + message + (extra ? " → " + extra : "")); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const json = async response => response.json();

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  for (const file of ["server.js", "db.js"]) fs.copyFileSync(path.join(ROOT, file), path.join(TMP, file));
  fs.symlinkSync(path.join(ROOT, "public"), path.join(TMP, "public"), "dir");
  execFileSync(process.execPath, ["db.js"], { cwd: TMP, stdio: "pipe" });
  server = spawn(process.execPath, ["server.js"], {
    cwd: TMP,
    stdio: "pipe",
    env: Object.assign({}, process.env, { PORT: String(PORT), SESSION_SECRET: "upgrade-test-secret" }),
  });
  let logs = "";
  server.stdout.on("data", data => { logs += data; });
  server.stderr.on("data", data => { logs += data; });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await fetch(BASE + "/api/health")).ok; }
    catch (_) { await sleep(250); }
  }
  if (!up) throw new Error("Test server did not start:\n" + logs);

  const publicPage = await fetch(BASE + "/menu");
  const publicHtml = await publicPage.text();
  ok(publicPage.ok && publicHtml.includes("public-menu-sections"), "QR customer page is available without sign-in", "HTTP " + publicPage.status + ": " + publicHtml.slice(0, 80));
  const publicMenuResponse = await fetch(BASE + "/api/public-menu");
  const publicMenu = await json(publicMenuResponse);
  ok(publicMenuResponse.ok && publicMenu.products.some(p => p.name === "Multisola") &&
    publicMenu.products.some(p => p.name === "Ice Tea"), "public menu returns active products and their photos");

  async function login(username, password) {
    const response = await fetch(BASE + "/api/kycu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return { response, cookie: (response.headers.get("set-cookie") || "").split(";")[0] };
  }
  const waiterLogin = await login("kamarieri", "kamarieri");
  const adminLogin = await login("admin", "admin");
  const waiterCookie = waiterLogin.cookie;
  const adminCookie = adminLogin.cookie;
  const request = (route, cookie, options = {}) => fetch(BASE + route, Object.assign({}, options, {
    headers: Object.assign({ "Content-Type": "application/json", Cookie: cookie }, options.headers || {}),
  }));
  const waiterMenu = await json(await request("/api/menu", waiterCookie));
  const adminMenuResponse = await request("/api/admin/menu", adminCookie);
  const adminMenu = await json(adminMenuResponse);
  ok(waiterLogin.response.ok && adminLogin.response.ok, "waiter and admin sessions are created");
  ok(adminMenuResponse.ok && adminMenu.products.length > 0, "admin can open the menu editor data");

  const menuProduct = adminMenu.products.find(p => p.name === "Torte Snikers");
  const publicOriginal = publicMenu.products.find(p => p.name === "Torte Snikers");
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Em0AAAAASUVORK5CYII=";
  const uploadResponse = await request("/api/admin/menu-image", adminCookie, {
    method: "POST", body: JSON.stringify({ dataUrl: png }),
  });
  const upload = await json(uploadResponse);
  const savedImage = uploadResponse.ok && menuProduct
    ? await request("/api/admin/menu/" + menuProduct.id, adminCookie, {
      method: "PATCH", body: JSON.stringify({
        name: menuProduct.name, category_id: menuProduct.category_id,
        price_cents: menuProduct.price_cents, active: true,
        display_order: menuProduct.display_order, image_path: upload.path,
      }),
    }) : null;
  const editedMenu = await json(await request("/api/admin/menu", adminCookie));
  ok(uploadResponse.status === 201 && savedImage && savedImage.ok &&
    editedMenu.products.find(p => p.id === menuProduct.id).image_path === upload.path,
    "admin can upload a validated menu photo and attach it to a product");
  const uploadedImageResponse = await fetch(BASE + upload.path);
  ok(uploadedImageResponse.ok, "uploaded menu photo is served by the web app");
  await request("/api/admin/menu/" + menuProduct.id, adminCookie, {
    method: "PATCH", body: JSON.stringify({
      name: menuProduct.name, category_id: menuProduct.category_id,
      price_cents: menuProduct.price_cents, active: true,
      display_order: menuProduct.display_order, image_path: null,
    }),
  });
  const unavailableResponse = await request("/api/admin/menu/" + menuProduct.id, adminCookie, {
    method: "PATCH", body: JSON.stringify({
      name: menuProduct.name, category_id: menuProduct.category_id,
      price_cents: menuProduct.price_cents + 1, active: false,
      display_order: menuProduct.display_order, image_path: null,
    }),
  });
  const afterAvailability = await json(await fetch(BASE + "/api/public-menu"));
  ok(unavailableResponse.ok && !afterAvailability.products.some(p => p.id === menuProduct.id),
    "admin can change price and make a product unavailable on the public menu");
  await request("/api/admin/menu/" + menuProduct.id, adminCookie, {
    method: "PATCH", body: JSON.stringify({
      name: menuProduct.name, category_id: menuProduct.category_id,
      price_cents: menuProduct.price_cents, active: true,
      display_order: menuProduct.display_order, image_path: null,
    }),
  });

  // Category creation test
  const catCreateRes = await request("/api/admin/categories", adminCookie, {
    method: "POST", body: JSON.stringify({ name: "Sallata Speciale", display_order: 7 }),
  });
  const catCreated = await json(catCreateRes);
  ok(catCreateRes.status === 201 && catCreated.id, "admin can create a new category");

  // Preset restaurant images catalog test
  const presetsRes = await request("/api/admin/preset-images", adminCookie);
  const presets = await json(presetsRes);
  ok(presetsRes.ok && Array.isArray(presets) && presets.length > 20 && presets.some(x => x.path === "/images/burger-sandwich.jpg"),
    "admin can browse built-in preset restaurant photos");

  // Product creation with name, price, category, kind, photo, and initial stock
  const createProdRes = await request("/api/admin/menu", adminCookie, {
    method: "POST", body: JSON.stringify({
      name: "Sallatë Cezar me Pulë",
      category_id: catCreated.id,
      price: "3.50",
      kind: "USHQIM",
      image_path: upload.path,
      display_order: 1,
      active: true,
      initial_stock: { track: true, quantity: 25, unit: "porcion", low_stock_threshold: 4 }
    }),
  });
  const createdProd = await json(createProdRes);
  ok(createProdRes.status === 201 && createdProd.id && createdProd.product.name === "Sallatë Cezar me Pulë" &&
     createdProd.product.price_cents === 350 && createdProd.product.image_path === upload.path &&
     createdProd.product.stock_quantity === 25,
     "admin can create a new product with name, price, category, photo and initial stock");

  // Duplicate name check
  const dupRes = await request("/api/admin/menu", adminCookie, {
    method: "POST", body: JSON.stringify({
      name: "Sallatë Cezar me Pulë", category_id: catCreated.id, price_cents: 350
    })
  });
  ok(dupRes.status === 409, "product creation rejects duplicate active product names");

  // Product is available on waiter menu and public menu
  const waiterMenuAfter = await json(await request("/api/menu", waiterCookie));
  const publicMenuAfter = await json(await fetch(BASE + "/api/public-menu"));
  ok(waiterMenuAfter.products.some(p => p.id === createdProd.id && p.name === "Sallatë Cezar me Pulë"),
    "newly created product appears on the waiter menu");
  ok(publicMenuAfter.products.some(p => p.id === createdProd.id && p.name === "Sallatë Cezar me Pulë"),
    "newly created product appears on the public customer QR menu");

  // Waiter orders the newly created product
  const newProdOrderRes = await request("/api/porosi", waiterCookie, {
    method: "POST", body: JSON.stringify({
      orderType: "TAVOLINE", tableNumber: 46,
      items: [{ productId: createdProd.id, quantity: 2 }]
    })
  });
  const newProdOrder = await json(newProdOrderRes);
  ok(newProdOrderRes.ok && newProdOrder.id, "waiter can order the newly created product");

  // Attempt to delete product while active in an order -> must fail with 409
  const deleteActiveRes = await request("/api/admin/menu/" + createdProd.id, adminCookie, {
    method: "DELETE"
  });
  ok(deleteActiveRes.status === 409, "deleting product in an active order is safely blocked");

  // Pay the order
  await request("/api/porosi/" + newProdOrder.id + "/pagesa", waiterCookie, {
    method: "POST", body: JSON.stringify({ method: "CARD" })
  });

  // Now delete the product -> must succeed
  const deleteSuccessRes = await request("/api/admin/menu/" + createdProd.id, adminCookie, {
    method: "DELETE"
  });
  ok(deleteSuccessRes.ok, "admin can delete the product once orders are no longer active");

  // Verify removed from menu
  const menuAfterDel = await json(await request("/api/menu", waiterCookie));
  ok(!menuAfterDel.products.some(p => p.id === createdProd.id), "deleted product is removed from active menu");

  // Verify historical order still preserves the product snapshot
  const historicalOrder = await json(await request("/api/historiku/" + newProdOrder.id, adminCookie));
  ok(historicalOrder.items.some(i => i.product_name_snapshot === "Sallatë Cezar me Pulë" && i.unit_price_cents === 350),
    "historical order preserves item name and price snapshot after product is deleted");

  const qrResponse = await request("/api/admin/menu-qr.svg", adminCookie);
  const qrSvg = await qrResponse.text();
  const forbiddenQr = await request("/api/admin/menu-qr.svg", waiterCookie);
  ok(qrResponse.ok && /<svg/i.test(qrSvg) && qrSvg.includes("http"), "admin QR endpoint generates a scannable SVG menu link");
  ok(forbiddenQr.status === 403, "QR code generation is restricted to administrators");

  const tables = await json(await request("/api/tavolinat", waiterCookie));
  ok(tables.total === 50 && tables.tables.length === 50 && tables.tables[0].number === 1 &&
    tables.tables[49].number === 50, "table service exposes every table from 1 through 50");

  const multisola = waiterMenu.products.find(p => p.name === "Multisola");
  const stockStart = await request("/api/admin/inventory/" + multisola.id, adminCookie, {
    method: "PUT", body: JSON.stringify({ quantity: 5, unit: "copë", low_stock_threshold: 2 }),
  });
  const stockOrderResponse = await request("/api/porosi", waiterCookie, {
    method: "POST", body: JSON.stringify({ orderType: "TAVOLINE", tableNumber: 47,
      items: [{ productId: multisola.id, quantity: 3 }] }),
  });
  const stockOrder = await json(stockOrderResponse);
  const stockAfterSale = await json(await request("/api/admin/inventory", adminCookie));
  const trackedAfterSale = stockAfterSale.find(p => p.id === multisola.id);
  const addUnitOnce = await request("/api/porosi/" + stockOrder.id + "/shto", waiterCookie, {
    method: "POST", body: JSON.stringify({ productId: multisola.id }),
  });
  const addUnitTwice = await request("/api/porosi/" + stockOrder.id + "/shto", waiterCookie, {
    method: "POST", body: JSON.stringify({ productId: multisola.id }),
  });
  const oversell = await request("/api/porosi/" + stockOrder.id + "/shto", waiterCookie, {
    method: "POST", body: JSON.stringify({ productId: multisola.id }),
  });
  ok(stockStart.ok && stockOrderResponse.ok && trackedAfterSale.stock_quantity === 2 &&
    trackedAfterSale.stock_tracked === 1, "tracked stock is automatically deducted from new orders");
  ok(oversell.status === 409, "stock enforcement prevents selling more than the available quantity");
  const publicStockView = await json(await fetch(BASE + "/api/public-menu"));
  ok(publicStockView.products.find(p => p.id === multisola.id).available === 0,
    "QR menu marks a tracked product as unavailable when stock reaches zero");
  const cancelledStockOrder = await request("/api/porosi/" + stockOrder.id + "/anulo", adminCookie, {
    method: "POST", body: JSON.stringify({ reason: "test restock" }),
  });
  const stockAfterCancel = await json(await request("/api/admin/inventory", adminCookie));
  ok(cancelledStockOrder.ok && stockAfterCancel.find(p => p.id === multisola.id).stock_quantity === 5,
    "cancelling an order returns its tracked products to stock");
  await request("/api/admin/inventory/" + multisola.id, adminCookie, { method: "DELETE" });

  const hamburger = waiterMenu.products.find(p => p.name === "Hamburger");
  const kitchenOrderResponse = await request("/api/porosi", waiterCookie, {
    method: "POST", body: JSON.stringify({ orderType: "TAVOLINE", tableNumber: 48,
      items: [{ productId: hamburger.id, quantity: 2, notes: "Pa qepë" }] }),
  });
  const kitchenOrder = await json(kitchenOrderResponse);
  const kitchenTickets = await json(await request("/api/kitchen", waiterCookie));
  const kitchenTicket = kitchenTickets.find(o => o.id === kitchenOrder.id);
  const preparingResponse = await request("/api/kitchen/" + kitchenOrder.id, waiterCookie, {
    method: "PATCH", body: JSON.stringify({ status: "PREPARING" }),
  });
  const readyResponse = await request("/api/kitchen/" + kitchenOrder.id, waiterCookie, {
    method: "PATCH", body: JSON.stringify({ status: "READY" }),
  });
  ok(kitchenOrderResponse.ok && kitchenTicket && kitchenTicket.kitchen_status === "NEW" &&
    kitchenTicket.items[0].quantity === 2 && kitchenTicket.items[0].notes === "Pa qepë",
    "food order appears as a kitchen ticket with quantities and notes");
  ok(preparingResponse.ok && readyResponse.ok, "kitchen tickets move through preparation to ready status");

  const coffee = waiterMenu.products.find(p => p.name === "Kafe");
  const reportOrderResponse = await request("/api/porosi", waiterCookie, {
    method: "POST", body: JSON.stringify({ orderType: "TAVOLINE", tableNumber: 49,
      items: [{ productId: coffee.id, quantity: 2 }] }),
  });
  const reportOrder = await json(reportOrderResponse);
  const paymentResponse = await request("/api/porosi/" + reportOrder.id + "/pagesa", waiterCookie, {
    method: "POST", body: JSON.stringify({ method: "CASH" }),
  });
  const today = new Date().toISOString().slice(0, 10);
  const reportResponse = await request("/api/admin/reports?from=" + today + "&to=" + today, adminCookie);
  const report = await json(reportResponse);
  const csvResponse = await request("/api/admin/reports.csv?from=" + today + "&to=" + today, adminCookie);
  const csv = await csvResponse.text();
  ok(paymentResponse.ok && reportResponse.ok && report.summary.paid_orders >= 1 &&
    report.payments.some(p => p.method === "CASH") && report.products.some(p => p.name === "Kafe"),
    "sales report returns paid revenue, payment methods and top products");
  ok(csvResponse.ok && /text\/csv/i.test(csvResponse.headers.get("content-type")) &&
    csv.includes("Mënyra e pagesës") && csv.includes("Totali (EUR)") && csv.includes("CASH"),
    "reports can be downloaded as CSV");

  const appJs = fs.readFileSync(path.join(ROOT, "public", "app.js"), "utf8");
  ok(appJs.includes("function kitchen()") && appJs.includes("function tableLayout()") &&
    appJs.includes("function printReceipt(id,width)") && appJs.includes("58 mm") && appJs.includes("80 mm"),
    "staff interface includes the kitchen, 50-table map and both thermal receipt sizes");
  ok(appJs.includes("function adminMenuTab(el)") && appJs.includes("function adminStockTab(el)") &&
    appJs.includes("function adminReportsTab(el)") && appJs.includes("function adminQrTab(el)"),
    "admin interface includes menu, inventory, reports and QR controls");
  ok(appJs.includes("openCreateProductModal") && appJs.includes("askDeleteMenuProduct"),
    "admin interface includes product creation and deletion dialogs");
  const qrPageJs = fs.readFileSync(path.join(ROOT, "public", "qr-menu.js"), "utf8");
  ok(qrPageJs.includes("/api/public-menu") && fs.existsSync(path.join(ROOT, "public", "menu.html")),
    "mobile public menu page is wired to the public menu API");

  console.log("\n" + (fails ? "✗ Upgrade checks failed" : "✓ Upgrade checks passed") +
    " — " + passes + " passed, " + fails + " failed");
}

main().catch(error => { console.error(error.stack || error); fails++; }).finally(() => {
  if (server) { try { server.kill("SIGKILL"); } catch (_) {} }
  fs.rmSync(TMP, { recursive: true, force: true });
  if (fails) process.exitCode = 1;
});
