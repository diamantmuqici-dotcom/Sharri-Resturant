const Database=require("better-sqlite3");
const bcrypt=require("bcryptjs");
const fs=require("fs"),path=require("path");
require("dotenv").config();
fs.mkdirSync(path.join(__dirname,"data"),{recursive:true});
const db=new Database(path.join(__dirname,"data","sharri.db"));
db.pragma("journal_mode=WAL");
db.pragma("foreign_keys=ON");
db.exec("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS tables_restaurant(id INTEGER PRIMARY KEY,number INTEGER UNIQUE NOT NULL,active INTEGER DEFAULT 1);CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE NOT NULL,display_order INTEGER DEFAULT 0,active INTEGER DEFAULT 1);CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,category_id INTEGER NOT NULL,name TEXT NOT NULL,price_cents INTEGER NOT NULL,kind TEXT NOT NULL,active INTEGER DEFAULT 1,display_order INTEGER DEFAULT 0,FOREIGN KEY(category_id) REFERENCES categories(id));CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_number INTEGER UNIQUE NOT NULL,order_type TEXT NOT NULL,table_id INTEGER,custom_identifier TEXT,waiter_id INTEGER NOT NULL,status TEXT DEFAULT 'ACTIVE',total_cents INTEGER DEFAULT 0,opened_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,notes TEXT,FOREIGN KEY(table_id) REFERENCES tables_restaurant(id),FOREIGN KEY(waiter_id) REFERENCES users(id));CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,product_name_snapshot TEXT NOT NULL,unit_price_cents INTEGER NOT NULL,quantity INTEGER NOT NULL,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,amount_cents INTEGER NOT NULL,method TEXT NOT NULL,paid_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id));CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,event_type TEXT NOT NULL,details TEXT,actor_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER,action TEXT NOT NULL,entity_type TEXT,entity_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS cancellation_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,requested_by INTEGER NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),reviewed_by INTEGER,reviewed_at TEXT,decision_note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(requested_by) REFERENCES users(id),FOREIGN KEY(reviewed_by) REFERENCES users(id));CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON cancellation_requests(status,created_at);CREATE UNIQUE INDEX IF NOT EXISTS idx_cancellation_requests_pending_order ON cancellation_requests(order_id) WHERE status='PENDING';CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(completed_at);");
const admin=process.env.ADMIN_USERNAME||"admin",pass=process.env.ADMIN_PASSWORD||"admin";
db.prepare("INSERT OR IGNORE INTO users(username,password_hash,name,role) VALUES(?,?,?,?)").run(admin,bcrypt.hashSync(pass,12),"Administrator","ADMIN");
db.prepare("INSERT OR IGNORE INTO users(username,password_hash,name,role) VALUES(?,?,?,?)").run("kamarieri",bcrypt.hashSync("kamarieri",12),"Kamarieri","KAMARIER");
for(let i=1;i<=50;i++)db.prepare("INSERT OR IGNORE INTO tables_restaurant(id,number) VALUES(?,?)").run(i,i);
const cats=[["Pije",1],["Mish dhe Ushqim",2],["Ëmbëlsira",3],["Menze",4],["Shtesa",5],["Të tjera",6]];
for(const c of cats)db.prepare("INSERT OR IGNORE INTO categories(name,display_order) VALUES(?,?)").run(...c);
const cid=n=>db.prepare("SELECT id FROM categories WHERE name=?").get(n).id;
const ps=[
["Pije","Kokakolla",100,"PIJE"],["Pije","Fanta",100,"PIJE"],["Pije","Birra Peje",100,"PIJE"],["Pije","Schweeps",100,"PIJE"],["Pije","RedBull",150,"PIJE"],["Pije","Golden Eagle",100,"PIJE"],["Pije","Multisola",100,"PIJE"],["Pije","Ice Tea",100,"PIJE"],["Pije","Kafe",70,"KAFE"],["Pije","Qaj",70,"KAFE"],["Pije","Laqin",50,"PIJE"],["Pije","Ujë Mokne",50,"PIJE"],["Pije","Laqko",150,"PIJE"],["Pije","Ice Smirnof",150,"PIJE"],["Pije","Henikeni",150,"PIJE"],["Pije","Bavaria",150,"PIJE"],["Pije","Jagermeister",250,"PIJE"],
["Mish dhe Ushqim","File Pule",300,"USHQIM"],["Mish dhe Ushqim","Mish i Bardh",350,"USHQIM"],["Mish dhe Ushqim","Pule",600,"USHQIM"],["Mish dhe Ushqim","Gjys Pule",300,"USHQIM"],["Mish dhe Ushqim","Kombinim Skare",400,"USHQIM"],["Mish dhe Ushqim","Mish Viqi Natyral",500,"USHQIM"],["Mish dhe Ushqim","Mish Viqi (1kg)",2500,"USHQIM"],["Mish dhe Ushqim","Pleskavicë Sharri",400,"USHQIM"],["Mish dhe Ushqim","Hamburger",200,"USHQIM"],["Mish dhe Ushqim","Hamburger + Pomfrit",250,"USHQIM"],["Mish dhe Ushqim","Hamburger + Mish i Bardh",250,"USHQIM"],["Mish dhe Ushqim","Sandwich Tuna",200,"USHQIM"],["Mish dhe Ushqim","Pjatë ushqimi",500,"USHQIM"],["Mish dhe Ushqim","Qebap (1 copë)",50,"USHQIM"],["Mish dhe Ushqim","Pica Familjare",700,"USHQIM"],["Mish dhe Ushqim","Pica E madhe",400,"USHQIM"],["Mish dhe Ushqim","Pica E mesme",300,"USHQIM"],["Mish dhe Ushqim","Pica E vogel",200,"USHQIM"],
["Ëmbëlsira","Trileqe",150,"EMBELSIRE"],["Ëmbëlsira","Torte Snikers",150,"EMBELSIRE"]
,["Menze","Menze 5€",500,"USHQIM"],["Menze","Menze 10€",1000,"USHQIM"],["Menze","Menze 15€",1500,"USHQIM"],["Menze","Menze 20€",2000,"USHQIM"],["Menze","Menze 25€",2500,"USHQIM"],["Menze","Menze 50€",5000,"USHQIM"]
// Shtesa: porosia "komplet" mbetet me çmimin normal; shtesat e porositura veç pagesë ekstra.
,["Shtesa","Suxhuk (1 copë)",100,"SHTESE"],["Shtesa","Pomfrit (1 porcion)",200,"SHTESE"],["Shtesa","Gjys pomfrit",150,"SHTESE"],["Shtesa","Qepë (1 copë)",100,"SHTESE"],["Shtesa","Spec i pjekur (1 copë)",50,"SHTESE"],["Shtesa","Extra djath",50,"SHTESE"],["Shtesa","Domat tranguj",100,"SHTESE"]
];
const findAnyProduct=db.prepare("SELECT id FROM products WHERE name=? ORDER BY active DESC,id LIMIT 1");
const updateProduct=db.prepare("UPDATE products SET category_id=?,price_cents=?,kind=?,active=1,display_order=? WHERE id=?");
const renameProduct=db.prepare("UPDATE products SET name=? WHERE id=?");
const deactivateOtherNames=db.prepare("UPDATE products SET active=0 WHERE name=? AND id<>?");
const deactivateAlias=db.prepare("UPDATE products SET active=0 WHERE name=? AND id<>?");
const deactivateOtherCategory=db.prepare("UPDATE products SET active=0 WHERE name=? AND category_id<>?");
const insertProduct=db.prepare("INSERT INTO products(category_id,name,price_cents,kind,display_order) VALUES(?,?,?,?,?)");
const renames={"Qebap (1 copë)":["Qebapa","Qebap"],"Birra Peje":["Birra Peje E vogel","Birra Peje E madhe"]};
const sync= db.transaction(function(){
  db.prepare("UPDATE products SET active=0").run();
  db.prepare("UPDATE categories SET active=CASE WHEN name IN ('Pije','Mish dhe Ushqim','Ëmbëlsira','Menze','Shtesa') THEN 1 ELSE 0 END").run();
  ps.forEach(function(p,i){
    const name=p[1],categoryId=cid(p[0]);
    let row=findAnyProduct.get(name);
    const aliases=renames[name]||[];
    if(!row){
      for(const old of aliases){
        const previous=findAnyProduct.get(old);
        if(previous){renameProduct.run(name,previous.id);row={id:previous.id};break}
      }
    }
    if(row){
      updateProduct.run(categoryId,p[2],p[3],i+1,row.id);
      deactivateOtherNames.run(name,row.id);
      deactivateOtherCategory.run(name,categoryId);
      for(const old of aliases)deactivateAlias.run(old,row.id);
    }else{
      insertProduct.run(categoryId,name,p[2],p[3],i+1);
    }
  });
});
sync();
console.log("Baza u krijua dhe menuja u sinkronizua (porositë, pagesat dhe historiku nuk u prekën). Admin:",admin,"/",pass);
db.close();