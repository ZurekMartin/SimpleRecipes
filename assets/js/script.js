const STORAGE_KEYS = Object.freeze({
  theme: 'simplerecipes-theme',
  viewDesktop: 'simplerecipes-view-desktop',
  viewCompact: 'simplerecipes-view-compact',
  cart: 'simplerecipes-cart'
});

const MQ = Object.freeze({
  mobile: matchMedia('(max-width: 639px)'),
  tablet: matchMedia('(max-width: 1023px)'),
  light: matchMedia('(prefers-color-scheme: light)')
});

const KIND_RANK = new Map([['mass', 0], ['volume', 0], ['spoon', 1], ['count', 1], ['pinch', 2]]);

const PLACEHOLDER = Object.freeze({
  wide: 'Hledat název, popis nebo štítek',
  narrow: 'Hledat recept'
});

const collator = new Intl.Collator('cs');
const numberFormat = new Intl.NumberFormat('cs', { maximumFractionDigits: 2 });
const pluralRules = new Intl.PluralRules('cs');
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const GLYPHS = Object.freeze({ 0.25: '¼', 0.5: '½', 0.75: '¾' });

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => escapeMap[char]);

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

const normalizeText = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

const customKey = name => `custom|${normalizeText(name)}`;

const readStorage = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const formatCount = value => {
  const whole = Math.floor(value + 1e-9);
  const rest = Math.round((value - whole) * 100) / 100;
  if (!rest) return numberFormat.format(whole);
  const glyph = GLYPHS[rest];
  if (!glyph) return numberFormat.format(value);
  return whole ? `${whole}${glyph}` : glyph;
};

const niceRound = value => {
  const step = value < 10 ? 1 : value < 100 ? 5 : value < 500 ? 10 : 50;
  return Math.max(step, Math.round(value / step) * step);
};

const roundQuantity = (value, kind, small) => {
  if (value === null) return null;
  if (kind === 'mass' || kind === 'volume') return niceRound(value);
  if (kind === 'spoon') return Math.max(0.5, Math.round(value * 2) / 2);
  if (kind === 'count') return small ? Math.round(value * 100) / 100 : Math.max(1, Math.round(value));
  return value;
};

const scaleRange = (ingredient, kind, servings, base) => {
  const table = ingredient.scale && typeof ingredient.scale === 'object' ? ingredient.scale.table : null;
  const hit = table?.[String(servings)];
  if (hit !== undefined) return Array.isArray(hit) ? hit : [hit, null];
  if (ingredient.scale === 'fixed') return [ingredient.amount ?? null, ingredient.amount_max ?? null];
  const round = value => (typeof value === 'number' ? roundQuantity(value * servings / base, kind, ingredient.small === true) : null);
  return [round(ingredient.amount), round(ingredient.amount_max)];
};

const scaledIngredients = (recipe, servings, dictionary) => {
  const base = recipe.servings || 1;
  return recipe.ingredients.map(ingredient => {
    const kind = ingredient.ref ? 'count' : (dictionary.units[ingredient.unit]?.kind ?? 'mass');
    const [amount, amount_max] = scaleRange(ingredient, kind, servings, base);
    return {
      key: `${ingredient.ref ?? normalizeText(ingredient.name ?? '')}|${ingredient.unit ?? ''}`,
      ref: ingredient.ref ?? null,
      name: ingredient.name ?? null,
      unit: ingredient.unit ?? null,
      small: ingredient.small === true,
      amount,
      amount_max
    };
  });
};

const nounForm = (dictionary, key, n) => dictionary.nouns[key].forms[pluralRules.select(n)];

const toDisplayUnit = (value, unit) => {
  if (unit === 'g' && value >= 1000) return { value: value / 1000, unit: 'kg' };
  if (unit === 'ml' && value >= 1000) return { value: value / 1000, unit: 'l' };
  return { value, unit };
};

const describeCounted = (item, dictionary) => {
  const noun = dictionary.nouns[item.ref];
  if (typeof item.amount !== 'number') return { number: '', unit: '', label: nounForm(dictionary, item.ref, 1) };
  const ranged = typeof item.amount_max === 'number' && item.amount_max !== item.amount;
  const top = ranged ? item.amount_max : item.amount;
  if (item.small) {
    const whole = Math.floor(top + 1e-9);
    if (whole < 1) return { number: '1', unit: '', label: noun.small ?? nounForm(dictionary, item.ref, 1) };
    const number = ranged
      ? `${Math.floor(item.amount + 1e-9)}–${Math.floor(item.amount_max + 1e-9)}`
      : formatCount(whole);
    return { number, unit: '', label: nounForm(dictionary, item.ref, whole) };
  }
  const number = ranged
    ? `${formatCount(item.amount)}–${formatCount(item.amount_max)}`
    : formatCount(item.amount);
  return { number, unit: '', label: nounForm(dictionary, item.ref, top) };
};

const describeItem = (item, dictionary) => {
  if (item.custom) return { number: '', unit: '', label: item.name };
  if (item.ref) return describeCounted(item, dictionary);
  const hasAmount = typeof item.amount === 'number';
  const ranged = typeof item.amount_max === 'number' && item.amount_max !== item.amount;
  const top = ranged ? item.amount_max : item.amount;
  const converted = hasAmount ? toDisplayUnit(top, item.unit) : { value: null, unit: item.unit };
  const factor = hasAmount && converted.unit !== item.unit ? 0.001 : 1;
  const n = hasAmount ? top * factor : 1;
  const number = !hasAmount
    ? ''
    : ranged
      ? `${formatCount(item.amount * factor)}–${formatCount(item.amount_max * factor)}`
      : formatCount(item.amount * factor);
  return {
    number,
    unit: converted.unit ? dictionary.units[converted.unit].forms[pluralRules.select(n)] : '',
    label: item.name ?? ''
  };
};

const lineText = description =>
  [description.number, description.unit, description.label].filter(Boolean).join(' ');

const plainText = description => lineText(description).replace(/ /g, ' ');

const applyTheme = () => {
  const preference = readStorage(STORAGE_KEYS.theme, 'dark');
  const resolved = preference === 'auto' ? (MQ.light.matches ? 'light' : 'dark') : preference;
  document.documentElement.dataset.theme = resolved;
  $$('[data-theme-option]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.themeOption === preference));
  });
};

const initTheme = () => {
  $$('[data-theme-option]').forEach(button => {
    button.addEventListener('click', () => {
      writeStorage(STORAGE_KEYS.theme, button.dataset.themeOption);
      applyTheme();
    });
  });
  MQ.light.addEventListener('change', () => {
    if (readStorage(STORAGE_KEYS.theme, 'dark') === 'auto') applyTheme();
  });
  applyTheme();
};

const fetchJson = async (path, errorMessage) => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(errorMessage);
  return response.json();
};

const loadRecipes = async () => {
  const manifest = await fetchJson('assets/data/manifest.json', 'Manifest se nepodařilo načíst.');
  return Promise.all(manifest.recipes.map(path => fetchJson(path, `Recept ${path} se nepodařilo načíst.`)));
};

const loadDictionary = () => fetchJson('assets/data/lexicon.json', 'Slovník se nepodařilo načíst.');

let dataPromise;
let dictionary = null;

const getData = () => (dataPromise ??= Promise.all([loadRecipes(), loadDictionary()]).then(([recipes, loaded]) => {
  dictionary = loaded;
  return { recipes, dictionary: loaded };
}));

const emptyCart = () => ({ recipes: {}, checked: {}, custom: [] });

let cart = (() => {
  const stored = readStorage(STORAGE_KEYS.cart, null);
  return stored && typeof stored === 'object'
    ? { recipes: stored.recipes ?? {}, checked: stored.checked ?? {}, custom: stored.custom ?? [] }
    : emptyCart();
})();

const persistCart = () => {
  writeStorage(STORAGE_KEYS.cart, cart);
  updateCartBadge();
};

const updateCartBadge = () => {
  const badge = $('#cartBadge');
  if (!badge) return;
  const count = Object.keys(cart.recipes).length + cart.custom.length;
  badge.textContent = count;
  badge.hidden = count === 0;
};

const addRecipeToCart = (recipe, items) => {
  cart.recipes[recipe.id] = {
    id: recipe.id,
    title: recipe.title,
    items: items.map(({ key, ref, name, unit, small, amount, amount_max }) => ({ key, ref, name, unit, small, amount, amount_max }))
  };
  persistCart();
};

const itemRank = (entry, dict) => {
  if (entry.custom) return 4;
  if (entry.ref) return 1;
  if (!entry.unit) return 3;
  return KIND_RANK.get(dict.units[entry.unit].kind) ?? 3;
};

const aggregateCart = dict => {
  const map = new Map();
  Object.values(cart.recipes).forEach(recipe => {
    recipe.items.forEach(item => {
      const entry = map.get(item.key) ?? { key: item.key, ref: item.ref, name: item.name, unit: item.unit, small: item.small, amount: null, amount_max: null, parts: [] };
      if (typeof item.amount === 'number') entry.amount = (entry.amount ?? 0) + item.amount;
      const high = typeof item.amount_max === 'number' ? item.amount_max : item.amount;
      if (typeof high === 'number') entry.amount_max = (entry.amount_max ?? 0) + high;
      entry.parts.push({ title: recipe.title, item });
      map.set(item.key, entry);
    });
  });
  cart.custom.forEach(({ name }) => {
    const key = customKey(name);
    map.set(key, { key, name, custom: true, amount: null, amount_max: null, parts: [] });
  });
  return [...map.values()].sort((a, b) =>
    Number(Boolean(cart.checked[a.key])) - Number(Boolean(cart.checked[b.key]))
    || itemRank(a, dict) - itemRank(b, dict)
    || collator.compare(describeItem(a, dict).label, describeItem(b, dict).label)
  );
};

const cartItemMarkup = (entry, dict) => {
  const checked = Boolean(cart.checked[entry.key]);
  const multi = entry.parts.length > 1;
  const title = capitalize(lineText(describeItem(entry, dict)));
  const parts = multi ? `
    <span class="item-divider"></span>
    <span class="item-parts">${entry.parts.map(part => {
      const described = describeItem(part.item, dict);
      const text = part.item.ref ? plainText(described) : [described.number, described.unit].filter(Boolean).join(' ');
      return `
      <span class="part-line">${esc(text)}<small>${esc(part.title)}</small></span>
    `;
    }).join('')}</span>` : '';
  const remove = entry.custom
    ? `<button type="button" class="item-remove" data-remove-custom="${esc(entry.key)}" aria-label="Odebrat položku">${icon('close')}</button>`
    : '';
  return `
    <div class="cart-row">
      <label class="cart-item${checked ? ' is-checked' : ''}${multi ? ' is-multi' : ''}">
        <input type="checkbox" data-key="${esc(entry.key)}" ${checked ? 'checked' : ''}>
        <span class="item-card">
          <span class="item-title">${esc(title)}</span>
          ${parts}
        </span>
      </label>
      ${remove}
    </div>`;
};

const renderCart = () => {
  const body = $('#cartBody');
  if (!body) return;
  if (!dictionary) {
    getData().then(renderCart).catch(() => {
      body.innerHTML = '<div class="empty-cart"><p>Seznam se nepodařilo zobrazit.</p></div>';
    });
    return;
  }
  const recipes = Object.values(cart.recipes);
  if (!recipes.length && !cart.custom.length) {
    body.innerHTML = '<div class="empty-cart"><p>Seznam je prázdný.</p><p>Suroviny lze přidat z detailu receptu nebo vyhledat výše.</p></div>';
    return;
  }
  const sources = recipes.map(recipe => `
    <span class="tag removable">${esc(recipe.title)}<button type="button" data-remove-recipe="${esc(recipe.id)}" aria-label="Odebrat recept">${icon('close')}</button></span>
  `).join('');
  body.innerHTML = `${sources ? `<div class="cart-sources">${sources}</div>` : ''}<div class="cart-list">${aggregateCart(dictionary).map(entry => cartItemMarkup(entry, dictionary)).join('')}</div>`;
};

const shoppingListText = dict => {
  const lines = aggregateCart(dict)
    .filter(entry => !cart.checked[entry.key])
    .map(entry => `* ${capitalize(plainText(describeItem(entry, dict)))}`);
  return lines.length ? ['Nákupní seznam:', ...lines].join('\n') : '';
};

const shareShoppingList = async event => {
  const button = event.currentTarget;
  let text = '';
  try {
    text = shoppingListText((await getData()).dictionary);
  } catch {
    return;
  }
  if (!text) return;
  await shareContent({ title: 'Nákupní seznam', text }, button);
};

const initCart = () => {
  const dialog = $('#cartModal');
  if (!dialog) return;
  const body = $('#cartBody');

  getData().catch(() => {});

  $('#cartButton')?.addEventListener('click', () => {
    renderCart();
    dialog.showModal();
  });

  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
  });

  body.addEventListener('change', event => {
    const checkbox = event.target.closest('input[data-key]');
    if (!checkbox) return;
    cart.checked[checkbox.dataset.key] = checkbox.checked;
    persistCart();
    renderCart();
  });

  body.addEventListener('click', event => {
    const removeRecipe = event.target.closest('[data-remove-recipe]');
    const removeCustom = event.target.closest('[data-remove-custom]');
    if (removeRecipe) {
      delete cart.recipes[removeRecipe.dataset.removeRecipe];
    } else if (removeCustom) {
      const key = removeCustom.dataset.removeCustom;
      cart.custom = cart.custom.filter(item => customKey(item.name) !== key);
      delete cart.checked[key];
    } else {
      return;
    }
    persistCart();
    renderCart();
  });

  $('#cartShare')?.addEventListener('click', shareShoppingList);

  $('#cartClear')?.addEventListener('click', () => {
    cart = emptyCart();
    persistCart();
    renderCart();
  });

  initCartAdd();
  updateCartBadge();
};

let staplesPromise;

const getStaples = () => (staplesPromise ??= fetchJson('assets/data/staples.json', 'Zásobník se nepodařilo načíst.').catch(() => []));

const initCartAdd = async () => {
  const form = $('#cartAddForm');
  const input = $('#cartAddInput');
  const suggest = $('#cartSuggest');
  if (!form || !input || !suggest) return;

  const staples = await getStaples();
  const isInCart = name => cart.custom.some(item => customKey(item.name) === customKey(name));

  const render = () => {
    const query = normalizeText(input.value);
    const matches = query
      ? staples.filter(name => normalizeText(name).includes(query) && !isInCart(name)).slice(0, 6)
      : [];
    suggest.hidden = matches.length === 0;
    suggest.innerHTML = matches.map(name =>
      `<button type="button" class="cart-suggest-item" data-name="${esc(name)}">${esc(name)}</button>`
    ).join('');
  };

  const addCustom = name => {
    const trimmed = name.trim();
    if (!trimmed || isInCart(trimmed)) return;
    cart.custom.push({ name: trimmed });
    persistCart();
    renderCart();
  };

  const clearInput = () => {
    input.value = '';
    render();
    input.focus();
  };

  input.addEventListener('input', render);

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!input.value.trim()) return;
    addCustom(input.value);
    clearInput();
  });

  suggest.addEventListener('click', event => {
    const button = event.target.closest('[data-name]');
    if (!button) return;
    addCustom(button.dataset.name);
    clearInput();
  });

  render();
};

const indexState = { query: '', tags: new Set(), pantry: new Set() };

const renderChipGroup = (container, values, selected, onChange) => {
  container.innerHTML = values.map(value =>
    `<button type="button" class="chip" data-value="${esc(value)}" aria-pressed="false">${esc(value)}</button>`
  ).join('');
  container.addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    const { value } = button.dataset;
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    button.setAttribute('aria-pressed', String(selected.has(value)));
    onChange();
  });
};

const filterRecipes = recipes => {
  const query = normalizeText(indexState.query);
  return recipes.filter(({ title, description, tags = [], ingredients_types: types = [] }) => {
    if (query && !normalizeText([title, description, ...tags, ...types].join(' ')).includes(query)) return false;
    if (indexState.tags.size && !tags.some(tag => indexState.tags.has(tag))) return false;
    if (indexState.pantry.size && !types.some(type => indexState.pantry.has(type))) return false;
    return true;
  });
};

const recipeUrl = id => new URL(`recipe.html?id=${encodeURIComponent(id)}`, location.href).href;

const shareButton = ({ id, title }) =>
  `<button type="button" class="share-btn" data-share="${esc(id)}" aria-label="Sdílet recept: ${esc(title)}" title="Sdílet">${icon('share')}</button>`;

const flashes = new WeakMap();

const flashButton = (button, markup) => {
  const active = flashes.get(button);
  clearTimeout(active?.timer);
  const original = active?.original ?? button.innerHTML;
  button.innerHTML = markup;
  flashes.set(button, {
    original,
    timer: setTimeout(() => {
      button.innerHTML = original;
      flashes.delete(button);
    }, 1600)
  });
};

const shareContent = async ({ title, text, url }, button) => {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
    } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(url ?? text);
    flashButton(button, icon('copy'));
  } catch {}
};

const shareRecipe = (recipe, button) => shareContent(
  { title: recipe.title, text: recipe.description, url: recipeUrl(recipe.id) },
  button
);

const setMeta = (selector, attribute, value) => {
  document.querySelector(selector)?.setAttribute(attribute, value);
};

const recipeSchema = (recipe, url, dict) => {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    description: recipe.description,
    image: recipe.image,
    url,
    recipeYield: `${recipe.servings} ${nounForm(dict, recipe.servings_unit, recipe.servings)}`,
    recipeCategory: (recipe.tags ?? []).join(', ') || undefined,
    recipeIngredient: scaledIngredients(recipe, recipe.servings, dict).map(item => plainText(describeItem(item, dict))),
    recipeInstructions: (recipe.steps ?? []).map(text => ({ '@type': 'HowToStep', text })),
    inLanguage: 'cs'
  });
  return script;
};

const recipeCard = ({ id, image, title, description, tags = [] }, index) => `
  <article class="recipe-card" style="--i:${index}">
    <a class="card-link" href="recipe.html?id=${encodeURIComponent(id)}">
      <div class="card-media"><img src="${esc(image)}" alt="" loading="lazy" decoding="async"></div>
      <div class="card-body">
        <h2>${esc(title)}</h2>
        <p>${esc(description)}</p>
        <div class="tags">${tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div>
      </div>
    </a>
    ${shareButton({ id, title })}
  </article>`;

const equalizeCardRows = () => {
  const list = $('#recipeList');
  if (!list) return;
  $$('.card-body', list).forEach(body => body.style.removeProperty('height'));
  if (!list.classList.contains('grid')) return;
  const rows = [];
  $$('.recipe-card', list).forEach(card => {
    const last = rows[rows.length - 1];
    if (last && last[0].offsetTop === card.offsetTop) last.push(card);
    else rows.push([card]);
  });
  rows.forEach(row => {
    const bodies = row.map(card => card.querySelector('.card-body'));
    const height = Math.max(...bodies.map(body => body.offsetHeight));
    bodies.forEach(body => { body.style.height = `${height}px`; });
  });
};

const viewKey = () => (MQ.mobile.matches ? STORAGE_KEYS.viewCompact : STORAGE_KEYS.viewDesktop);

const currentView = () => readStorage(viewKey(), MQ.mobile.matches ? 'list' : 'grid');

const initIndex = async () => {
  const list = $('#recipeList');
  const searchInput = $('#searchInput');
  const advancedToggle = $('#advancedToggle');
  const advancedPanel = $('#advancedPanel');
  const emptyState = $('#emptyState');
  const viewButtons = $$('[data-view]');

  let recipes;
  try {
    ({ recipes } = await getData());
  } catch {
    list.innerHTML = '<p class="empty">Recepty se nepodařilo načíst.</p>';
    return;
  }

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-share]');
    if (!button) return;
    const recipe = recipes.find(item => item.id === button.dataset.share);
    if (recipe) shareRecipe(recipe, button);
  });

  const render = () => {
    const filtered = filterRecipes(recipes);
    list.innerHTML = filtered.map(recipeCard).join('');
    emptyState.hidden = filtered.length > 0;
    equalizeCardRows();
  };

  const applyView = view => {
    list.classList.toggle('grid', view !== 'list');
    list.classList.toggle('list', view === 'list');
    list.classList.toggle('compact', view === 'list' && MQ.mobile.matches);
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    equalizeCardRows();
  };

  const syncPlaceholder = () => {
    searchInput.placeholder = MQ.mobile.matches ? PLACEHOLDER.narrow : PLACEHOLDER.wide;
  };

  renderChipGroup($('#tagChips'), uniqueSorted(recipes.flatMap(recipe => recipe.tags ?? [])), indexState.tags, render);
  renderChipGroup($('#pantryChips'), uniqueSorted(recipes.flatMap(recipe => recipe.ingredients_types ?? [])), indexState.pantry, render);

  searchInput.addEventListener('input', ({ target }) => {
    indexState.query = target.value;
    render();
  });

  advancedToggle.addEventListener('click', () => {
    const willOpen = advancedPanel.hidden;
    advancedPanel.hidden = !willOpen;
    advancedToggle.setAttribute('aria-expanded', String(willOpen));
  });

  viewButtons.forEach(button => {
    button.addEventListener('click', () => {
      writeStorage(viewKey(), button.dataset.view);
      applyView(button.dataset.view);
    });
  });

  MQ.mobile.addEventListener('change', syncPlaceholder);
  MQ.mobile.addEventListener('change', () => {
    applyView(currentView());
  });

  syncPlaceholder();
  applyView(currentView());
  render();

  let resizeFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(equalizeCardRows);
  });
  document.fonts?.ready.then(equalizeCardRows);
};

const uniqueSorted = values => [...new Set(values)].sort(collator.compare);

const initWakeLock = button => {
  let sentinel = null;
  let wanted = false;

  const setPressed = pressed => button.setAttribute('aria-pressed', String(pressed));

  const acquire = async () => {
    try {
      sentinel = await navigator.wakeLock.request('screen');
      setPressed(true);
      sentinel.addEventListener('release', () => {
        sentinel = null;
        setPressed(false);
      });
    } catch {
      sentinel = null;
      setPressed(false);
    }
  };

  button.addEventListener('click', async () => {
    wanted = !wanted;
    if (wanted) {
      await acquire();
      wanted = sentinel !== null;
    } else {
      await sentinel?.release();
      setPressed(false);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wanted && !sentinel) acquire();
  });
};

const addButtonMarkup = done => `${icon(done ? 'check' : 'list-plus')}<span class="btn-label">${done ? 'Přidáno do seznamu' : 'Přidat do seznamu'}</span>`;

const renderRecipe = (recipe, root, dict) => {
  const base = recipe.servings || 1;
  let current = base;

  const tags = (recipe.tags ?? []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('');
  const steps = (recipe.steps ?? []).map((step, index) => `
    <li style="--i:${index}"><span class="step-no">${index + 1}</span><p>${esc(step)}</p></li>`).join('');
  const hasSteps = (recipe.steps ?? []).length > 0;

  root.innerHTML = `
    <section class="recipe-hero">
      <img src="${esc(recipe.image)}" alt="" fetchpriority="high" decoding="async">
      ${shareButton(recipe)}
      <div class="recipe-hero-text">
        <div class="tags">${tags}</div>
        <h1>${esc(recipe.title)}</h1>
      </div>
    </section>
    <p class="lead">${esc(recipe.description)}</p>
    <div class="recipe-layout${hasSteps ? '' : ' single'}">
      <section class="panel">
        <div class="panel-head">
          <h2>Suroviny</h2>
          <div class="servings">
            <div class="stepper" role="group" aria-label="Počet">
              <button type="button" class="step-btn" data-step="-1" aria-label="Méně">${icon('minus')}</button>
              <output aria-live="polite">${base}</output>
              <button type="button" class="step-btn" data-step="1" aria-label="Více">${icon('plus')}</button>
            </div>
            <span class="servings-unit">${esc(nounForm(dict, recipe.servings_unit, base))}</span>
          </div>
        </div>
        <ul class="ingredient-list"></ul>
        <div class="actions">
          <button type="button" class="btn ghost btn-wake" aria-pressed="false">${icon('screen')}<span class="btn-label">Nezhasínat displej</span></button>
          <button type="button" class="btn primary btn-add" aria-label="Přidat do seznamu">${addButtonMarkup(false)}</button>
        </div>
      </section>
      ${hasSteps ? `<section class="panel steps-panel">
        <h2>Postup</h2>
        <ol class="steps">${steps}</ol>
      </section>` : ''}
    </div>`;

  const output = $('output', root);
  const servingsUnit = $('.servings-unit', root);
  const ingredientList = $('.ingredient-list', root);
  const addButton = $('.btn-add', root);
  const wakeButton = $('.btn-wake', root);

  const currentItems = () => scaledIngredients(recipe, current, dict);

  const drawIngredients = () => {
    output.textContent = String(current);
    servingsUnit.textContent = nounForm(dict, recipe.servings_unit, current);
    ingredientList.innerHTML = currentItems().map(item => {
      const described = describeItem(item, dict);
      return `
      <li>
        <span class="ing-qty">${esc(described.number)}</span>
        <span class="ing-name">${esc([described.unit, described.label].filter(Boolean).join(' '))}</span>
      </li>`;
    }).join('');
  };

  root.addEventListener('click', event => {
    const shareTarget = event.target.closest('[data-share]');
    if (shareTarget) {
      shareRecipe(recipe, shareTarget);
      return;
    }
    const stepButton = event.target.closest('[data-step]');
    if (!stepButton) return;
    const next = current + Number(stepButton.dataset.step);
    if (next < 1 || next > 20) return;
    current = next;
    drawIngredients();
  });

  addButton.addEventListener('click', () => {
    addRecipeToCart(recipe, currentItems());
    flashButton(addButton, addButtonMarkup(true));
  });

  if ('wakeLock' in navigator) {
    initWakeLock(wakeButton);
  } else {
    wakeButton.hidden = true;
  }

  drawIngredients();
};

const initRecipe = async () => {
  const article = $('#recipeArticle');
  const errorBox = $('#recipeError');
  const id = new URLSearchParams(location.search).get('id');

  let data;
  try {
    data = await getData();
  } catch {
    errorBox.hidden = false;
    return;
  }

  const recipe = data.recipes.find(item => item.id === id);
  if (!recipe) {
    errorBox.hidden = false;
    return;
  }

  const url = recipeUrl(recipe.id);
  setMeta('link[rel="canonical"]', 'href', url);
  setMeta('meta[property="og:url"]', 'content', url);
  setMeta('meta[name="description"]', 'content', recipe.description);
  setMeta('meta[property="og:description"]', 'content', recipe.description);
  const image = new URL(recipe.image, location.href).href;
  setMeta('meta[property="og:image"]', 'content', image);
  document.head.append(recipeSchema({ ...recipe, image }, url, data.dictionary));
  renderRecipe(recipe, article, data.dictionary);
};

initTheme();
initCart();

if ($('#recipeList')) initIndex();
if ($('#recipeArticle')) initRecipe();
