#!/usr/bin/env node
/*
 * Kontrolli i menusë dhe i fotove — Sharri POS
 * Run with: npm test
 *
 * Verifies:
 *  1. the seeded SQLite menu (prices in EUR -> cents, categories, active flags)
 *  2. that seeding an EXISTING database (old names / wrong categories / duplicates)
 *     migrates correctly and never touches orders, order_items or payments
 *  3. that the frontend photo mapper (productPhoto) returns a real local file for
 *     every active product, never maps a drink to a cake, and uses one Peja photo
 *     for both Peja sizes
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..");
const IMAGES = path.join(ROOT, "public", "images");
let passes = 0, fails = 0;
const ok = (cond, msg, extra) => {
  if (cond) { passes++; console.log("  \u2713 " + msg); }
  else { fails++; console.log("  \u2717 " + msg + (extra ? "  \u2192 " + extra : "")); }
};
const section = t => console.log("\n" + t);

/* ---------------------------------------------------------------- helpers */
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
const runSeed = cwd => execFileSync(process.execPath, ["db.js"], { cwd, stdio: "pipe" }).toString();
const imageExists = src => !!src && fs.existsSync(path.join(ROOT, "public", src.replace(/^\//, "")));
/* a bundled photo must be a real raster file of a sane size; dimensions are
   checked only when ImageMagick is available (optional), so the test works on a
   plain Node setup too */
let identifyMissing = false;
const isPhoto = src => {
  const f = path.join(IMAGES, path.basename(src));
  if (!fs.existsSync(f) || !/^\.(jpe?g|png)$/i.test(path.extname(f))) return false;
  const head = fs.readFileSync(f).subarray(0, 4);
  const jpeg = head[0] === 0xff && head[1] === 0xd8;
  const png = head[0] === 0x89 && head[1] === 0x50;
  if (!(jpeg || png) || fs.statSync(f).size <= 5000) return false;
  if (!identifyMissing) {
    try {
      const [w, h] = execFileSync("identify", ["-format", "%wx%h", f], { stdio: "pipe" }).toString().split("x");
      if (Math.min(+w, +h) < 200) return false;
    } catch (e) { identifyMissing = true; }
  }
  return true;
};

/* -------------------------------------------------- expected menu (EUR) */
const EXPECTED = [
  // name,               category,            priceCents, kind
  ["Hamburger",           "Mish dhe Ushqim",   200, "USHQIM"],   // €2.00
  ["Hamburger + Pomfrit", "Mish dhe Ushqim",   250, "USHQIM"],   // €2.50
  ["Qebap (1 copë)",      "Mish dhe Ushqim",    50, "USHQIM"],   // €0.50 / piece
  ["Pica e madhe",        "Mish dhe Ushqim",   400, "USHQIM"],   // €4.00
  ["Pica familjare",      "Mish dhe Ushqim",   700, "USHQIM"],   // €7.00
  ["Pica e mesme",        "Mish dhe Ushqim",   300, "USHQIM"],   // €3.00
  ["Pica e vogel",        "Mish dhe Ushqim",   200, "USHQIM"],   // €2.00
  ["Ice Smirnof",         "Pije",              150, "PIJE"],
  ["Henikeni",            "Pije",              150, "PIJE"],
  ["Bavaria",             "Pije",              150, "PIJE"],
  ["Laqko",               "Pije",              150, "PIJE"],
  ["Laqin",               "Pije",               50, "PIJE"],
  ["Birra Peje E vogel",  "Pije",              100, "PIJE"],
  ["Birra Peje E madhe",  "Pije",              100, "PIJE"],
  ["Trileqe",             "Ëmbëlsira",         150, "EMBELSIRE"],
  ["Torte Snikers",       "Ëmbëlsira",         150, "EMBELSIRE"],
];
const BEERS = ["Ice Smirnof", "Henikeni", "Bavaria", "Laqko"];

/* ------------------------------------------- 1. seed a clean database */
section("1. Seed i bazës (npm run seed)");
runSeed(ROOT);
runSeed(ROOT); // idempotency: a second run must not duplicate anything
const db = new Database(path.join(ROOT, "data", "sharri.db"), { readonly: true });
const rows = db.prepare("SELECT p.name,p.price_cents,p.kind,p.active,c.name category_name,c.active cat_active FROM products p JOIN categories c ON c.id=p.category_id").all();
const norm = s => String(s).trim().toLowerCase();
const activeOf = n => rows.filter(r => norm(r.name) === norm(n) && r.active === 1);

for (const [name, category, price, kind] of EXPECTED) {
  const found = activeOf(name);
  ok(found.length === 1, `"${name}" ekziston një herë si produkt aktiv`, found.length + " rreshta");
  if (found.length === 1) {
    ok(found[0].price_cents === price, `"${name}" ka çmimin ${(price / 100).toFixed(2)}€`, (found[0].price_cents / 100).toFixed(2) + "€");
    ok(found[0].category_name === category, `"${name}" është në kategorinë "${category}"`, found[0].category_name);
    ok(found[0].kind === kind, `"${name}" ka kind=${kind}`, found[0].kind);
  }
}

section("2. Kategoritë dhe produktet e vjetra");
const cats = db.prepare("SELECT name,active FROM categories").all();
for (const n of ["Pije", "Mish dhe Ushqim", "Ëmbëlsira", "Menze"])
  ok(cats.some(c => c.name === n && c.active === 1), `kategoria "${n}" është aktive`);
ok(!rows.some(r => r.active === 1 && r.category_name === "Të tjera"), "asnjë produkt aktiv nuk mbetet në 'Të tjera'");
ok(!rows.some(r => r.active === 1 && (r.name === "Qebapa" || r.name === "Qebap")), "emrat e vjetër 'Qebapa'/'Qebap' nuk janë më aktivë");
for (const b of BEERS) ok(activeOf(b).every(r => r.category_name === "Pije"), `"${b}" është në 'Pije' (jo 'Të tjera'/'Ëmbëlsira')`);
const pejaV = activeOf("Birra Peje E vogel"), pejaM = activeOf("Birra Peje E madhe");
ok(pejaV.length === 1 && pejaM.length === 1, "Birra Peje e vogël dhe e madhe janë dy produkte të veçantë");
ok(pejaV.length === 1 && pejaM.length === 1 && pejaV[0].price_cents === pejaM[0].price_cents, "të dy Pejat kanë çmim të njëjtë (nuk ndryshoi)");
db.close();

/* ------------------------------------ 3. frontend photo mapper (productPhoto) */
section("3. Mapimi i fotove në app.js (productPhoto)");
const appJs = fs.readFileSync(path.join(ROOT, "public", "app.js"), "utf8");
const productPhoto = new Function("return " + extractFunction(appJs, "productPhoto"))();
const photoOf = (name, kind, category) => productPhoto({ name, kind, category_name: category });
const srcOf = (...a) => (photoOf(...a) || {}).src || "";

const db2 = new Database(path.join(ROOT, "data", "sharri.db"), { readonly: true });
const activeProducts = db2.prepare("SELECT p.*,c.name category_name FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=1").all();
db2.close();
ok(activeProducts.length >= EXPECTED.length, "menuja aktive ka të paktën " + EXPECTED.length + " produkte", activeProducts.length + " produkte");
for (const p of activeProducts)
  ok(!!srcOf(p.name, p.kind, p.category_name) && imageExists(srcOf(p.name, p.kind, p.category_name)),
     `"${p.name}" ka foto lokale (${srcOf(p.name, p.kind, p.category_name) || "ASNJË"})`);

section("4. Rregullat e fotove të pijeve");
ok(srcOf("Laqko", "PIJE", "Pije") === "/images/lasko.jpg", "Laqko → lasko.jpg (jo tortë)");
ok(srcOf("Laqko", "EMBELSIRE", "Ëmbëlsira") === "/images/lasko.jpg", "Laqko me kategori të vjetër 'Ëmbëlsira' nuk bie në foto torte");
ok(srcOf("Laqko", "PIJE", "Të tjera") === "/images/lasko.jpg", "Laqko me kategori të vjetër 'Të tjera' nuk bie në foto torte");
ok(srcOf("Ice Smirnof", "PIJE", "Pije") === "/images/smirnoff-ice.jpg", "Ice Smirnof → smirnoff-ice.jpg");
ok(srcOf("Henikeni", "PIJE", "Pije") === "/images/heineken.jpg", "Henikeni → heineken.jpg");
ok(srcOf("Bavaria", "PIJE", "Pije") === "/images/bavaria.jpg", "Bavaria → bavaria.jpg");
for (const b of BEERS) {
  ok(srcOf(b, "PIJE", "Të tjera") === srcOf(b, "PIJE", "Pije"), `"${b}" ka foto edhe kur kategoria e vjetër është e gabuar`);
  ok(!/trileqe|snickers|torte/i.test(srcOf(b, "PIJE", "Pije")), `"${b}" nuk përdor foto torte`);
}
ok(srcOf("Birra Peje E vogel", "PIJE", "Pije") === srcOf("Birra Peje E madhe", "PIJE", "Pije"), "të dy Pejat përdorin të njëjtën foto");
ok(srcOf("Birra Peje E vogel", "PIJE", "Pije") === "/images/birra-peja.jpg", "Peja → birra-peja.jpg");
ok(srcOf("Trileqe", "EMBELSIRE", "Ëmbëlsira") === "/images/trileqe.jpg", "Trileqe → trileqe.jpg");
ok(srcOf("Torte Snikers", "EMBELSIRE", "Ëmbëlsira") === "/images/snickers-cake.jpg", "Torte Snikers → snickers-cake.jpg");
ok(srcOf("Qebap (1 copë)", "USHQIM", "Mish dhe Ushqim") === "/images/qebap.jpg", "Qebap (1 copë) → qebap.jpg");
ok(srcOf("Hamburger", "USHQIM", "Mish dhe Ushqim") === "/images/burger-sandwich.jpg", "Hamburger → burger-sandwich.jpg");
ok(srcOf("Hamburger + Pomfrit", "USHQIM", "Mish dhe Ushqim") === "/images/burger-sandwich.jpg", "Hamburger + Pomfrit → burger-sandwich.jpg");
ok(["/images/lasko.jpg", "/images/birra-peja.jpg", "/images/bavaria.jpg", "/images/smirnoff-ice.jpg", "/images/heineken.jpg", "/images/qebap.jpg"].every(isPhoto), "fotot e pijeve/qebapit janë foto reale (jo placeholder)");
ok(!/(placehold\.|via\.placeholder|\.svg|picsum|unsplash\.it)/i.test(appJs), "frontend-i nuk përdor placeholder ose hotlink");

/* ---------------- 5. existing database: migrate without touching the orders */
section("5. Sinkronizimi i bazës ekzistuese (Pa fshirë porositë)");
const tmp = path.join(ROOT, ".tmp-menu-test");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
fs.copyFileSync(path.join(ROOT, "db.js"), path.join(tmp, "db.js"));
runSeed(tmp); // build a realistic existing DB
const tdb = new Database(path.join(tmp, "data", "sharri.db"));
// legacy state: old Qebap name, misplaced Laqko, duplicate Peja row, wrong price
const mish = tdb.prepare("SELECT id FROM categories WHERE name='Mish dhe Ushqim'").get().id;
const emb = tdb.prepare("SELECT id FROM categories WHERE name='Ëmbëlsira'").get().id;
const pije = tdb.prepare("SELECT id FROM categories WHERE name='Pije'").get().id;
tdb.prepare("UPDATE products SET name='Qebapa' WHERE name='Qebap (1 copë)'").run();
tdb.prepare("UPDATE products SET category_id=?,price_cents=999 WHERE name='Laqko'").run(emb);
tdb.prepare("INSERT INTO products(category_id,name,price_cents,kind,display_order) VALUES(?,?,?,?,?)").run(emb, "Birra Peje E vogel", 100, "PIJE", 99);
tdb.prepare("INSERT INTO products(category_id,name,price_cents,kind,display_order) VALUES(?,?,?,?,?)").run(pije, "Hamburger", 185, "USHQIM", 98);
// a real order + item + payment that must survive the reseed
const waiter = tdb.prepare("SELECT id FROM users LIMIT 1").get().id;
tdb.prepare("INSERT INTO orders(order_number,order_type,waiter_id,status,total_cents) VALUES(998,'PER_KETU',?,'PAID',150)").run(waiter);
const oid = tdb.prepare("SELECT id FROM orders WHERE order_number=998").get().id;
tdb.prepare("INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,quantity) VALUES(?,?,?,?,?)").run(oid, 1, "Laqko", 150, 1);
tdb.prepare("INSERT INTO payments(order_id,amount_cents,method,created_by) VALUES(?,?,?,?)").run(oid, 150, "CASH", waiter);
const before = {
  orders: tdb.prepare("SELECT COUNT(*) n FROM orders").get().n,
  items: tdb.prepare("SELECT COUNT(*) n FROM order_items").get().n,
  payments: tdb.prepare("SELECT COUNT(*) n FROM payments").get().n,
  snapshot: tdb.prepare("SELECT product_name_snapshot s FROM order_items WHERE order_id=?").get(oid).s,
};
tdb.close();

runSeed(tmp); // <- the documented sync step, run against an existing DB

const tdb2 = new Database(path.join(tmp, "data", "sharri.db"), { readonly: true });
const q = n => tdb2.prepare("SELECT p.name,p.price_cents,c.name category_name,p.active FROM products p JOIN categories c ON c.id=p.category_id WHERE p.name=?").all(n);
ok(q("Qebap (1 copë)").filter(r => r.active === 1 && r.price_cents === 50).length === 1, "Rreshti i vjetër 'Qebapa' u riemërtua në 'Qebap (1 copë)' me 0.50€");
ok(!q("Qebapa").some(r => r.active === 1), "emri i vjetër 'Qebapa' u çaktivizua");
const laqko = q("Laqko").filter(r => r.active === 1);
ok(laqko.length === 1 && laqko[0].category_name === "Pije", "Laqko u zhvendos nga 'Ëmbëlsira' në 'Pije' (një rresht aktiv)");
ok(laqko.length === 1 && laqko[0].price_cents === 150, "Laqko mori çmimin e menusë 1.50€", laqko.length === 1 ? (laqko[0].price_cents / 100).toFixed(2) + "€" : "-");
const pejeRows = q("Birra Peje E vogel");
ok(pejeRows.filter(r => r.active === 1).length === 1, "dublikati i Pejës u ngec në një rresht aktiv", pejeRows.filter(r => r.active === 1).length + " aktiv");
ok(pejeRows.filter(r => r.active === 1).every(r => r.category_name === "Pije"), "Peja e vogël mbeti në 'Pije'");
const burgers = q("Hamburger").filter(r => r.active === 1);
ok(burgers.length === 1 && burgers[0].price_cents === 200, "Hamburger u krijua me 2.00€ dhe nuk u dublo", JSON.stringify(burgers));
const after = {
  orders: tdb2.prepare("SELECT COUNT(*) n FROM orders").get().n,
  items: tdb2.prepare("SELECT COUNT(*) n FROM order_items").get().n,
  payments: tdb2.prepare("SELECT COUNT(*) n FROM payments").get().n,
  snapshot: tdb2.prepare("SELECT product_name_snapshot s FROM order_items WHERE order_id=?").get(oid).s,
};
ok(after.orders === before.orders, "porositë nuk u fshinë/prenë", `${before.orders} → ${after.orders}`);
ok(after.items === before.items, "rreshtat e porosisë nuk u fshinë", `${before.items} → ${after.items}`);
ok(after.payments === before.payments, "pagesat nuk u fshinë", `${before.payments} → ${after.payments}`);
ok(after.snapshot === "Laqko", "snapshot-i i emrit historik mbeti 'Laqko'", after.snapshot);
const cid = tdb2.prepare("SELECT id FROM categories WHERE name='Të tjera'").get();
ok(!tdb2.prepare("SELECT COUNT(*) n FROM products WHERE active=1 AND category_id=?").get(cid.id).n, "asnjë produkt aktiv në 'Të tjera' pas sinkronizimit");
tdb2.close();
fs.rmSync(tmp, { recursive: true, force: true });

/* ------------------------------------------------------------------ report */
console.log(`\n${fails === 0 ? "\u2713 TË GJITHA KONTROLLET KALUAN" : "\u2717 KONTROLLET DËSHTUAN"} — ${passes} kaluan, ${fails} dështuan`);
process.exit(fails === 0 ? 0 : 1);
