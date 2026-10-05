#!/usr/bin/env node
/*
 * Rrjedha e kamarierit — Sharri POS
 * Run with: npm test   (pjesë e kontrollit automatik)
 *
 * Boots a real server on a temporary copy of the database (data/ of the temp
 * folder, never data/sharri.db), logs in as the waiter KAMARIERI, then checks:
 *   - "POROSI E RE": photos rendered for every product under "Pije" and
 *     "Mish dhe Ushqim" (the real productCard/productPhoto from public/app.js)
 *   - every rendered photo URL is actually served by the server (HTTP 200)
 *   - an ACTIVE order picker renders the same photos
 *   - Laqko is never a cake, the three drinks have working images, both Peja
 *     sizes share one image
 */
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const TMP = path.join(ROOT, ".tmp-flow-test");
const PORT = Number(process.env.FLOW_TEST_PORT || 3987);
const BASE = "http://127.0.0.1:" + PORT;
let passes = 0, fails = 0;
const ok = (cond, msg, extra) => {
  if (cond) { passes++; console.log("  \u2713 " + msg); }
  else { fails++; console.log("  \u2717 " + msg + (extra ? "  \u2192 " + extra : "")); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function extractFunction(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("frontend function not found: " + name);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

async function main() {
  /* temporary, isolated copy of the app + database */
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  for (const f of ["server.js", "db.js"]) fs.copyFileSync(path.join(ROOT, f), path.join(TMP, f));
  fs.symlinkSync(path.join(ROOT, "public"), path.join(TMP, "public"), "dir");
  execFileSync(process.execPath, ["db.js"], { cwd: TMP, stdio: "pipe" });

  const server = spawn(process.execPath, ["server.js"], {
    cwd: TMP, stdio: "pipe",
    env: Object.assign({}, process.env, { PORT: String(PORT), SESSION_SECRET: "test-secret" }),
  });
  let log = "";
  server.stdout.on("data", d => { log += d; });
  server.stderr.on("data", d => { log += d; });
  const stop = () => { try { server.kill("SIGKILL"); } catch (e) {} fs.rmSync(TMP, { recursive: true, force: true }); };

  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { up = (await fetch(BASE + "/api/health")).ok; } catch (e) { await sleep(250); }
    }
    if (!up) throw new Error("serveri nuk u ngrit:\n" + log);

    /* ---- login as the waiter */
    const login = await fetch(BASE + "/api/kycu", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "kamarieri", password: "kamarieri" }),
    });
    ok(login.ok, "kyçja si kamarier (kamarieri/kamarieri) funksionon", "HTTP " + login.status);
    const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
    const get = u => fetch(BASE + u, { headers: { Cookie: cookie } });
    const jget = async u => (await get(u)).json();

    /* ---- the menu exactly as the waiter receives it */
    const menu = await jget("/api/menu");
    const byName = n => menu.products.find(p => p.name.toLowerCase() === n.toLowerCase());
    const catId = name => menu.categories.find(c => c.name === name).id;
    ok(menu.categories.some(c => c.name === "Pije") && menu.categories.some(c => c.name === "Mish dhe Ushqim"),
      "'POROSI E RE' merr kategoritë Pije dhe Mish dhe Ushqim");
    ok(!menu.categories.some(c => c.name === "Të tjera"), "kategoria 'Të tjera' nuk shfaqet më në menu");
    const PRICES = [
      ["Hamburger", 200, "Mish dhe Ushqim"], ["Hamburger + Pomfrit", 250, "Mish dhe Ushqim"],
      ["Qebap (1 copë)", 50, "Mish dhe Ushqim"], ["Pica E madhe", 400, "Mish dhe Ushqim"],
      ["Pica Familjare", 700, "Mish dhe Ushqim"], ["Pica E mesme", 300, "Mish dhe Ushqim"],
      ["Pica E vogel", 200, "Mish dhe Ushqim"], ["Ice Smirnof", 150, "Pije"], ["Henikeni", 150, "Pije"],
      ["Bavaria", 150, "Pije"], ["Laqko", 150, "Pije"],
    ];
    for (const [n, cents, cat] of PRICES)
      ok(byName(n) && byName(n).price_cents === cents && byName(n).category_id === catId(cat),
        `menuja e kamarierit: "${n}" = ${(cents / 100).toFixed(2)}€ nën "${cat}"`,
        byName(n) ? (byName(n).price_cents / 100).toFixed(2) + "€" : "mungon");

    /* ---- render the real picker HTML for POROSI E RE (renderDraft) */
    const appJs = fs.readFileSync(path.join(ROOT, "public", "app.js"), "utf8");
    const productPhoto = new Function("return " + extractFunction(appJs, "productPhoto"))();
    const productCard = new Function("esc", "eur", "productPhoto", "return " + extractFunction(appJs, "productCard"))(
      x => String(x == null ? "" : x), c => (Number(c) / 100).toFixed(2) + "\u20ac", productPhoto);

    const pickers = { "POROSI E RE": menu.products.filter(p => p.category_id === catId("Pije") || p.category_id === catId("Mish dhe Ushqim")) };
    const html = pickers["POROSI E RE"].map(p => productCard(p, "addDraft(" + p.id + ")")).join("");
    ok((html.match(/<img class="product-photo/g) || []).length === pickers["POROSI E RE"].length,
      `çdo produkt në 'POROSI E RE' (Pije + Mish dhe Ushqim) ka foto në kartelë`,
      (html.match(/<img class="product-photo/g) || []).length + "/" + pickers["POROSI E RE"].length);
    ok(!/src=""/.test(html), "asnjë kartelë me src bosh");

    /* ---- every rendered photo must be served by the server */
    const srcs = [...new Set([...html.matchAll(/src="(\/images\/[^"]+)"/g)].map(m => m[1]))];
    let served = 0;
    for (const s of srcs) {
      const r = await get(s);
      if (r.ok && /image\//.test(r.headers.get("content-type") || "")) served++;
      else console.log("      pa foto: " + s + " (HTTP " + r.status + ")");
    }
    ok(served === srcs.length && srcs.length > 0, `të gjitha fotot e shfaqura shërbehen nga serveri (${srcs.length} foto)`);

    /* ---- the exact drink rules, through the rendered HTML */
    const srcOfProduct = n => {
      const p = byName(n);
      return (new RegExp('^<button class="product[^"]*"[^>]*><img[^>]*src="([^"]+)"', "m").exec(productCard(p, "x")) || [])[1] || "";
    };

    ok(srcOfProduct("Laqko") === "/images/lasko.jpg", "Laqko shfaq lasko.jpg (birrë), jo tortë");
    ok(srcOfProduct("Ice Smirnof") === "/images/smirnoff-ice.jpg", "Ice Smirnof shfaq smirnoff-ice.jpg");
    ok(srcOfProduct("Henikeni") === "/images/heineken.jpg", "Henikeni shfaq heineken.jpg");
    ok(srcOfProduct("Bavaria") === "/images/bavaria.jpg", "Bavaria shfaq bavaria.jpg");
    ok(srcOfProduct("Birra Peje E vogel") === srcOfProduct("Birra Peje E madhe"), "të dy Pejat shfaqin të njëjtën foto");
    ok(srcOfProduct("Birra Peje E vogel") === "/images/birra-peja.jpg", "Peja shfaq birra-peja.jpg");
    for (const d of ["Ice Smirnof", "Henikeni", "Bavaria", "Laqko"])
      ok(byName(d).category_id === catId("Pije"), `"${d}" shfaqet nën 'Pije', jo 'Të tjera'/'Ëmbëlsira'`);

    /* ---- ACTIVE order: the picker must show photos too */
    const beer = byName("Laqko"), qebap = byName("Qebap (1 copë)");
    const created = await fetch(BASE + "/api/porosi", {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ orderType: "TAVOLINE", tableNumber: 7, items: [{ productId: beer.id, quantity: 1 }, { productId: qebap.id, quantity: 2 }] }),
    });
    const createdBody = await created.json();
    ok(created.ok && createdBody.id, "porosia e re u krijua nga tavolina 7", JSON.stringify(createdBody).slice(0, 120));
    const order = await jget("/api/porosi/" + createdBody.id);
    const activeHtml = menu.products.filter(p => p.category_id === catId("Pije") || p.category_id === catId("Mish dhe Ushqim"))
      .map(p => productCard(p, "addOrder(" + order.id + "," + p.id + ")")).join("");
    ok((activeHtml.match(/<img class="product-photo/g) || []).length === pickers["POROSI E RE"].length,
      "porosia aktive shfaq fotot në zgjedhësin e produkteve (Pije + Mish dhe Ushqim)");
    ok(order.items.length === 2 && order.items.some(i => i.product_name_snapshot === "Qebap (1 copë)"),
      "porosia aktive ruan snapshot-in e saktë të emrit", order.items.map(i => i.product_name_snapshot).join(", "));
    ok(order.total_cents === 150 + 100, "totali llogaritet saktë (1.50€ + 2 × 0.50€)", (order.total_cents / 100).toFixed(2) + "\u20ac");
  } finally {
    stop();
  }
  console.log(`\n${fails === 0 ? "\u2713 Rrjedha e kamarierit kaloi" : "\u2717 Rrjedha e kamarierit dështoi"} — ${passes} kaluan, ${fails} dështuan`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error("Gabim:", e.message); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (x) {} process.exit(1); });
