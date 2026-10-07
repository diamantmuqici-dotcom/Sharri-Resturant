const express=require("express");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const Database=require("better-sqlite3");
const path=require("path");
const fs=require("fs");
const crypto=require("crypto");
const QRCode=require("qrcode");
require("dotenv").config();
if(!fs.existsSync(path.join(__dirname,"data","sharri.db")))require("./db");
const DATA_DIR=path.join(__dirname,"data");
const MENU_IMAGE_DIR=path.join(DATA_DIR,"menu-images");
fs.mkdirSync(MENU_IMAGE_DIR,{recursive:true});
const db=new Database(path.join(DATA_DIR,"sharri.db"));
db.pragma("journal_mode=WAL");db.pragma("foreign_keys=ON");
function ensureColumn(table,column,definition){
 const columns=db.prepare("PRAGMA table_info("+table+")").all();
 if(!columns.some(x=>x.name===column))db.exec("ALTER TABLE "+table+" ADD COLUMN "+column+" "+definition);
}
ensureColumn("products","image_path","TEXT");
ensureColumn("orders","kitchen_status","TEXT");
ensureColumn("orders","kitchen_updated_at","TEXT");
db.exec("CREATE TABLE IF NOT EXISTS inventory(product_id INTEGER PRIMARY KEY,quantity REAL NOT NULL CHECK(quantity>=0),unit TEXT NOT NULL DEFAULT 'copë',low_stock_threshold REAL NOT NULL DEFAULT 5,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS inventory_movements(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,order_id INTEGER,actor_id INTEGER,quantity_delta REAL NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,FOREIGN KEY(actor_id) REFERENCES users(id));CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id,created_at);CREATE INDEX IF NOT EXISTS idx_orders_kitchen ON orders(status,kitchen_status,opened_at);");
if(!db.prepare("PRAGMA table_info(orders)").all().some(x=>x.name==="unpaid_at"))db.exec("ALTER TABLE orders ADD COLUMN unpaid_at TEXT");
db.exec("CREATE TABLE IF NOT EXISTS cancellation_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,requested_by INTEGER NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),reviewed_by INTEGER,reviewed_at TEXT,decision_note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(requested_by) REFERENCES users(id),FOREIGN KEY(reviewed_by) REFERENCES users(id));CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON cancellation_requests(status,created_at);CREATE UNIQUE INDEX IF NOT EXISTS idx_cancellation_requests_pending_order ON cancellation_requests(order_id) WHERE status='PENDING'");
const app=express();
app.set("trust proxy",1);
app.use(express.json({limit:"5mb"}));
app.use(session({secret:process.env.SESSION_SECRET||"ndrysho-kete-sekret",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:43200000}}));
app.use(express.static(path.join(__dirname,"public")));
app.get("/menu",(q,r)=>r.redirect(302,"/menu.html"));
app.use("/menu-images",express.static(MENU_IMAGE_DIR,{fallthrough:true,index:false,maxAge:"1d"}));
const eur=c=>(Number(c)/100).toFixed(2)+"€";
const auth=(req,res,next)=>req.session.user?next():res.status(401).json({error:"Duhet të kyçeni."});
const admin=(req,res,next)=>req.session.user&&req.session.user.role==="ADMIN"?next():res.status(403).json({error:"Nuk keni leje."});
function audit(a,x,t,id,d){db.prepare("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)").run(a,x,t,id,d?JSON.stringify(d):null)}
function now(){return new Date().toISOString()}
function event(o,x,d,a,createdAt=now()){db.prepare("INSERT INTO order_events(order_id,event_type,details,actor_id,created_at) VALUES(?,?,?,?,?)").run(o,x,d?JSON.stringify(d):null,a,createdAt)}
function total(id){return db.prepare("SELECT COALESCE(SUM(quantity*unit_price_cents),0) n FROM order_items WHERE order_id=?").get(id).n}
function items(id){return db.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY id").all(id)}
function order(id){return db.prepare("SELECT o.*,t.number table_number,u.name waiter_name FROM orders o LEFT JOIN tables_restaurant t ON t.id=o.table_id JOIN users u ON u.id=o.waiter_id WHERE o.id=?").get(id)}
function food(k){return k==="USHQIM"||k==="EMBELSIRE"}
function noteText(v){const s=String(v==null?"":v).replace(/\s+/g," ").trim();return s?s.slice(0,200):null}
function pendingCancellation(id){return db.prepare("SELECT * FROM cancellation_requests WHERE order_id=? AND status=\'PENDING\' ORDER BY id DESC LIMIT 1").get(id)||null}
function latestCancellationRequest(id){return db.prepare("SELECT r.*,requested.name requested_by_name,reviewer.name reviewed_by_name FROM cancellation_requests r LEFT JOIN users requested ON requested.id=r.requested_by LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by WHERE r.order_id=? ORDER BY r.id DESC LIMIT 1").get(id)||null}
function productImage(p){
 if(p.image_path)return p.image_path;
 const n=String(p.name||"").toLowerCase();
 if(n.includes("sniker")||n.includes("snicker"))return "/images/snickers-cake.jpg";
 if(n.includes("peje")||n.includes("peja"))return "/images/birra-peja.jpg";
 if(n.includes("multisola")||n.includes("multi sola"))return "/images/multisola.jpg";
 if(n.includes("ice tea"))return "/images/ice-tea.png";
 if(n.includes("laqin")||n.includes("lacin")||n.includes("laçin"))return "/images/laqin.png";
 if(n.includes("mokne"))return "/images/uje-mokne.png";
 if(n.includes("laqko")||n.includes("lasko")||n.includes("laško"))return "/images/lasko.jpg";
 if(n.includes("bavaria"))return "/images/bavaria.jpg";
 if(n.includes("smirnof")||n.includes("smirnoff"))return "/images/smirnoff-ice.jpg";
 if(n.includes("heniken")||n.includes("heineken"))return "/images/heineken.jpg";
 if(n.includes("jager")||n.includes("jäger"))return "/images/jagermeister.png";
 if(n.includes("fanta"))return "/images/fanta.jpg";
 if(n.includes("schweeps")||n.includes("schweppes"))return "/images/schwepps.png";
 if(n.includes("redbull")||n.includes("red bull"))return "/images/red-bull.jpg";
 if(n.includes("golden eagle"))return "/images/golden-eagle.jpg";
 if(n.includes("kokakolla")||n.includes("coca"))return "/images/coca-cola.jpg";
 if(n.includes("kafe")||n.includes("coffee"))return "/images/coffee.jpg";
 if(n.includes("qaj")||n.includes("çaj"))return "/images/tea.jpg";
 if(n.includes("qebap"))return "/images/qebap.jpg";
 if(n.includes("suxhuk"))return "/images/suxhuk.jpg";
 if(n.includes("qep"))return "/images/qepa.jpg";
 if(n.includes("spec"))return "/images/spec-i-pjekur.jpg";
 if(n.includes("djath"))return "/images/extra-djath.jpg";
 if(n.includes("domat")||n.includes("tranguj")||n.includes("trangull"))return "/images/domat-tranguj.jpg";
 if(n.includes("pule"))return "/images/grilled-chicken.jpg";
 if(n.includes("pica"))return "/images/pizza.jpg";
 if(n.includes("tuna"))return "/images/tuna-sandwich.jpg";
 if(n.includes("hamburger")&&n.includes("mish i bardh"))return "/images/burger-mish-i-bardh.jpg";
 if(n.includes("hamburger"))return "/images/burger-sandwich.jpg";
 if(n.includes("pomfrit"))return "/images/pomfrit.jpg";
 if(p.kind==="PIJE")return "/images/juice.jpg";
 if(p.kind==="KAFE")return "/images/coffee.jpg";
 if(p.kind==="EMBELSIRE")return "/images/trileqe.jpg";
 return "/images/grill-platter.jpg";
}
function stockChange(productId,delta,actorId,orderId,reason){
 const tracked=db.prepare("SELECT i.quantity,i.unit,p.name FROM inventory i JOIN products p ON p.id=i.product_id WHERE i.product_id=?").get(productId);
 if(!tracked)return;
 const next=Number(tracked.quantity)+Number(delta);
 if(next < -0.000001){const e=new Error("Stok i pamjaftueshëm për "+tracked.name+" (mbeten "+tracked.quantity+" "+tracked.unit+").");e.code="INSUFFICIENT_STOCK";throw e;}
 db.prepare("UPDATE inventory SET quantity=?,updated_at=? WHERE product_id=?").run(Math.max(0,next),now(),productId);
 db.prepare("INSERT INTO inventory_movements(product_id,order_id,actor_id,quantity_delta,reason,created_at) VALUES(?,?,?,?,?,?)").run(productId,orderId||null,actorId||null,delta,reason,now());
}
function restoreOrderStock(orderId,actorId,reason){
 const rows=db.prepare("SELECT product_id,SUM(quantity) quantity FROM order_items WHERE order_id=? GROUP BY product_id").all(orderId);
 for(const row of rows)stockChange(row.product_id,row.quantity,actorId,orderId,reason||"ORDER_CANCELLED_RESTOCK");
}
function syncKitchenStatus(orderId){
 const hasKitchenItems=!!db.prepare("SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=? AND p.kind IN ('USHQIM','EMBELSIRE') LIMIT 1").get(orderId);
 db.prepare("UPDATE orders SET kitchen_status=?,kitchen_updated_at=? WHERE id=?").run(hasKitchenItems?"NEW":null,now(),orderId);
}
function dateRange(req){
 const today=new Date().toISOString().slice(0,10),firstOfMonth=today.slice(0,8)+"01";
 const from=String(req.query.from||firstOfMonth),to=String(req.query.to||today);
 const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T00:00:00Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
 if(!valid(from)||!valid(to)||from>to)throw new Error("Datat e raportit nuk janë të vlefshme.");
 if((Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000>366)throw new Error("Periudha e raportit nuk mund të kalojë 366 ditë.");
 return{from,to};
}
function reportData(from,to){
 const summary=db.prepare("SELECT COUNT(*) paid_orders,COALESCE(SUM(total_cents),0) revenue,COALESCE(AVG(total_cents),0) average_order FROM orders WHERE status='PAID' AND date(completed_at,'localtime') BETWEEN ? AND ?").get(from,to);
 const unpaid=db.prepare("SELECT COUNT(*) count,COALESCE(SUM(total_cents),0) total FROM orders WHERE status='UNPAID' AND date(unpaid_at,'localtime') BETWEEN ? AND ?").get(from,to);
 const cancelled=db.prepare("SELECT COUNT(*) count FROM orders WHERE status='CANCELLED' AND date(updated_at,'localtime') BETWEEN ? AND ?").get(from,to);
 const payments=db.prepare("SELECT p.method,COUNT(*) count,COALESCE(SUM(p.amount_cents),0) amount FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.status='PAID' AND date(p.paid_at,'localtime') BETWEEN ? AND ? GROUP BY p.method ORDER BY amount DESC").all(from,to);
 const products=db.prepare("SELECT i.product_name_snapshot name,SUM(i.quantity) quantity,SUM(i.quantity*i.unit_price_cents) revenue FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status='PAID' AND date(o.completed_at,'localtime') BETWEEN ? AND ? GROUP BY i.product_name_snapshot ORDER BY quantity DESC,revenue DESC LIMIT 12").all(from,to);
 const days=db.prepare("SELECT date(completed_at,'localtime') day,COUNT(*) orders,COALESCE(SUM(total_cents),0) revenue FROM orders WHERE status='PAID' AND date(completed_at,'localtime') BETWEEN ? AND ? GROUP BY date(completed_at,'localtime') ORDER BY day").all(from,to);
 return{from,to,summary:{...summary,revenue:eur(summary.revenue),average_order:eur(summary.average_order)},unpaid:{...unpaid,total:eur(unpaid.total)},cancelled:cancelled.count,payments:payments.map(x=>({...x,amount:eur(x.amount)})),products:products.map(x=>({...x,revenue:eur(x.revenue)})),days:days.map(x=>({...x,revenue:eur(x.revenue)}))};
}
app.get("/api/health",(q,r)=>r.json({ok:true,service:"sharri-pos"}));
app.get("/api/sesioni",(q,r)=>q.session.user?r.json({loggedIn:true,user:q.session.user}):r.json({loggedIn:false}));
app.post("/api/kycu",(q,r)=>{const u=db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(String(q.body.username||""));if(!u||!bcrypt.compareSync(String(q.body.password||""),u.password_hash))return r.status(401).json({error:"Përdoruesi ose fjalëkalimi nuk është i saktë."});q.session.user={id:u.id,username:u.username,name:u.name,role:u.role};audit(u.id,"KYÇJE","USER",u.id);r.json({ok:true,user:q.session.user})});
app.post("/api/dil",(q,r)=>q.session.destroy(()=>r.json({ok:true})));
const menuProductQuery="SELECT p.*,c.name category_name,i.quantity stock_quantity,i.unit stock_unit,i.low_stock_threshold,(i.product_id IS NOT NULL) stock_tracked FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN inventory i ON i.product_id=p.id";
app.get("/api/menu",auth,(q,r)=>r.json({categories:db.prepare("SELECT * FROM categories WHERE active=1 ORDER BY display_order").all(),products:db.prepare(menuProductQuery+" WHERE p.active=1 AND c.active=1 ORDER BY c.display_order,p.display_order,p.id").all()}));
app.get("/api/public-menu",(q,r)=>{
 const categories=db.prepare("SELECT id,name,display_order FROM categories WHERE active=1 ORDER BY display_order").all();
 const products=db.prepare("SELECT p.id,p.category_id,p.name,p.price_cents,p.kind,p.image_path,c.name category_name,(i.product_id IS NOT NULL) stock_tracked,CASE WHEN i.product_id IS NULL OR i.quantity>0 THEN 1 ELSE 0 END available FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN inventory i ON i.product_id=p.id WHERE p.active=1 AND c.active=1 ORDER BY c.display_order,p.display_order,p.id").all().map(p=>({...p,image_path:productImage(p)}));
 r.json({restaurant:"Sharri",categories,products});
});
app.get("/api/admin/menu",admin,(q,r)=>r.json({categories:db.prepare("SELECT id,name,display_order FROM categories WHERE active=1 ORDER BY display_order").all(),products:db.prepare(menuProductQuery+" WHERE c.active=1 ORDER BY c.display_order,p.display_order,p.id").all()}));
function validMenuImagePath(imagePath){
 if(!imagePath)return true;
 let p=String(imagePath).trim();
 if(!p.startsWith("/")&&(p.startsWith("images/")||p.startsWith("menu-images/")))p="/"+p;
 if(/^\/images\/[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp)$/i.test(p))return fs.existsSync(path.join(__dirname,"public",p.slice(1)));
 if(/^\/menu-images\/[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp)$/i.test(p))return fs.existsSync(path.join(MENU_IMAGE_DIR,path.basename(p)));
 return false;
}
function inferKind(categoryName,rawKind){
 if(rawKind&&["USHQIM","PIJE","KAFE","EMBELSIRE","SHTESE"].includes(String(rawKind).toUpperCase()))return String(rawKind).toUpperCase();
 const c=String(categoryName||"").toLowerCase();
 if(c.includes("pije"))return "PIJE";
 if(c.includes("kafe")||c.includes("çaj")||c.includes("qaj"))return "KAFE";
 if(c.includes("ëmbëlsir")||c.includes("embelsir")||c.includes("tort"))return "EMBELSIRE";
 if(c.includes("shtes"))return "SHTESE";
 return "USHQIM";
}
const PRESET_IMAGES=[
 {name:"Hamburger",path:"/images/burger-sandwich.jpg",category:"Mish dhe Ushqim"},
 {name:"Burger mish i bardhë",path:"/images/burger-mish-i-bardh.jpg",category:"Mish dhe Ushqim"},
 {name:"Pica",path:"/images/pizza.jpg",category:"Mish dhe Ushqim"},
 {name:"Qebap",path:"/images/qebap.jpg",category:"Mish dhe Ushqim"},
 {name:"Kombinim Skare / Pjatë",path:"/images/grill-platter.jpg",category:"Mish dhe Ushqim"},
 {name:"Pule e Pjekur / File",path:"/images/grilled-chicken.jpg",category:"Mish dhe Ushqim"},
 {name:"Sandwich Tuna",path:"/images/tuna-sandwich.jpg",category:"Mish dhe Ushqim"},
 {name:"Pomfrit",path:"/images/pomfrit.jpg",category:"Shtesa"},
 {name:"Suxhuk",path:"/images/suxhuk.jpg",category:"Shtesa"},
 {name:"Extra Djathë",path:"/images/extra-djath.jpg",category:"Shtesa"},
 {name:"Qepë",path:"/images/qepa.jpg",category:"Shtesa"},
 {name:"Spec i Pjekur",path:"/images/spec-i-pjekur.jpg",category:"Shtesa"},
 {name:"Domate & Tranguj",path:"/images/domat-tranguj.jpg",category:"Shtesa"},
 {name:"Trileqe",path:"/images/trileqe.jpg",category:"Ëmbëlsira"},
 {name:"Tortë Snikers",path:"/images/snickers-cake.jpg",category:"Ëmbëlsira"},
 {name:"Kafe",path:"/images/coffee.jpg",category:"Pije"},
 {name:"Çaj",path:"/images/tea.jpg",category:"Pije"},
 {name:"Coca-Cola",path:"/images/coca-cola.jpg",category:"Pije"},
 {name:"Fanta",path:"/images/fanta.jpg",category:"Pije"},
 {name:"Schweppes",path:"/images/schwepps.png",category:"Pije"},
 {name:"Lëng Frutash",path:"/images/juice.jpg",category:"Pije"},
 {name:"Multisola",path:"/images/multisola.jpg",category:"Pije"},
 {name:"Ice Tea",path:"/images/ice-tea.png",category:"Pije"},
 {name:"Golden Eagle",path:"/images/golden-eagle.jpg",category:"Pije"},
 {name:"Red Bull",path:"/images/red-bull.jpg",category:"Pije"},
 {name:"Birra Peje",path:"/images/birra-peja.jpg",category:"Pije"},
 {name:"Heineken",path:"/images/heineken.jpg",category:"Pije"},
 {name:"Bavaria",path:"/images/bavaria.jpg",category:"Pije"},
 {name:"Laqko",path:"/images/lasko.jpg",category:"Pije"},
 {name:"Ice Smirnof",path:"/images/smirnoff-ice.jpg",category:"Pije"},
 {name:"Jägermeister",path:"/images/jagermeister.png",category:"Pije"},
 {name:"Ujë Mokne",path:"/images/uje-mokne.png",category:"Pije"},
 {name:"Laqin",path:"/images/laqin.png",category:"Pije"}
];
app.get("/api/admin/preset-images",admin,(q,r)=>r.json(PRESET_IMAGES));
app.get("/api/admin/categories",admin,(q,r)=>{
 const cats=db.prepare("SELECT c.*,(SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) product_count FROM categories c ORDER BY c.display_order,c.id").all();
 r.json(cats);
});
app.post("/api/admin/categories",admin,(q,r)=>{
 const name=String(q.body.name||"").trim();
 if(!name||name.length>50)return r.status(400).json({error:"Emri i kategorisë duhet të jetë 1–50 shenja."});
 const existing=db.prepare("SELECT id,active FROM categories WHERE LOWER(name)=LOWER(?)").get(name);
 if(existing){
  if(!existing.active){
   db.prepare("UPDATE categories SET active=1 WHERE id=?").run(existing.id);
   audit(q.session.user.id,"CATEGORY_REACTIVATED","CATEGORY",existing.id,{name});
   return r.status(200).json({ok:true,id:existing.id,reactivated:true});
  }
  return r.status(409).json({error:"Kjo kategori ekziston tashmë."});
 }
 const maxOrder=db.prepare("SELECT COALESCE(MAX(display_order),0)+1 n FROM categories").get().n;
 const displayOrder=Number.isInteger(Number(q.body.display_order))?Number(q.body.display_order):maxOrder;
 const res=db.prepare("INSERT INTO categories(name,display_order,active) VALUES(?,?,1)").run(name,displayOrder);
 audit(q.session.user.id,"CATEGORY_CREATED","CATEGORY",res.lastInsertRowid,{name,display_order:displayOrder});
 r.status(201).json({ok:true,id:res.lastInsertRowid,name,display_order:displayOrder});
});
const handleCreateProduct=(q,r)=>{
 const name=String(q.body.name||"").trim();
 if(!name||name.length>100)return r.status(400).json({error:"Emri i produktit duhet të jetë 1–100 shenja."});
 const categoryId=Number(q.body.category_id);
 const category=db.prepare("SELECT * FROM categories WHERE id=? AND active=1").get(categoryId);
 if(!Number.isInteger(categoryId)||!category)return r.status(400).json({error:"Zgjidhni një kategori të vlefshme."});
 let price=Number(q.body.price_cents);
 if((!Number.isInteger(price)||price<1)&&q.body.price!=null){
  const parsed=Number(String(q.body.price).replace(",",".").trim());
  if(Number.isFinite(parsed)&&parsed>0)price=Math.round(parsed*100);
 }
 if(!Number.isInteger(price)||price<1||price>10000000)return r.status(400).json({error:"Çmimi duhet të jetë të paktën 0.01€."});
 let displayOrder=Number(q.body.display_order);
 if(!Number.isInteger(displayOrder)||displayOrder<0||displayOrder>9999){
  const nextOrder=db.prepare("SELECT COALESCE(MAX(display_order),0)+1 n FROM products WHERE category_id=?").get(categoryId).n;
  displayOrder=nextOrder;
 }
 let imagePath=String(q.body.image_path||"").trim();
 if(imagePath&&!imagePath.startsWith("/")&&(imagePath.startsWith("images/")||imagePath.startsWith("menu-images/")))imagePath="/"+imagePath;
 if(!validMenuImagePath(imagePath))return r.status(400).json({error:"Fotoja duhet të jetë imazh lokal i ngarkuar ose i zgjedhur."});
 const active=q.body.active===undefined||q.body.active===null||q.body.active===true||q.body.active===1||q.body.active==="1";
 const kind=inferKind(category.name,q.body.kind);
 const dup=db.prepare("SELECT id FROM products WHERE LOWER(name)=LOWER(?) AND active=1").get(name);
 if(dup)return r.status(409).json({error:"Një produkt aktiv me emrin \""+name+"\" ekziston tashmë."});
 const initialStock=q.body.initial_stock||null;
 const tx=db.transaction(()=>{
  const ins=db.prepare("INSERT INTO products(name,category_id,price_cents,kind,active,display_order,image_path) VALUES(?,?,?,?,?,?,?)").run(name,categoryId,price,kind,active?1:0,displayOrder,imagePath||null);
  const newId=ins.lastInsertRowid;
  if(initialStock&&(initialStock.track||Number.isFinite(Number(initialStock.quantity)))){
   const qty=Math.max(0,Number(initialStock.quantity)||0);
   const units=["copë","shishe","porcion","kg","l","pako"];
   const unit=units.includes(initialStock.unit)?initialStock.unit:"copë";
   const threshold=Math.max(0,Number(initialStock.low_stock_threshold)||5);
   db.prepare("INSERT INTO inventory(product_id,quantity,unit,low_stock_threshold,updated_at) VALUES(?,?,?,?,?)").run(newId,qty,unit,threshold,now());
   if(qty>0)db.prepare("INSERT INTO inventory_movements(product_id,actor_id,quantity_delta,reason,created_at) VALUES(?,?,?,?,?)").run(newId,q.session.user.id,qty,"ADMIN_TRACK_START",now());
  }
  audit(q.session.user.id,"MENU_PRODUCT_CREATED","PRODUCT",newId,{name,price_cents:price,category_id:categoryId,kind,active,image_path:imagePath||null});
  return newId;
 });
 const newId=tx();
 const created=db.prepare(menuProductQuery+" WHERE p.id=?").get(newId);
 r.status(201).json({ok:true,id:newId,product:created});
};
app.post("/api/admin/menu",admin,handleCreateProduct);
app.post("/api/admin/products",admin,handleCreateProduct);
app.patch("/api/admin/menu/:id",admin,(q,r)=>{
 const id=Number(q.params.id),old=db.prepare("SELECT * FROM products WHERE id=?").get(id);
 if(!old)return r.status(404).json({error:"Produkti nuk u gjet."});
 const name=String(q.body.name||"").trim(),categoryId=Number(q.body.category_id);
 let price=Number(q.body.price_cents);
 if((!Number.isInteger(price)||price<1)&&q.body.price!=null){
  const parsed=Number(String(q.body.price).replace(",",".").trim());
  if(Number.isFinite(parsed)&&parsed>0)price=Math.round(parsed*100);
 }
 const active=q.body.active===true||q.body.active===1||q.body.active==="1";
 const displayOrder=Number(q.body.display_order);
 let imagePath=String(q.body.image_path||"").trim();
 if(imagePath&&!imagePath.startsWith("/")&&(imagePath.startsWith("images/")||imagePath.startsWith("menu-images/")))imagePath="/"+imagePath;
 if(!name||name.length>100)return r.status(400).json({error:"Emri duhet të jetë 1–100 shenja."});
 const category=db.prepare("SELECT id,name FROM categories WHERE id=? AND active=1").get(categoryId);
 if(!Number.isInteger(categoryId)||!category)return r.status(400).json({error:"Kategoria nuk është e vlefshme."});
 if(!Number.isInteger(price)||price<1||price>10000000)return r.status(400).json({error:"Çmimi nuk është i vlefshëm."});
 if(!Number.isInteger(displayOrder)||displayOrder<0||displayOrder>9999)return r.status(400).json({error:"Renditja nuk është e vlefshme."});
 if(!validMenuImagePath(imagePath))return r.status(400).json({error:"Fotoja duhet të jetë imazh lokal i ngarkuar ose i zgjedhur."});
 const rawKind=q.body.kind?String(q.body.kind).toUpperCase():null;
 const kind=["USHQIM","PIJE","KAFE","EMBELSIRE","SHTESE"].includes(rawKind)?rawKind:(old.kind||inferKind(category.name));
 db.prepare("UPDATE products SET name=?,category_id=?,price_cents=?,kind=?,active=?,display_order=?,image_path=? WHERE id=?").run(name,categoryId,price,kind,active?1:0,displayOrder,imagePath||null,id);
 audit(q.session.user.id,"MENU_PRODUCT_UPDATED","PRODUCT",id,{name,price_cents:price,category_id:categoryId,kind,active,image_path:imagePath||null});
 r.json({ok:true});
});
const handleDeleteProduct=(q,r)=>{
 const id=Number(q.params.id);
 const p=db.prepare("SELECT * FROM products WHERE id=?").get(id);
 if(!p)return r.status(404).json({error:"Produkti nuk u gjet."});
 const activeUsage=db.prepare("SELECT o.order_number FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.product_id=? AND o.status IN ('ACTIVE','PAYMENT_PENDING') LIMIT 1").get(id);
 if(activeUsage)return r.status(409).json({error:"Produkti nuk mund të fshihet sepse ndodhet në porosinë aktive #"+activeUsage.order_number+". Përfundoni ose hiqeni nga porosia para fshirjes."});
 const tx=db.transaction(()=>{
  db.prepare("DELETE FROM inventory_movements WHERE product_id=?").run(id);
  db.prepare("DELETE FROM inventory WHERE product_id=?").run(id);
  db.prepare("DELETE FROM products WHERE id=?").run(id);
  audit(q.session.user.id,"MENU_PRODUCT_DELETED","PRODUCT",id,{name:p.name,price_cents:p.price_cents,category_id:p.category_id});
 });
 tx();
 r.json({ok:true,message:"Produkti \""+p.name+"\" u fshi me sukses."});
};
app.delete("/api/admin/menu/:id",admin,handleDeleteProduct);
app.delete("/api/admin/products/:id",admin,handleDeleteProduct);
app.post("/api/admin/menu-image",admin,async(q,r)=>{
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(q.body.dataUrl||""));
 if(!match)return r.status(400).json({error:"Ngarko një fotografi PNG, JPG ose WebP."});
 const buffer=Buffer.from(match[2],"base64");
 if(buffer.length<32||buffer.length>3*1024*1024)return r.status(413).json({error:"Fotografia duhet të jetë maksimumi 3 MB."});
 const mime=match[1],isPng=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),isJpeg=buffer[0]===255&&buffer[1]===216&&buffer[2]===255,isWebp=buffer.subarray(0,4).toString()==="RIFF"&&buffer.subarray(8,12).toString()==="WEBP";
 if(!(mime==="image/png"&&isPng)&&!(mime==="image/jpeg"&&isJpeg)&&!(mime==="image/webp"&&isWebp))return r.status(400).json({error:"Përmbajtja e fotografisë nuk përputhet me formatin."});
 const ext=mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg",filename=crypto.randomUUID()+"."+ext;
 await fs.promises.writeFile(path.join(MENU_IMAGE_DIR,filename),buffer,{flag:"wx"});
 audit(q.session.user.id,"MENU_IMAGE_UPLOADED","PRODUCT",null,{filename,size:buffer.length});
 r.status(201).json({path:"/menu-images/"+filename});
});
app.get("/api/admin/inventory",admin,(q,r)=>r.json(db.prepare("SELECT p.id,p.name,p.active,c.name category_name,i.quantity stock_quantity,i.unit stock_unit,i.low_stock_threshold,(i.product_id IS NOT NULL) stock_tracked FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN inventory i ON i.product_id=p.id WHERE p.active=1 ORDER BY c.display_order,p.display_order,p.id").all()));
app.put("/api/admin/inventory/:id",admin,(q,r)=>{
 const id=Number(q.params.id),product=db.prepare("SELECT id,name FROM products WHERE id=?").get(id),quantity=Number(q.body.quantity),threshold=Number(q.body.low_stock_threshold),unit=String(q.body.unit||"");
 const units=["copë","shishe","porcion","kg","l","pako"];
 if(!product)return r.status(404).json({error:"Produkti nuk u gjet."});
 if(!Number.isFinite(quantity)||quantity<0||quantity>1000000||!Number.isFinite(threshold)||threshold<0||threshold>1000000||!units.includes(unit))return r.status(400).json({error:"Sasia, njësia ose pragu i stokut nuk është i vlefshëm."});
 const before=db.prepare("SELECT quantity FROM inventory WHERE product_id=?").get(id),delta=before?quantity-before.quantity:quantity,at=now();
 const tx=db.transaction(()=>{
  db.prepare("INSERT INTO inventory(product_id,quantity,unit,low_stock_threshold,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET quantity=excluded.quantity,unit=excluded.unit,low_stock_threshold=excluded.low_stock_threshold,updated_at=excluded.updated_at").run(id,quantity,unit,threshold,at);
  if(delta!==0)db.prepare("INSERT INTO inventory_movements(product_id,actor_id,quantity_delta,reason,created_at) VALUES(?,?,?,?,?)").run(id,q.session.user.id,delta,before?"ADMIN_ADJUST":"ADMIN_TRACK_START",at);
  audit(q.session.user.id,"INVENTORY_UPDATED","PRODUCT",id,{quantity,unit,low_stock_threshold:threshold,delta});
 });
 tx();r.json({ok:true});
});
app.delete("/api/admin/inventory/:id",admin,(q,r)=>{
 const id=Number(q.params.id),row=db.prepare("SELECT quantity FROM inventory WHERE product_id=?").get(id);
 if(!row)return r.status(404).json({error:"Ky produkt nuk ndiqet në stok."});
 db.prepare("DELETE FROM inventory WHERE product_id=?").run(id);
 audit(q.session.user.id,"INVENTORY_TRACKING_REMOVED","PRODUCT",id,{previous_quantity:row.quantity});
 r.json({ok:true});
});
app.get("/api/admin/menu-qr.svg",admin,async(q,r)=>{
 try{
  const base=process.env.PUBLIC_BASE_URL?process.env.PUBLIC_BASE_URL.replace(/\/$/,""):(q.protocol+"://"+q.get("host"));
  const url=new URL("/menu",base).toString(),svg=await QRCode.toString(url,{type:"svg",errorCorrectionLevel:"M",margin:2,color:{dark:"#142019",light:"#ffffff"}});
  r.set("Cache-Control","no-store").type("image/svg+xml").send(svg);
 }catch(e){r.status(500).json({error:"Kodi QR nuk mund të krijohet."});}
});
app.get("/api/admin/reports",admin,(q,r)=>{
 try{const range=dateRange(q);r.json(reportData(range.from,range.to));}
 catch(e){r.status(400).json({error:e.message});}
});
function csvCell(value){let s=String(value==null?"":value);if(/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
app.get("/api/admin/reports.csv",admin,(q,r)=>{
 try{
  const range=dateRange(q),rows=db.prepare("SELECT date(o.completed_at,'localtime') day,o.order_number,COALESCE(t.number,o.custom_identifier,o.order_type) location,u.name waiter,COALESCE(p.method,'') method,o.total_cents FROM orders o LEFT JOIN tables_restaurant t ON t.id=o.table_id JOIN users u ON u.id=o.waiter_id LEFT JOIN payments p ON p.order_id=o.id WHERE o.status='PAID' AND date(o.completed_at,'localtime') BETWEEN ? AND ? ORDER BY o.completed_at,o.order_number").all(range.from,range.to);
  const content="\uFEFF"+[["Data","Porosia","Vendndodhja","Kamarieri","Mënyra e pagesës","Totali (EUR)"] ,...rows.map(x=>[x.day,x.order_number,x.location,x.waiter,x.method,(x.total_cents/100).toFixed(2)])].map(row=>row.map(csvCell).join(",")).join("\r\n");
  r.set("Content-Type","text/csv; charset=utf-8").set("Content-Disposition","attachment; filename=sharri-report-"+range.from+"-"+range.to+".csv").send(content);
 }catch(e){r.status(400).json({error:e.message});}
});
app.get("/api/kitchen",auth,(q,r)=>{
 db.prepare("UPDATE orders SET kitchen_status='NEW',kitchen_updated_at=COALESCE(kitchen_updated_at,opened_at) WHERE status IN ('ACTIVE','UNPAID') AND kitchen_status IS NULL AND EXISTS(SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=orders.id AND p.kind IN ('USHQIM','EMBELSIRE'))").run();
 const orders=db.prepare("SELECT o.id,o.order_number,o.order_type,o.custom_identifier,o.opened_at,o.kitchen_status,o.kitchen_updated_at,t.number table_number,u.name waiter_name FROM orders o LEFT JOIN tables_restaurant t ON t.id=o.table_id JOIN users u ON u.id=o.waiter_id WHERE (o.status IN ('ACTIVE','UNPAID') OR (o.status='PAID' AND o.kitchen_status IS NOT NULL AND o.kitchen_status<>'READY')) AND EXISTS(SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=o.id AND p.kind IN ('USHQIM','EMBELSIRE')) ORDER BY CASE COALESCE(o.kitchen_status,'NEW') WHEN 'NEW' THEN 0 WHEN 'PREPARING' THEN 1 ELSE 2 END,o.opened_at").all();
 r.json(orders.map(o=>({...o,kitchen_status:o.kitchen_status||"NEW",items:db.prepare("SELECT i.product_name_snapshot name,i.quantity,i.notes,i.created_at FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=? AND p.kind IN ('USHQIM','EMBELSIRE') ORDER BY i.id").all(o.id)})));
});
app.patch("/api/kitchen/:id",auth,(q,r)=>{
 const status=String(q.body.status||""),o=order(q.params.id);
 if(!o||!["ACTIVE","UNPAID","PAID"].includes(o.status))return r.status(404).json({error:"Porosia nuk është në radhën e kuzhinës."});
 if(!["NEW","PREPARING","READY"].includes(status))return r.status(400).json({error:"Gjendja e kuzhinës nuk është e vlefshme."});
 if(!db.prepare("SELECT 1 FROM order_items i JOIN products p ON p.id=i.product_id WHERE i.order_id=? AND p.kind IN ('USHQIM','EMBELSIRE') LIMIT 1").get(o.id))return r.status(400).json({error:"Porosia nuk ka artikuj për kuzhinë."});
 const before=o.kitchen_status||"NEW",at=now();
 db.prepare("UPDATE orders SET kitchen_status=?,kitchen_updated_at=? WHERE id=?").run(status,at,o.id);
 event(o.id,"KITCHEN_STATUS_CHANGED",{from:before,to:status},q.session.user.id,at);audit(q.session.user.id,"KITCHEN_STATUS_CHANGED","ORDER",o.id,{from:before,to:status});
 r.json({ok:true,status});
});
app.get("/api/aktive",auth,(q,r)=>r.json(db.prepare("SELECT o.*,t.number table_number,u.name waiter_name,(SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id) item_count,cr.status cancellation_request_status,cr.reason cancellation_request_reason,cr.created_at cancellation_requested_at FROM orders o LEFT JOIN tables_restaurant t ON t.id=o.table_id JOIN users u ON u.id=o.waiter_id LEFT JOIN cancellation_requests cr ON cr.id=(SELECT r.id FROM cancellation_requests r WHERE r.order_id=o.id ORDER BY r.id DESC LIMIT 1) WHERE o.status IN ('ACTIVE','PAYMENT_PENDING') ORDER BY o.opened_at DESC").all()));
app.get("/api/tavolinat",auth,(q,r)=>{const a=db.prepare("SELECT t.id,t.number,o.id order_id,o.total_cents FROM tables_restaurant t LEFT JOIN orders o ON o.table_id=t.id AND o.status IN ('ACTIVE','PAYMENT_PENDING') ORDER BY t.number").all();const occupied=a.filter(x=>x.order_id).length;r.json({total:50,occupied,free:50-occupied,tables:a})});
app.get("/api/porosi/:id",auth,(q,r)=>{const o=order(q.params.id);if(!o)return r.status(404).json({error:"Porosia nuk u gjet."});r.json({...o,items:items(o.id),payments:db.prepare("SELECT method,paid_at,amount_cents FROM payments WHERE order_id=? ORDER BY id").all(o.id),events:db.prepare("SELECT e.*,u.name actor_name FROM order_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.order_id=? ORDER BY julianday(e.created_at),e.id").all(o.id),cancellation_request:latestCancellationRequest(o.id)})});
app.post("/api/porosi/:id/kerkese-anulim",auth,(q,r)=>{
 if(q.session.user.role!=="KAMARIER")return r.status(403).json({error:"Vetëm kamarieri mund të dërgojë kërkesë për anulim."});
 const o=order(q.params.id),reason=String(q.body.reason||"").replace(/\s+/g," ").trim();
 if(!o)return r.status(404).json({error:"Porosia nuk u gjet."});
 if(o.status!=="ACTIVE")return r.status(400).json({error:"Vetëm porosia aktive mund të dërgohet për anulim."});
 if(!reason)return r.status(400).json({error:"Shkruani arsyen e anulimit."});
 if(reason.length>500)return r.status(400).json({error:"Arsyeja nuk mund të jetë më e gjatë se 500 shenja."});
 if(pendingCancellation(o.id))return r.status(409).json({error:"Kjo porosi ka tashmë një kërkesë në pritje."});
 const createdAt=now();
 const tx=db.transaction(()=>{
   const result=db.prepare("INSERT INTO cancellation_requests(order_id,requested_by,reason,created_at) VALUES(?,?,?,?)").run(o.id,q.session.user.id,reason,createdAt);
   const requestId=result.lastInsertRowid;
   event(o.id,"ANULIM_U_KERKUA",{requestId,arsye:reason},q.session.user.id,createdAt);
   audit(q.session.user.id,"KERKO_ANULIM_POROSIE","ORDER",o.id,{requestId,reason});
   return requestId;
 });
 try{return r.status(201).json({ok:true,id:tx()})}catch(e){if(String(e.message||"").indexOf("UNIQUE")!==-1)return r.status(409).json({error:"Kjo porosi ka tashmë një kërkesë në pritje."});throw e}
});
app.get("/api/anulimet",admin,(q,r)=>r.json(db.prepare("SELECT cr.*,o.order_number,o.order_type,o.total_cents,o.custom_identifier,t.number table_number,w.name waiter_name,requester.name requested_by_name FROM cancellation_requests cr JOIN orders o ON o.id=cr.order_id LEFT JOIN tables_restaurant t ON t.id=o.table_id JOIN users w ON w.id=o.waiter_id JOIN users requester ON requester.id=cr.requested_by WHERE cr.status=\'PENDING\' ORDER BY cr.created_at ASC,cr.id ASC").all()));
app.post("/api/anulimet/:id/prano",admin,(q,r)=>{
 const requestId=Number(q.params.id),createdAt=now();
 const tx=db.transaction(()=>{
   const request=db.prepare("SELECT * FROM cancellation_requests WHERE id=? AND status=\'PENDING\'").get(requestId);
   if(!request)return null;
   const o=order(request.order_id);
   if(!o||o.status!=="ACTIVE")return false;
   restoreOrderStock(o.id,q.session.user.id,"ORDER_CANCELLED_RESTOCK");
   db.prepare("UPDATE orders SET status=\'CANCELLED\',kitchen_status=NULL,updated_at=? WHERE id=? AND status=\'ACTIVE\'").run(createdAt,o.id);
   db.prepare("UPDATE cancellation_requests SET status=\'APPROVED\',reviewed_by=?,reviewed_at=? WHERE id=? AND status=\'PENDING\'").run(q.session.user.id,createdAt,request.id);
   event(o.id,"POROSI_E_ANULUAR",{arsye:request.reason,requestId:request.id,requestedBy:request.requested_by,approvedBy:q.session.user.id},q.session.user.id,createdAt);
   audit(q.session.user.id,"MIRATO_ANULIM_POROSIE","ORDER",o.id,{requestId:request.id,requestedBy:request.requested_by,reason:request.reason});
   return o.id;
 });
 const result=tx();
 if(result===null)return r.status(404).json({error:"Kërkesa nuk u gjet ose është shqyrtuar tashmë."});
 if(result===false)return r.status(409).json({error:"Porosia nuk është më aktive dhe nuk mund të anulohet."});
 r.json({ok:true,orderId:result});
});
app.post("/api/anulimet/:id/refuzo",admin,(q,r)=>{
 const requestId=Number(q.params.id),note=String(q.body.note||"").replace(/\s+/g," ").trim();
 if(note.length>300)return r.status(400).json({error:"Shënimi nuk mund të jetë më i gjatë se 300 shenja."});
 const reviewedAt=now();
 const tx=db.transaction(()=>{
   const request=db.prepare("SELECT * FROM cancellation_requests WHERE id=? AND status=\'PENDING\'").get(requestId);
   if(!request)return null;
   const result=db.prepare("UPDATE cancellation_requests SET status=\'REJECTED\',reviewed_by=?,reviewed_at=?,decision_note=? WHERE id=? AND status=\'PENDING\'").run(q.session.user.id,reviewedAt,note||null,request.id);
   if(!result.changes)return null;
   event(request.order_id,"ANULIM_U_REFUZUA",{requestId:request.id,arsye:request.reason,shenim:note||null},q.session.user.id,reviewedAt);
   audit(q.session.user.id,"REFUZO_ANULIM_POROSIE","ORDER",request.order_id,{requestId:request.id,requestedBy:request.requested_by,reason:request.reason,note:note||null});
   return request.order_id;
 });
 const result=tx();
 if(result===null)return r.status(404).json({error:"Kërkesa nuk u gjet ose është shqyrtuar tashmë."});
 r.json({ok:true,orderId:result});
});
app.post("/api/porosi",auth,(q,r)=>{
 const type=String(q.body.orderType||""),table=Number(q.body.tableNumber),name=String(q.body.customIdentifier||"").trim(),raw=Array.isArray(q.body.items)?q.body.items:[];
 if(!raw.length)return r.status(400).json({error:"Shtoni të paktën një produkt."});
 const ps=db.prepare("SELECT * FROM products WHERE active=1").all(),map=new Map(ps.map(x=>[x.id,x])),arr=[];
 for(const x of raw){const p=map.get(Number(x.productId)),n=Math.floor(Number(x.quantity));if(!p||n<1||n>999)return r.status(400).json({error:"Produkti ose sasia nuk është e vlefshme."});arr.push({p,n,notes:noteText(x.notes)})}
 const hasFood=arr.some(x=>food(x.p.kind));
 if(!["TAVOLINE","EMER","ME_VETI","PER_KETU"].includes(type))return r.status(400).json({error:"Lloji i porosisë nuk është i vlefshëm."});
 if((type==="ME_VETI"||type==="PER_KETU")&&!hasFood)return r.status(400).json({error:"Me veti dhe Për këtu lejohen vetëm kur porosia përmban ushqim (shtesat nuk mjaftojnë vetë)."});
 let tableId=null;if(type==="TAVOLINE"){if(!Number.isInteger(table)||table<1||table>50)return r.status(400).json({error:"Zgjidhni tavolinë nga 1 deri në 50."});tableId=table;if(db.prepare("SELECT id FROM orders WHERE table_id=? AND status IN ('ACTIVE','PAYMENT_PENDING')").get(tableId))return r.status(409).json({error:"Kjo tavolinë ka një porosi aktive."})}
 if(type==="EMER"&&!name)return r.status(400).json({error:"Shkruani emrin ose identifikuesin."});
 const no=db.prepare("SELECT COALESCE(MAX(order_number),0)+1 n FROM orders").get().n;
 const sum=arr.reduce((s,x)=>s+x.n*x.p.price_cents,0);
 const createdAt=now();
 const tx=db.transaction(()=>{
   const o=db.prepare("INSERT INTO orders(order_number,order_type,table_id,custom_identifier,waiter_id,total_cents,kitchen_status,kitchen_updated_at) VALUES(?,?,?,?,?,?,?,?)").run(no,type,tableId,type==="EMER"?name:null,q.session.user.id,sum,hasFood?"NEW":null,hasFood?createdAt:null);
   const orderId=o.lastInsertRowid;
   for(const x of arr){
     stockChange(x.p.id,-x.n,q.session.user.id,orderId,"ORDER_SALE");
     db.prepare("INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,quantity,notes,created_at) VALUES(?,?,?,?,?,?,?)").run(orderId,x.p.id,x.p.name,x.p.price_cents,x.n,x.notes,createdAt);
   }
   syncKitchenStatus(orderId);
   event(orderId,"POROSI_U_KRIJUA",{type,total:sum,items:arr.map(x=>({product:x.p.name,quantity:x.n,notes:x.notes}))},q.session.user.id,createdAt);
   audit(q.session.user.id,"KRIJO_POROSI","ORDER",orderId);
   return orderId;
 });
 let createdOrderId;try{createdOrderId=tx()}catch(e){if(e.code==="INSUFFICIENT_STOCK")return r.status(409).json({error:e.message});throw e}
 r.json({ok:true,id:createdOrderId})});
app.post("/api/porosi/:id/shto",auth,(q,r)=>{
 const o=order(q.params.id),p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(Number(q.body.productId)),notes=noteText(q.body.notes);
 if(!o||o.status!=="ACTIVE"||!p)return r.status(400).json({error:"Porosia ose produkti nuk është aktiv."});
 if(pendingCancellation(o.id))return r.status(409).json({error:"Porosia ka kërkesë për anulim në pritje të miratimit."});
 const createdAt=now();
 const tx=db.transaction(()=>{
   stockChange(p.id,-1,q.session.user.id,o.id,"ORDER_ITEM_ADDED");
   const i=db.prepare("INSERT INTO order_items(order_id,product_id,product_name_snapshot,unit_price_cents,quantity,notes,created_at) VALUES(?,?,?,?,1,?,?)").run(o.id,p.id,p.name,p.price_cents,notes,createdAt);
   const s=total(o.id);
   db.prepare("UPDATE orders SET total_cents=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(s,o.id);
   syncKitchenStatus(o.id);
   event(o.id,"PRODUKT_U_SHTUA",{itemId:i.lastInsertRowid,produkt:p.name,quantity:1,notes},q.session.user.id,createdAt);
 });
 try{tx()}catch(e){if(e.code==="INSUFFICIENT_STOCK")return r.status(409).json({error:e.message});throw e}
 r.json({ok:true})
});
app.patch("/api/porosi/:id/shenim",auth,(q,r)=>{
 const o=order(q.params.id),i=db.prepare("SELECT * FROM order_items WHERE id=? AND order_id=?").get(Number(q.body.itemId),q.params.id),notes=noteText(q.body.notes);
 if(!o||o.status!=="ACTIVE"||!i)return r.status(400).json({error:"Porosia ose produkti nuk është aktiv."});
 if(pendingCancellation(o.id))return r.status(409).json({error:"Porosia ka kërkesë për anulim në pritje të miratimit."});
 if((i.notes||null)===notes)return r.json({ok:true});
 const changedAt=now();
 const tx=db.transaction(()=>{
   db.prepare("UPDATE order_items SET notes=? WHERE id=?").run(notes,i.id);
   db.prepare("UPDATE orders SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(o.id);
   event(o.id,"SHENIM_U_NDRYSHUA",{itemId:i.id,produkt:i.product_name_snapshot,from:i.notes||null,to:notes},q.session.user.id,changedAt);
 });
 tx();
 r.json({ok:true})
});
app.patch("/api/porosi/:id/sasia",auth,(q,r)=>{
 const o=order(q.params.id),rawQuantity=Number(q.body.quantity),n=Math.floor(rawQuantity);
 const i=db.prepare("SELECT * FROM order_items WHERE id=? AND order_id=?").get(Number(q.body.itemId),q.params.id);
 if(!o||o.status!=="ACTIVE"||!i||!Number.isFinite(rawQuantity)||rawQuantity!==n||n<0||n>999)return r.status(400).json({error:"Sasia nuk është e vlefshme."});
 if(pendingCancellation(o.id))return r.status(409).json({error:"Porosia ka kërkesë për anulim në pritje të miratimit."});
 if(n===i.quantity)return r.json({ok:true});
 if(n===0&&total(o.id)-i.quantity*i.unit_price_cents<=0)return r.status(400).json({error:"Porosia duhet të ketë të paktën një produkt."});
 const changedAt=now();
 const tx=db.transaction(()=>{
   stockChange(i.product_id,i.quantity-n,q.session.user.id,o.id,n>i.quantity?"ORDER_QUANTITY_INCREASE":"ORDER_QUANTITY_RESTORE");
   if(n===0)db.prepare("DELETE FROM order_items WHERE id=?").run(i.id);
   else db.prepare("UPDATE order_items SET quantity=? WHERE id=?").run(n,i.id);
   const s=total(o.id);
   db.prepare("UPDATE orders SET total_cents=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(s,o.id);
   syncKitchenStatus(o.id);
   event(o.id,n===0?"PRODUKT_U_HOQ":"PRODUKT_SASIA_NDRYSHUA",{itemId:i.id,produkt:i.product_name_snapshot,from:i.quantity,to:n},q.session.user.id,changedAt);
 });
 try{tx()}catch(e){if(e.code==="INSUFFICIENT_STOCK")return r.status(409).json({error:e.message});throw e}
 r.json({ok:true})
});
app.post("/api/porosi/:id/pagesa",auth,(q,r)=>{const o=order(q.params.id),m=String(q.body.method||"");if(!o)return r.status(404).json({error:"Porosia nuk u gjet."});if(pendingCancellation(o.id))return r.status(409).json({error:"Pagesa është ndalur derisa administratori ta shqyrtojë kërkesën për anulim."});if(o.status==="PAID")return r.status(409).json({error:"Pagesa është regjistruar tashmë."});if(o.status==="CANCELLED")return r.status(400).json({error:"Porosia është anuluar."});if(!["ACTIVE","UNPAID"].includes(o.status))return r.status(400).json({error:"Kjo porosi nuk mund të paguhet."});if(!["CASH","CARD","OTHER"].includes(m))return r.status(400).json({error:"Zgjidhni mënyrën e pagesës."});const s=total(o.id);const tx=db.transaction(()=>{db.prepare("UPDATE orders SET status='PAID',total_cents=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,unpaid_at=NULL WHERE id=? AND status IN ('ACTIVE','UNPAID')").run(s,o.id);db.prepare("INSERT INTO payments(order_id,amount_cents,method,created_by) VALUES(?,?,?,?)").run(o.id,s,m,q.session.user.id);event(o.id,"PAGESA_U_PERFUND",""+m,q.session.user.id);audit(q.session.user.id,"PAGESA_PERFUND","ORDER",o.id,{method:m,total:s})});tx();r.json({ok:true})});
app.post("/api/porosi/:id/mospagu",auth,(q,r)=>{const o=order(q.params.id);if(!o)return r.status(404).json({error:"Porosia nuk u gjet."});if(pendingCancellation(o.id))return r.status(409).json({error:"Porosia ka kërkesë për anulim në pritje të miratimit."});if(o.status!=="ACTIVE")return r.status(400).json({error:"Vetëm porosia aktive mund të shënohet si e papaguar."});db.prepare("UPDATE orders SET status='UNPAID',unpaid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'").run(o.id);event(o.id,"NUK_U_PAGUA",{total:o.total_cents},q.session.user.id);audit(q.session.user.id,"NUK_U_PAGUA","ORDER",o.id,{total:o.total_cents});r.json({ok:true})});
app.post("/api/porosi/:id/paguaj",admin,(q,r)=>{const o=order(q.params.id),m=String(q.body.method||"");if(!o)return r.status(404).json({error:"Porosia nuk u gjet."});if(o.status!=="UNPAID")return r.status(400).json({error:"Porosia nuk është në listën e papaguara."});if(!["CASH","CARD","OTHER"].includes(m))return r.status(400).json({error:"Zgjidhni mënyrën e pagesës."});const s=total(o.id);const tx=db.transaction(()=>{db.prepare("UPDATE orders SET status='PAID',total_cents=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,unpaid_at=NULL WHERE id=? AND status='UNPAID'").run(s,o.id);db.prepare("INSERT INTO payments(order_id,amount_cents,method,created_by) VALUES(?,?,?,?)").run(o.id,s,m,q.session.user.id);event(o.id,"PAGESA_U_PERFUND_NGA_ADMIN",{method:m,total:s},q.session.user.id);audit(q.session.user.id,"PAGESA_U_PERFUND_NGA_ADMIN","ORDER",o.id,{method:m,total:s})});tx();r.json({ok:true})});
app.post("/api/porosi/:id/anulo",admin,(q,r)=>{const o=order(q.params.id),reason=String(q.body.reason||"").trim();if(!o||o.status!=="ACTIVE")return r.status(400).json({error:"Porosia nuk është aktive."});if(pendingCancellation(o.id))return r.status(409).json({error:"Kjo porosi ka kërkesë në pritje. Shqyrtojeni te Kërkesat për anulim."});if(!reason)return r.status(400).json({error:"Shkruani arsyen."});const tx=db.transaction(()=>{restoreOrderStock(o.id,q.session.user.id,"ORDER_CANCELLED_RESTOCK");db.prepare("UPDATE orders SET status='CANCELLED',kitchen_status=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(o.id);event(o.id,"POROSI_E_ANULUAR",{arsye:reason},q.session.user.id);audit(q.session.user.id,"ANULO_POROSI","ORDER",o.id,{reason})});tx();r.json({ok:true})});
app.get("/api/historiku",admin,(q,r)=>{const term=String(q.query.q||"").trim(),p=[];let s="SELECT o.*,t.number table_number,u.name waiter_name FROM orders o LEFT JOIN tables_restaurant t ON t.id=o.table_id JOIN users u ON u.id=o.waiter_id WHERE o.status IN ('PAID','CANCELLED','UNPAID')";if(term){s+=" AND (CAST(o.order_number AS TEXT) LIKE ? OR CAST(t.number AS TEXT) LIKE ? OR COALESCE(o.custom_identifier,'') LIKE ?)";const z="%"+term+"%";p.push(z,z,z)}s+=" ORDER BY COALESCE(o.completed_at,o.unpaid_at,o.updated_at) DESC LIMIT 500";r.json(db.prepare(s).all(...p))});
app.get("/api/historiku/:id",admin,(q,r)=>{const o=order(q.params.id);if(!o)return r.status(404).json({error:"Porosia nuk u gjet."});r.json({...o,items:items(o.id),payments:db.prepare("SELECT * FROM payments WHERE order_id=?").all(o.id),events:db.prepare("SELECT e.*,u.name actor_name FROM order_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.order_id=? ORDER BY julianday(e.created_at),e.id").all(o.id)})});
app.get("/api/statistika",admin,(q,r)=>{const t=db.prepare("SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN status='PAID' THEN total_cents ELSE 0 END),0) revenue,COALESCE(SUM(CASE WHEN status='PAID' THEN 1 ELSE 0 END),0) paid,COALESCE(SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END),0) cancelled FROM orders WHERE date(COALESCE(completed_at,unpaid_at,opened_at))=date('now','localtime')").get();const top=db.prepare("SELECT product_name_snapshot name,SUM(quantity) quantity FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status='PAID' AND date(o.completed_at)=date('now','localtime') GROUP BY product_name_snapshot ORDER BY quantity DESC LIMIT 8").all();r.json({...t,revenue:eur(t.revenue),top})});
app.get("/api/audit",admin,(q,r)=>r.json(db.prepare("SELECT a.*,u.name actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 500").all()));
app.use((q,r)=>q.path.startsWith("/api/")?r.status(404).json({error:"Rruga nuk u gjet."}):r.sendFile(path.join(__dirname,"public","index.html")));
const PORT=Number(process.env.PORT||3000);
app.listen(PORT,"0.0.0.0",()=>console.log("Sharri POS listening on port "+PORT));
