# Sharri Restaurant POS

Sistem i brendshëm për kamarierë dhe administratë, i ndërtuar për marrje të shpejtë të porosive.

## Gjuha
Ndërfaqja është vetëm në shqip/Kosovo Albanian.

## Rregullat kryesore
- 50 tavolina fizike.
- Ekrani i kamarierit tregon vetëm porositë aktive.
- Pas pagesës, porosia largohet nga aktivet dhe ruhet në Historik.
- Butoni kryesor është POROSI E RE.
- Me veti lejohet vetëm kur porosia ka ushqim.
- Për këtu lejohet vetëm kur porosia ka ushqim.
- Porosi vetëm me pije/kafe duhet të lidhet me tavolinë ose emër.
- Tavolina e njëjtë nuk mund të ketë dy porosi aktive normale.
- Pagesa regjistrohet vetëm një herë dhe ruhet me kohë, kamarier dhe mënyrë pagese.
- Çdo produkt ruan kohën kur u regjistrua; shtimet, ndryshimet e sasisë dhe heqjet ruhen në kronologjinë e porosisë bashkë me kamarierin.
- Çdo artikull mund të ketë **shenim** (p.sh. “Komplet me majonez”, “Pa qepë”, “Pa tranguj”). Shenimi nuk e ndryshon çmimin: porosia **komplet** mbetet me çmimin normal të produktit, ndërsa shtesat e porositura veç (Suxhuk, Pomfrit, Extra djath...) paguhen ekstra. Shenimi shfaqet te porosia aktive dhe te historiku, dhe ndryshimi i tij ruhet në kronologji.
- Këto orë shfaqen te porosia aktive dhe te detajet e porosisë në historikun e administratës, për krahasim me kamerat.
- Çdo veprim i rëndësishëm ruhet në gjurmët e sistemit.

## Nisja
Kërkohet Node.js 20+.

1. Kopjo .env.example në .env.
2. Ndrysho SESSION_SECRET për përdorim real.
3. Instalo varësitë: npm install
4. Nis: npm start
5. Hape: http://localhost:3000

Baza krijohet automatikisht në data/sharri.db.

## Menuja dhe fotot
- Çmimet ruhen në cent, shfaqen në euro: Hamburger 2.00€, Hamburger + Pomfrit 2.50€, Qebap (1 copë) 0.50€, Pjatë ushqimi 5.00€, Pica e madhe 4.00€, Pica familjare 7.00€, Pica e mesme 3.00€, Pica e vogel 2.00€.
- Kategoria **Shtesa** mban shtesat me çmim të vetin: Suxhuk (1 copë) 1.00€, Pomfrit (1 porcion) 2.00€, Gjys pomfrit 1.50€, Qepë (1 copë) 1.00€, Spec i pjekur (1 copë) 0.50€, Extra djath 0.50€, Domat tranguj 1.00€. Shtesat nuk e bëjnë porosinë "komplet" dhe nuk numërohen si ushqim (porosi vetëm me shtesa nuk lejohet si "Me veti"/"Për këtu").
- Birrat janë në kategorinë **Pije**: Birra Peje E vogel, Birra Peje E madhe (e njëjta foto për të dyja), Laqko (Laško), Bavaria, Ice Smirnof, Henikeni. Laqko nuk lidhet kurrë me foto torte.
- Jägermeister (liker bimore, 35%) është në **Pije** me 2.50€ për porcion (1.00€–4.00€ është intervali i lejuar; për ta ndryshuar çmimin ndrysho `db.js` dhe ekzekuto `npm run seed`). Foto: `public/images/jagermeister.png`.
- Fotot janë foto reale produkti/stock, të ruajtura lokalisht në `public/images` dhe lidhen në `public/app.js` (`productPhoto`). Nuk ka hotlink. Burimet: `public/images/ASSET-CREDITS.md`.

## Sinkronizimi i menusë në një bazë ekzistuese
Serveri nuk e rimbjell menunë automatikisht. Pasi ndryshon `db.js`, ekzekuto një herë:

    npm run seed

Seed-i është idempotent dhe nuk fshin porosi, pagesa apo snapshot-e historike: çaktivizon rreshtat e vjetër të zhvendosur, i riemërton (`Qebapa` → `Qebap (1 copë)`), i zhvendos produktet në kategorinë e saktë dhe përditëson çmimet. Mos e fshij `data/sharri.db`.

## Hyrjet fillestare
Administrator: admin / admin
Kamarier: kamarieri / kamarieri

Ndrysho fjalëkalimet para përdorimit real.

## Backend
- Express
- SQLite me WAL
- bcrypt për fjalëkalime
- session HTTP-only
- validim server-side
- audit logs
- historik i pagesave
- snapshot i emrit dhe çmimit të produktit në momentin e porosisë

## Kontrolli
GitHub Actions kontrollon sintaksën e backend-it, JavaScript-in e frontendit dhe seed-in e bazës.

Lokalisht:

    npm test

Kontrolli përfshin: sintaksën (`node --check` për `server.js`, `db.js`, `public/app.js`), menunë dhe çmimet në bazë (përfshirë *Shtesa* dhe *Pjatë ushqimi*), mapimin e fotove në frontend, migrimin e një baze ekzistuese pa prekur porositë/pagesat, dhe rrjedhën e kamarierit në "POROSI E RE" (fotot nën *Pije* dhe *Mish dhe Ushqim*, për porosi të re dhe aktive, si dhe shenimet e artikujve: “komplet” mbetet çmim normal, shtesa veç, ndryshimi i shenimit në kronologji).

Shënim: `better-sqlite3` kompilohet në instalim. Përdor Node 22 (p.sh. me `fnm use 22`); Node 26+ nuk e kompilon versionin 11.x.
