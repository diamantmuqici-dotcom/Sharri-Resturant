const Database=require("better-sqlite3");
const bcrypt=require("bcryptjs");
const fs=require("fs"),path=require("path");
require("dotenv").config();
fs.mkdirSync(path.join(__dirname,"data"),{recursive:true});
const db=new Database(path.join(__dirname,"data","sharri.db"));
db.pragma("journal_mode=WAL");
db.pragma("foreign_keys=ON");
db.exec("CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS tables_restaurant(id INTEGER PRIMARY KEY,number INTEGER UNIQUE NOT NULL,active INTEGER DEFAULT 1);CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE NOT NULL,display_order INTEGER DEFAULT 0,active INTEGER DEFAULT 1);CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,category_id INTEGER NOT NULL,name TEXT NOT NULL,price_cents INTEGER NOT NULL,kind TEXT NOT NULL,active INTEGER DEFAULT 1,display_order INTEGER DEFAULT 0,FOREIGN KEY(category_id) REFERENCES categories(id));CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,order_number INTEGER UNIQUE NOT NULL,order_type TEXT NOT NULL,table_id INTEGER,custom_identifier TEXT,waiter_id INTEGER NOT NULL,status TEXT DEFAULT 'ACTIVE',total_cents INTEGER DEFAULT 0,opened_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,notes TEXT,FOREIGN KEY(table_id) REFERENCES tables_restaurant(id),FOREIGN KEY(waiter_id) REFERENCES users(id));CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,product_name_snapshot TEXT NOT NULL,unit_price_cents INTEGER NOT NULL,quantity INTEGER NOT NULL,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,amount_cents INTEGER NOT NULL,method TEXT NOT NULL,paid_at TEXT DEFAULT CURRENT_TIMESTAMP,created_by INTEGER NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id));CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,event_type TEXT NOT NULL,details TEXT,actor_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER,action TEXT NOT NULL,entity_type TEXT,entity_id INTEGER,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(completed_at);");
const admin=process.env.ADMIN_USERNAME||"admin",pass=process.env.ADMIN_PASSWORD||"admin";
db.prepare("INSERT OR IGNORE INTO users(username,password_hash,name,role) VALUES(?,?,?,?)").run(admin,bcrypt.hashSync(pass,12),"Administrator","ADMIN");
db.prepare("INSERT OR IGNORE INTO users(username,password_hash,name,role) VALUES(?,?,?,?)").run("kamarieri",bcrypt.hashSync("kamarieri",12),"Kamarieri","KAMARIER");
for(let i=1;i<=50;i++)db.prepare("INSERT OR IGNORE INTO tables_restaurant(id,number) VALUES(?,?)").run(i,i);
const cats=[["Pije",1],["Mish dhe Ushqim",2],["Ëmbëlsira",3],["Të tjera",4]];
for(const c of cats)db.prepare("INSERT OR IGNORE INTO categories(name,display_order) VALUES(?,?)").run(...c);
const cid=n=>db.prepare("SELECT id FROM categories WHERE name=?").get(n).id;
const ps=[
["Pije","Kokakolla",100,"PIJE"],["Pije","Fanta",100,"PIJE"],["Pije","Birrë Pejë E vogël",100,"PIJE"],["Pije","Birrë Pejë E madhe",100,"PIJE"],["Pije","Schweppes",100,"PIJE"],["Pije","RedBull",150,"PIJE"],["Pije","Golden Eagle",100,"PIJE"],["Pije","Kafe",70,"KAFE"],["Pije","Çaj",70,"KAFE"],["Pije","Laqin",50,"PIJE"],["Pije","Ice Smirnof",150,"PIJE"],["Pije","Henikeni",150,"PIJE"],["Pije","Bavaria",150,"PIJE"],
["Mish dhe Ushqim","File Pule",300,"USHQIM"],["Mish dhe Ushqim","Mish i Bardhë",350,"USHQIM"],["Mish dhe Ushqim","Pule",600,"USHQIM"],["Mish dhe Ushqim","Gjys Pule",300,"USHQIM"],["Mish dhe Ushqim","Kombinim Skare",400,"USHQIM"],["Mish dhe Ushqim","Mish Viqi Natyral",500,"USHQIM"],["Mish dhe Ushqim","Mish Viqi (1kg)",2500,"USHQIM"],["Mish dhe Ushqim","Pleskavicë Sharri",400,"USHQIM"],["Mish dhe Ushqim","Hamburger + Pomfrit",250,"USHQIM"],["Mish dhe Ushqim","Hamburger",250,"USHQIM"],["Mish dhe Ushqim","Pleskavicë",250,"USHQIM"],["Mish dhe Ushqim","Mish Pule",250,"USHQIM"],["Mish dhe Ushqim","Sandwich Proshut",200,"USHQIM"],["Mish dhe Ushqim","Sandwich Tuna",200,"USHQIM"],["Mish dhe Ushqim","Sandwich Mish Pule",250,"USHQIM"],["Mish dhe Ushqim","Sandwich Mish i Bardhë",250,"USHQIM"],
["Ëmbëlsira","Trileqe",150,"EMBELSIRE"],["Ëmbëlsira","Torte Snikers",150,"EMBELSIRE"],["Ëmbëlsira","Laqko",150,"EMBELSIRE"],];const findProduct=db.prepare("SELECT id FROM products WHERE category_id=? AND name=? ORDER BY id LIMIT 1");
const deactivateDuplicates=db.prepare("UPDATE products SET active=0 WHERE category_id=? AND name=? AND id<>?");
const insertProduct=db.prepare("INSERT INTO products(category_id,name,price_cents,kind,display_order) VALUES(?,?,?,?,?)");
const sync= db.transaction(function(){
  ps.forEach(function(p,i){
    const categoryId=cid(p[0]);
    const existing=findProduct.get(categoryId,p[1]);
    if(existing){
        db.prepare("UPDATE products SET price_cents=?,kind=?,active=1,display_order=? WHERE id=?").run(p[2],p[3],i+1,existing.id);
      deactivateDuplicates.run(categoryId,p[1],existing.id);
    }else{
      insertProduct.run(categoryId,p[1],p[2],p[3],i+1);
    }
  });
});
sync();
console.log("Baza u krijua dhe menuja u pastrua nga dublikatat. Admin:",admin,"/",pass);
db.close();