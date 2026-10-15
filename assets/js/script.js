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

const UNIT_ORDER = new Map([
  ['g', 0], ['kg', 0], ['ml', 0], ['dl', 0], ['l', 0],
  ['ks', 1], ['kus', 1], ['kusy', 1], ['stroužek', 1], ['stroužky', 1],
  ['špetka', 2]
]);

const MASS_VOLUME_PATTERN = /lžič|lžíc|hrnek|šálek|ml|dl|cl|\bl\b|kg|\bg\b/;

const PLACEHOLDER = Object.freeze({
  wide: 'Hledat název, popis nebo štítek',
  narrow: 'Hledat'
});

const collator = new Intl.Collator('cs');
const numberFormat = new Intl.NumberFormat('cs', { maximumFractionDigits: 2 });
const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

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

const formatAmount = (amount, max) => {
  if (typeof amount !== 'number') return '';
  const from = numberFormat.format(amount);
  return typeof max === 'number' && max !== amount ? `${from}–${numberFormat.format(max)}` : from;
};

const formatLine = ({ name, unit, amount, amount_max }) =>
  [formatAmount(amount, amount_max), unit, name].filter(Boolean).join(' ');

const unitRank = unit => {
  const key = (unit || '').trim().toLowerCase();
  if (MASS_VOLUME_PATTERN.test(key)) return 0;
  return UNIT_ORDER.get(key) ?? 3;
};

const itemKey = ({ name, unit }) => `${name.trim().toLowerCase()}|${(unit || '').trim().toLowerCase()}`;

const uniqueSorted = values => [...new Set(values)].sort(collator.compare);

const scaleIngredient = (ingredient, factor) => ({
  name: ingredient.name,
  unit: ingredient.unit || '',
  amount: typeof ingredient.amount === 'number' ? ingredient.amount * factor : null,
  amount_max: typeof ingredient.amount_max === 'number' ? ingredient.amount_max * factor : null
});

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

let recipesPromise;

const loadRecipes = async () => {
  const manifest = await fetch('assets/data/manifest.json').then(response => {
    if (!response.ok) throw new Error('Manifest se nepodařilo načíst.');
    return response.json();
  });
  return Promise.all(manifest.recipes.map(path =>
    fetch(path).then(response => {
      if (!response.ok) throw new Error(`Recept ${path} se nepodařilo načíst.`);
      return response.json();
    })
  ));
};

const getRecipes = () => (recipesPromise ??= loadRecipes());

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
    items: items.map(({ name, unit, amount, amount_max }) => ({ name, unit, amount, amount_max }))
  };
  persistCart();
};

const aggregateCart = () => {
  const map = new Map();
  Object.values(cart.recipes).forEach(recipe => {
    recipe.items.forEach(item => {
      const key = itemKey(item);
      const entry = map.get(key) ?? { key, name: item.name, unit: item.unit || '', amount: null, amount_max: null, parts: [] };
      if (typeof item.amount === 'number') entry.amount = (entry.amount ?? 0) + item.amount;
      const high = typeof item.amount_max === 'number' ? item.amount_max : item.amount;
      if (typeof high === 'number') entry.amount_max = (entry.amount_max ?? 0) + high;
      entry.parts.push({ title: recipe.title, amount: item.amount, amount_max: item.amount_max, unit: item.unit || '' });
      map.set(key, entry);
    });
  });
  cart.custom.forEach(({ name }) => {
    const key = customKey(name);
    map.set(key, { key, name, unit: '', amount: null, amount_max: null, parts: [], custom: true });
  });
  return [...map.values()].sort((a, b) =>
    Number(Boolean(cart.checked[a.key])) - Number(Boolean(cart.checked[b.key]))
    || unitRank(a.unit) - unitRank(b.unit)
    || collator.compare(a.name, b.name)
  );
};

const cartItemMarkup = entry => {
  const checked = Boolean(cart.checked[entry.key]);
  const multi = entry.parts.length > 1;
  const title = capitalize(formatLine(entry));
  const parts = multi ? `
    <span class="item-divider"></span>
    <span class="item-parts">${entry.parts.map(part => `
      <span class="part-line">${esc([formatAmount(part.amount, part.amount_max), part.unit].filter(Boolean).join(' '))}<small>${esc(part.title)}</small></span>
    `).join('')}</span>` : '';
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
  const recipes = Object.values(cart.recipes);
  if (!recipes.length && !cart.custom.length) {
    body.innerHTML = '<div class="empty-cart"><p>Seznam je prázdný.</p><p>Suroviny lze přidat z detailu receptu nebo vyhledat výše.</p></div>';
    return;
  }
  const sources = recipes.map(recipe => `
    <span class="tag removable">${esc(recipe.title)}<button type="button" data-remove-recipe="${esc(recipe.id)}" aria-label="Odebrat recept">${icon('close')}</button></span>
  `).join('');
  body.innerHTML = `${sources ? `<div class="cart-sources">${sources}</div>` : ''}<div class="cart-list">${aggregateCart().map(cartItemMarkup).join('')}</div>`;
};

const shoppingListText = () => {
  const lines = aggregateCart()
    .filter(entry => !cart.checked[entry.key])
    .map(entry => `* ${capitalize(formatLine(entry))}`);
  return lines.length ? ['Nákupní seznam:', '', ...lines].join('\n') : '';
};

const shareShoppingList = async event => {
  const button = event.currentTarget;
  const text = shoppingListText();
  if (!text) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Nákupní seznam', text });
    } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    flashButton(button, icon('copy'));
  } catch {}
};

const initCart = () => {
  const dialog = $('#cartModal');
  if (!dialog) return;
  const body = $('#cartBody');

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

const getStaples = () => (staplesPromise ??= fetch('assets/data/staples.json')
  .then(response => (response.ok ? response.json() : []))
  .catch(() => []));

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

const flashButton = (button, markup) => {
  const original = button.innerHTML;
  button.innerHTML = markup;
  setTimeout(() => {
    button.innerHTML = original;
  }, 1600);
};

const shareRecipe = async (recipe, button) => {
  const url = recipeUrl(recipe.id);
  if (navigator.share) {
    try {
      await navigator.share({ title: recipe.title, text: recipe.description, url });
    } catch {}
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    flashButton(button, icon('copy'));
  } catch {}
};

const setMeta = (selector, attribute, value) => {
  document.querySelector(selector)?.setAttribute(attribute, value);
};

const recipeSchema = (recipe, url) => {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    description: recipe.description,
    image: recipe.image,
    url,
    recipeYield: `${recipe.servings} ${recipe.servings_unit || 'porce'}`,
    recipeCategory: (recipe.tags ?? []).join(', ') || undefined,
    recipeIngredient: recipe.ingredients.map(item => formatLine(item)),
    recipeInstructions: (recipe.steps ?? []).map(text => ({ '@type': 'HowToStep', text })),
    inLanguage: 'cs'
  });
  return script;
};

const recipeCard = ({ id, image, title, description, tags = [] }, index) => `
  <article class="recipe-card" style="--i:${index}">
    <a class="card-link" href="recipe.html?id=${encodeURIComponent(id)}">
      <div class="card-media"><img src="${esc(image)}" alt="" loading="lazy"></div>
      <div class="card-body">
        <h2>${esc(title)}</h2>
        <p>${esc(description)}</p>
        <div class="tags">${tags.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div>
      </div>
    </a>
    ${shareButton({ id, title })}
  </article>`;

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
    recipes = await getRecipes();
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
  };

  const applyView = view => {
    list.classList.toggle('grid', view !== 'list');
    list.classList.toggle('list', view === 'list');
    list.classList.toggle('compact', view === 'list' && MQ.mobile.matches);
    viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
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
};

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

const renderRecipe = (recipe, root) => {
  const base = recipe.servings || 1;
  const unit = recipe.servings_unit || 'porce';
  let current = base;

  const tags = (recipe.tags ?? []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('');
  const steps = (recipe.steps ?? []).map((step, index) => `
    <li style="--i:${index}"><span class="step-no">${index + 1}</span><p>${esc(step)}</p></li>`).join('');

  const hasSteps = (recipe.steps ?? []).length > 0;

  root.innerHTML = `
    <section class="recipe-hero">
      <img src="${esc(recipe.image)}" alt="">
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
            <span class="servings-unit">${esc(unit)}</span>
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
  const ingredientList = $('.ingredient-list', root);
  const addButton = $('.btn-add', root);
  const wakeButton = $('.btn-wake', root);

  const currentItems = () => {
    const factor = current / base;
    return recipe.ingredients.map(ingredient => scaleIngredient(ingredient, factor));
  };

  const drawIngredients = () => {
    output.textContent = String(current);
    ingredientList.innerHTML = currentItems().map(item => `
      <li>
        <span class="ing-qty">${esc(formatAmount(item.amount, item.amount_max))}</span>
        <span class="ing-name">${esc([item.unit, item.name].filter(Boolean).join(' '))}</span>
      </li>`).join('');
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
    addButton.innerHTML = addButtonMarkup(true);
    setTimeout(() => {
      addButton.innerHTML = addButtonMarkup(false);
    }, 1600);
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

  let recipes;
  try {
    recipes = await getRecipes();
  } catch {
    errorBox.hidden = false;
    return;
  }

  const recipe = recipes.find(item => item.id === id);
  if (!recipe) {
    errorBox.hidden = false;
    return;
  }

  const url = recipeUrl(recipe.id);
  setMeta('link[rel="canonical"]', 'href', url);
  setMeta('meta[property="og:url"]', 'content', url);
  setMeta('meta[name="description"]', 'content', recipe.description);
  setMeta('meta[property="og:description"]', 'content', recipe.description);
  setMeta('meta[property="og:image"]', 'content', recipe.image);
  document.head.append(recipeSchema(recipe, url));
  renderRecipe(recipe, article);
};

initTheme();
initCart();

if ($('#recipeList')) initIndex();
if ($('#recipeArticle')) initRecipe();
