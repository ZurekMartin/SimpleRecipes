# SimpleRecipes

Receptář s nespočtem surovin, nákupním seznamem a funkcí sdílením. Open source (MIT), hostováno na GitHub Pages jako `https://recipes.zurekmartin.cz`. Obsah i rozhraní jsou v češtině (`lang="cs"`).

## Technologie

- HTML5, CSS3 (vnořování selektorů, `light-dark()`, `oklch()`), vanilla JavaScript (ES2022).
- Bez frameworku, bundleru a runtime závislostí.
- Stav v `localStorage`: téma (`simplerecipes-theme`), režim zobrazení, košík (`simplerecipes-cart`).
- Hosting: GitHub Pages z větve `main`. `CNAME` nastavuje doménu.

## Struktura

```
index.html                          přehled receptů, vyhledávání, filtry, sdílení
recipe.html                         detail receptu (?id=<id>), obsah renderuje JS
CNAME                               CNAME config
LICENCE                             MIT licence
robots.txt, sitemap.xml, llms.txt   SEO soubory v kořeni
assets/css/styles.css               veškerý styl, téma přes data-theme
assets/js/script.js                 veškerá logika
assets/data/manifest.json           seznam cest k receptům
assets/data/<id>.json               jeden recept
assets/data/staples.json            zásobník položek pro nákupní seznam
assets/img/favicon.png              favicon a og:image
```

## Data receptu

```json
{
  "id": "pizza-dough",
  "title": "string",
  "description": "string, jedna až dvě věty",
  "image": "absolutní URL",
  "servings": 4,
  "servings_unit": "ks",
  "tags": ["Slané", "Pizza"],
  "ingredients_types": ["Hladká mouka"],
  "ingredients": [{ "name": "hladké mouky", "amount": 250, "amount_max": 300, "unit": "g" }],
  "steps": ["string"]
}
```

- `tags` tvoří filtr „Kategorie“, `ingredients_types` filtr „Co mám doma“.
- `amount: null` znamená neměřitelné množství, `amount_max` vytváří rozsah.
- Nový recept přidat do `manifest.json` a aktualizovat `sitemap.xml` a `llms.txt`.

## Funkce

- **Přehled:** fulltextové hledání přes název, popis, štítky a suroviny. Filtry jsou OR uvnitř skupiny a AND mezi skupinami. Zobrazení seznam nebo karty, uložené zvlášť pro desktop a mobil.
- **Detail:** přepočet surovin stepperem 1–20 porcí (lineární škálování), přidání do košíku, volba „Nezhasínat displej“ (Screen Wake Lock).
- **Košík:** agregace surovin z receptů přes `název|jednotka`, sčítání rozsahů, rozpad podle receptů. Vlastní položky (`custom`) z vyhledávacího pole, které nabízí zásobník. Odškrtnuté položky se přeškrtnou a řadí dolů. Sdílení odešle nezaškrtnuté položky jako text.
- **Sdílení:** `navigator.share`, jinak kopie do schránky. Když sdílení není dostupné, tlačítko zobrazuje ikonu kopírování.
- **Téma:** světlé, tmavé nebo podle zařízení.

## Konvence

- Identifikátory v kódu anglicky, obsah česky.
- Kód bez komentářů.
- Žádné závislosti ani build krok. Zachovat.
- Ikony jsou SVG `<symbol>` ve sprite každé stránky. Nová ikona se doplňuje do obou sprite (`index.html`, `recipe.html`).
- Všechna vyhledávání ignorují diakritiku a velikost písmen (`normalizeText`).
- Vstupy do `innerHTML` procházejí přes `esc()`.
- Breakpointy: mobil do 639 px, tablet do 1023 px.

## SEO

- Titulek je statický: `SimpleRecipes · Recepty` na přehledu, `SimpleRecipes · Recept` na detailu. Název receptu do titulku nepatří.
- Detail nastavuje `canonical`, `og:url`, `og:image`, `meta description` a JSON-LD `Recipe` podle konkrétního receptu. Přehled má JSON-LD `WebSite`.
- Obecná adresa `recipe.html` bez `id` není v sitemapě.

## Známá omezení

- Recepty se renderují v JS. Crawler bez vykonávání skriptů vidí jen šablonu detailu.
- Chybí offline režim (service worker, web manifest).
- Košík je lokální pro jeden prohlížeč a nesynchronizuje se.
