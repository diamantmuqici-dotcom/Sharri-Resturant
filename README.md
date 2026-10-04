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
- Çdo veprim i rëndësishëm ruhet në gjurmët e sistemit.

## Nisja
Kërkohet Node.js 20+.

1. Kopjo .env.example në .env.
2. Ndrysho SESSION_SECRET për përdorim real.
3. Instalo varësitë: npm install
4. Nis: npm start
5. Hape: http://localhost:3000

Baza krijohet automatikisht në data/sharri.db.

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
