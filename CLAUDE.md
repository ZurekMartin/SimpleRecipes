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
LICENSE                             MIT licence
robots.txt, sitemap.xml, llms.txt   SEO soubory v kořeni
assets/css/styles.css               veškerý styl, téma přes data-theme
assets/js/script.js                 veškerá logika
assets/data/manifest.json           seznam cest k receptům
assets/data/<id>.json               jeden recept
assets/data/lexicon.json            české tvary jednotek, substantiv a počtu porcí
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
  "servings_unit": "kus",
  "tags": ["Slané", "Pizza"],
  "ingredients_types": ["Hladká mouka"],
  "ingredients": [
    { "name": "hladké mouky", "amount": 250, "amount_max": 300, "unit": "g" },
    { "name": "kypřícího prášku do pečiva", "amount": 1, "unit": "cajova-lzicka" },
    { "ref": "vejce", "amount": 1, "scale": "fixed" }
  ],
  "steps": ["string"]
}
```

- `servings_unit` je klíč z `lexicon.nouns` (`porce`, `pizza`, `kus`). Skloňuje se podle počtu porcí.
- `unit` je klíč z `lexicon.units`. Druh (`kind`) určuje zaokrouhlování: `mass` a `volume` na 1 pod 10, na 5 pod 100, na 10 pod 500, jinak na 50 (u hodnot pod 10 g raději čajová lžička), `spoon` na celé nebo půl, `count` na celá čísla, `pinch` se nemění. Polévková a čajová lžíce jsou různé jednotky (`polevkova-lzice`, `cajova-lzicka`) a jednotka se při přepočtu nikdy nemění.
- `"small": true` u počitatelného substantiva (cibule) znamená, že se počítá po kusech dolů. Části kusu se sčítají přes recepty v košíku a celý kus se ukáže až při součtu alespoň 1. Menší než 1 se zobrazuje jako „1 malá cibule“ (`nouns.<klíč>.small`).
- Položka s `name` a `unit` je neutrální surovina. Položka s `ref` je počitatelné substantivum z `lexicon.nouns` a skloňuje se podle množství. Poznámky typu „nakrájená“ nebo „ušlehané“ se v surovinách nezobrazují.
- `amount: null` znamená neměřitelné množství. `amount_max` vytváří rozsah.
- `scale: "fixed"` drží množství při každém počtu porcí (např. vejce na potření).
- `scale: { "table": { "2": 1, "4": [2, 3] } }` přepíše výpočet pro zvolený počet porcí. Hodnota může být číslo, nebo pole `[amount, amount_max]`.
- `tags` tvoří filtr „Kategorie“, `ingredients_types` filtr „Co mám doma“.
- Výchozí množství receptu se nesmí změnit bez výslovné žádosti. Škálování běží jen v JS.
- Nový recept přidat do `manifest.json` a obnovit `sitemap.xml` a `llms.txt`.
- Nová jednotka, substantivum nebo tvar porcí patří do `lexicon.json`, ne do receptu.
- Skloňování a zaokrouhlování jde výhradně přes pomocné funkce v `script.js` (`formatCount`, `roundQuantity`, `nounForm`, `describeItem`). Text se nikde neskládá ručně.

## Funkce

- **Přehled:** fulltextové hledání přes název, popis, štítky a suroviny. Filtry jsou OR uvnitř skupiny a AND mezi skupinami. Zobrazení seznam nebo karty, uložené zvlášť pro desktop a mobil. Karty v mřížce jsou čtvercové, výška textové části se počítá pro každý řádek zvlášť podle nejvyššího obsahu (`equalizeCardRows`) a obrázek vyplní zbytek karty.
- **Detail:** stepper 1–20 porcí přepočítá suroviny nelineárně podle druhu jednotky (`scaledIngredients`). Skloňují se počet porcí, jednotky a počitatelná substantiva. Přidání do košíku, volba „Nezhasínat displej“ (Screen Wake Lock).
- **Košík:** agregace surovin z receptů přes `key` (`ref` nebo `název|jednotka`), sčítání rozsahů, rozpad podle receptů. Vlastní položky (`custom`) z vyhledávacího pole, které nabízí zásobník. Odškrtnuté položky se přeškrtnou a řadí dolů. Části jedné suroviny z více receptů se sčítají před zaokrouhlením. Sdílení odešle nezaškrtnuté položky jako text bez nezalomitelných mezer.
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
- Hlavička a patička jsou v toku dokumentu, nejsou fixované. Mezera nad patičkou je stejná jako mezera hlavička–obsah (`--space`).

## SEO

- Titulek je statický: `SimpleRecipes · Recepty` na přehledu, `SimpleRecipes · Recept` na detailu. Název receptu do titulku nepatří.
- Detail nastavuje `canonical`, `og:url`, `og:image`, `meta description` a JSON-LD `Recipe` podle konkrétního receptu. JSON-LD `recipeIngredient` obsahuje přepočtené suroviny pro výchozí počet porcí. Přehled má JSON-LD `WebSite`.
- Obecná adresa `recipe.html` bez `id` není v sitemapě.
