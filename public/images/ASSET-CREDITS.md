# Image asset sources

All menu images are ordinary product/stock photography (not AI-generated) and are stored locally in `public/images/`. The app never hotlinks third-party hosts: each card loads `/images/<name>.jpg` from this folder.

## Drinks

| File | Product | Source |
| --- | --- | --- |
| `coca-cola.jpg` | Kokakolla | [Pexels, Coke bottle photography](https://www.pexels.com/search/coke%20bottle/) |
| `fanta.jpg` | Fanta | [Fanta Orange product listing](https://www.amazon.com/Fanta-Orange-500ml/dp/B005LLZD78) |
| `schweppes.jpg` | Schweeps | [Schweppes product listing](https://amazon.com/clp/B00H3T1CUS) |
| `red-bull.jpg` | RedBull | [Red Bull product photo](https://howtomarkettome.com/original-red-bull-can) |
| `golden-eagle.jpg` | Golden Eagle | [AlbProducts, Golden Eagle Energy Drink](https://albproducts.com/products/golden-eagle-energy-drink) |
| `juice.jpg` | Juice / fresh drinks | [Pexels, orange juice](https://www.pexels.com/photo/breakfast-morning-orange-juice-3558/) |
| `laqin.jpg` | Laqin (house lemonade / lemon drink) | [Pexels, lemonade in a bottle with lemon wedge and straw](https://www.pexels.com/photo/lemonade-in-a-bottle-18223320/) |
| `coffee.jpg` | Kafe | [Pexels, coffee cup](https://www.pexels.com/photo/overhead-view-of-a-cup-of-coffee-23031405/) |
| `tea.jpg` | Qaj | [Pexels, black tea](https://www.pexels.com/search/black%20tea/) |

Note on `laqin.jpg`: "Laqin" is the house lemonade / lemon drink of the Sharri menu (Pije, 0.50 €) — no commercial brand of that name exists, so a real stock photo of a lemon drink was chosen. The photo is genuine Pexels photography (not AI-generated); because the Pexels CDN was unreachable from the build sandbox, the file was taken from Pexels' 500 px preview rendition and optimized to 720 px width with ImageMagick (`-resize 720x -strip -quality 82`), stored locally like every other menu image.

## Beers

All four beers live in the **Pije** category. `birra-peja.jpg` is the photo of the single merged `Birra Peje` product (the legacy rows `Birra Peje E vogel` / `Birra Peje E madhe` were merged into it and deactivated, the image file is unchanged); `laqko.jpg` is Laško beer (Zlatorog lager), never a cake.

| File | Product | Source |
| --- | --- | --- |
| `birra-peja.jpg` | Birra Peje (merged from the legacy `Birra Peje E vogel` + `Birra Peje E madhe`) | [BeerTasting, Peja Pilsner](https://www.beertasting.com/en/beers/peja-pilsner) |
| `lasko.jpg` | Laqko (Laško) | [Crafted by PES, Laško Zlatorog bottle](https://craftedbypes.com/bottle-opener-ideas) |
| `bavaria.jpg` | Bavaria | [Bavaria bottle & glass product image](https://www.alibaba.com/showroom/bavaria-beer-price.html) |
| `smirnoff-ice.jpg` | Ice Smirnof | [Kroger, Smirnoff Ice Original](https://www.kroger.com/p/smirnoff-ice-original-flavored-hard-beverage-single-bottle/0008200072384) |
| `heineken.jpg` | Henikeni | [Ocado, Heineken Lager bottles](https://zoom.ocado.com/heineken-lager-beer-bottles-4-x-330ml) |

## Food

| File | Product | Source |
| --- | --- | --- |
| `qebap.jpg` | Qebap (1 copë) | [WanderCook, Balkan Ćevapi](https://www.wandercooks.com/cevapi-balkan-homemade-sausage-recipe/) |
| `trileqe.jpg` | Trileqe | [Unicorns in the Kitchen, Trilece Turkish Milk Cake](https://www.unicornsinthekitchen.com/trilece-turkish-milk-cake/) |
| `snickers-cake.jpg` | Torte Snikers | Bundled with the earlier menu photo set |
| `burger-sandwich.jpg` | Hamburger / Hamburger + Pomfrit | Bundled with the earlier menu photo set |
| `pizza.jpg` | Pica (all sizes) | Bundled with the earlier menu photo set |
| `tuna-sandwich.jpg` | Sandwich Tuna | Bundled with the earlier menu photo set |
| `grilled-chicken.jpg` | Pule / File Pule / Gjys Pule | Bundled with the earlier menu photo set |
| `grill-platter.jpg` | Default Mish dhe Ushqim / Menze | Bundled with the earlier menu photo set |

Product-brand trademarks remain with their owners. Verify image usage rights for your production deployment before going live.
