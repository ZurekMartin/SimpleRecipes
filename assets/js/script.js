const STORAGE_KEYS = {
  theme: 'simplerecipes-theme',
  viewDesktop: 'simplerecipes-view-desktop',
  viewCompact: 'simplerecipes-view-compact',
  cart: 'simplerecipes-cart'
};

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  auto: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  cart: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 8H6"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
  listPlus: '<path d="M4 6h10M4 12h10M4 18h6"/><path d="M18 14v6M15 17h6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'
};

const THEME_ICONS = { light: 'sun', dark: 'moon', auto: 'auto' };

const UNIT_ORDER = {
  g: 0,
  kg: 0,
  ml: 0,
  dl: 0,
  l: 0,
  ks: 1,
  kus: 1,
  kusy: 1,
  'stroužek': 1,
  'stroužky': 1,
  'špetka': 2
};

const PLACEHOLDER_WIDE = 'Hledat název, popis nebo štítek';
const PLACEHOLDER_NARROW = 'Hledat';

const compactQuery = window.matchMedia('(max-width: 1023px)');
const lightQuery = window.matchMedia('(prefers-color-scheme: light)');

function svg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function formatNumber(number) {
  return String(Math.round(number * 100) / 100).replace('.', ',');
}

function formatAmount(amount, max) {
  if (typeof amount !== 'number') return '';
  let text = formatNumber(amount);
  if (typeof max === 'number' && max !== amount) text += '–' + formatNumber(max);
  return text;
}

function formatLine(item) {
  return [formatAmount(item.amount, item.amount_max), item.unit, item.name].filter(Boolean).join(' ');
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function unitRank(unit) {
  const key = (unit || '').trim().toLowerCase();
  return key in UNIT_ORDER ? UNIT_ORDER[key] : 3;
}

function sortIngredients(items) {
  return [...items].sort((a, b) => unitRank(a.unit) - unitRank(b.unit));
}

function scaleIngredient(ingredient, factor) {
  return {
    name: ingredient.name,
    unit: ingredient.unit || '',
    amount: typeof ingredient.amount === 'number' ? ingredient.amount * factor : null,
    amount_max: typeof ingredient.amount_max === 'number' ? ingredient.amount_max * factor : null
  };
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'cs'));
}

let recipesPromise = null;

async function loadRecipes() {
  const manifestResponse = await fetch('assets/data/manifest.json');
  if (!manifestResponse.ok) throw new Error('Manifest se nepodařilo načíst.');
  const manifest = await manifestResponse.json();
  return Promise.all(manifest.recipes.map(async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Recept ${path} se nepodařilo načíst.`);
    return response.json();
  }));
}

function getRecipes() {
  if (!recipesPromise) recipesPromise = loadRecipes();
  return recipesPromise;
}

function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference;
  return lightQuery.matches ? 'light' : 'dark';
}

function applyTheme() {
  const preference = readStorage(STORAGE_KEYS.theme, 'dark');
  document.documentElement.dataset.theme = resolveTheme(preference);
  document.querySelectorAll('[data-theme-option]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.themeOption === preference));
  });
}

function initTheme() {
  document.querySelectorAll('[data-theme-option]').forEach(button => {
    const option = button.dataset.themeOption;
    button.innerHTML = svg(THEME_ICONS[option]);
    button.addEventListener('click', () => {
      writeStorage(STORAGE_KEYS.theme, option);
      applyTheme();
    });
  });
  lightQuery.addEventListener('change', () => {
    if (readStorage(STORAGE_KEYS.theme, 'dark') === 'auto') applyTheme();
  });
  applyTheme();
}

function injectIcons() {
  document.querySelectorAll('[data-icon]').forEach(element => {
    element.innerHTML = svg(element.dataset.icon);
  });
}

let cart = loadCart();

function loadCart() {
  const stored = readStorage(STORAGE_KEYS.cart, null);
  if (!stored || typeof stored !== 'object') return { recipes: {}, checked: {} };
  return { recipes: stored.recipes || {}, checked: stored.checked || {} };
}

function persistCart() {
  writeStorage(STORAGE_KEYS.cart, cart);
  updateCartBadge();
}

function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const count = Object.keys(cart.recipes).length;
  badge.textContent = count;
  badge.hidden = count === 0;
}

function addRecipeToCart(recipe, items) {
  cart.recipes[recipe.id] = {
    id: recipe.id,
    title: recipe.title,
    items: items.map(item => ({
      name: item.name,
      unit: item.unit,
      amount: item.amount,
      amount_max: item.amount_max
    }))
  };
  persistCart();
}

function itemKey(item) {
  return `${item.name.trim().toLowerCase()}|${(item.unit || '').trim().toLowerCase()}`;
}

function aggregateCart() {
  const map = new Map();
  Object.values(cart.recipes).forEach(recipe => {
    recipe.items.forEach(item => {
      const key = itemKey(item);
      const entry = map.get(key) || {
        key,
        name: item.name,
        unit: item.unit || '',
        amount: null,
        amount_max: null,
        parts: []
      };
      if (typeof item.amount === 'number') entry.amount = (entry.amount || 0) + item.amount;
      const high = typeof item.amount_max === 'number' ? item.amount_max : item.amount;
      if (typeof high === 'number') entry.amount_max = (entry.amount_max || 0) + high;
      entry.parts.push({ title: recipe.title, amount: item.amount, amount_max: item.amount_max });
      map.set(key, entry);
    });
  });
  return [...map.values()].sort((a, b) =>
    (cart.checked[a.key] ? 1 : 0) - (cart.checked[b.key] ? 1 : 0)
    || unitRank(a.unit) - unitRank(b.unit)
    || a.name.localeCompare(b.name, 'cs')
  );
}

function renderCart() {
  const body = document.getElementById('cartBody');
  if (!body) return;
  const recipes = Object.values(cart.recipes);
  if (!recipes.length) {
    body.innerHTML = '<div class="empty-cart"><p>Seznam je prázdný.</p><p>Suroviny přidáš z detailu receptu.</p></div>';
    return;
  }
  const sources = recipes.map(recipe => `
    <span class="tag removable">${esc(recipe.title)}<button type="button" data-remove-recipe="${esc(recipe.id)}" aria-label="Odebrat recept">${svg('close')}</button></span>
  `).join('');
  const items = aggregateCart().map(entry => {
    const checked = Boolean(cart.checked[entry.key]);
    const multi = entry.parts.length > 1;
    const title = capitalize(formatLine({ name: entry.name, unit: entry.unit, amount: entry.amount, amount_max: entry.amount_max }));
    const parts = multi
      ? `<span class="item-divider"></span><span class="item-parts">${entry.parts.map(part => `
          <span class="part-line">${esc([formatAmount(part.amount, part.amount_max), entry.unit].filter(Boolean).join(' '))}<small>${esc(part.title)}</small></span>
        `).join('')}</span>`
      : '';
    return `
      <label class="cart-item${checked ? ' is-checked' : ''}${multi ? ' is-multi' : ''}">
        <input type="checkbox" data-key="${esc(entry.key)}" ${checked ? 'checked' : ''}>
        <span class="item-card">
          <span class="item-title">${esc(title)}</span>
          ${parts}
        </span>
      </label>
    `;
  }).join('');
  body.innerHTML = `<div class="cart-sources">${sources}</div><div class="cart-list">${items}</div>`;
}

function openCart() {
  const modal = document.getElementById('cartModal');
  if (!modal) return;
  renderCart();
  modal.hidden = false;
  document.body.classList.add('no-scroll');
}

function closeCart() {
  const modal = document.getElementById('cartModal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove('no-scroll');
}

function initCart() {
  const cartButton = document.getElementById('cartButton');
  if (cartButton) cartButton.addEventListener('click', openCart);

  document.querySelectorAll('[data-close]').forEach(element => {
    element.addEventListener('click', closeCart);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeCart();
  });

  const body = document.getElementById('cartBody');
  if (body) {
    body.addEventListener('change', event => {
      const checkbox = event.target.closest('input[data-key]');
      if (!checkbox) return;
      cart.checked[checkbox.dataset.key] = checkbox.checked;
      persistCart();
      renderCart();
    });
    body.addEventListener('click', event => {
      const removeButton = event.target.closest('[data-remove-recipe]');
      if (!removeButton) return;
      delete cart.recipes[removeButton.dataset.removeRecipe];
      persistCart();
      renderCart();
    });
  }

  const clearButton = document.getElementById('cartClear');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      cart = { recipes: {}, checked: {} };
      persistCart();
      renderCart();
    });
  }

  updateCartBadge();
}

const indexState = {
  query: '',
  tags: new Set(),
  pantry: new Set()
};

function renderChipGroup(container, values, selected, onChange) {
  container.innerHTML = values.map(value =>
    `<button type="button" class="chip" data-value="${esc(value)}" aria-pressed="false">${esc(value)}</button>`
  ).join('');
  container.addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    const value = button.dataset.value;
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    button.setAttribute('aria-pressed', String(selected.has(value)));
    onChange();
  });
}

function filterRecipes(recipes) {
  const query = indexState.query.trim().toLowerCase();
  return recipes.filter(recipe => {
    const tags = recipe.tags || [];
    const types = recipe.ingredients_types || [];
    if (query) {
      const haystack = [recipe.title, recipe.description, ...tags, ...types].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (indexState.tags.size && !tags.some(tag => indexState.tags.has(tag))) return false;
    if (indexState.pantry.size && !types.some(type => indexState.pantry.has(type))) return false;
    return true;
  });
}

function recipeCard(recipe, index) {
  return `
    <a class="recipe-card" style="--i:${index}" href="recipe.html?id=${encodeURIComponent(recipe.id)}">
      <div class="card-media"><img src="${esc(recipe.image)}" alt="" loading="lazy"></div>
      <div class="card-body">
        <h2>${esc(recipe.title)}</h2>
        <p>${esc(recipe.description)}</p>
        <div class="tags">${(recipe.tags || []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div>
      </div>
    </a>
  `;
}

function currentViewKey() {
  return compactQuery.matches ? STORAGE_KEYS.viewCompact : STORAGE_KEYS.viewDesktop;
}

function currentView() {
  return readStorage(currentViewKey(), compactQuery.matches ? 'list' : 'grid');
}

async function initIndex() {
  const list = document.getElementById('recipeList');
  const searchInput = document.getElementById('searchInput');
  const tagChips = document.getElementById('tagChips');
  const pantryChips = document.getElementById('pantryChips');
  const advancedToggle = document.getElementById('advancedToggle');
  const advancedPanel = document.getElementById('advancedPanel');
  const emptyState = document.getElementById('emptyState');
  const viewButtons = document.querySelectorAll('[data-view]');

  let recipes;
  try {
    recipes = await getRecipes();
  } catch {
    list.innerHTML = '<p class="empty">Recepty se nepodařilo načíst.</p>';
    return;
  }

  renderChipGroup(tagChips, uniqueSorted(recipes.flatMap(recipe => recipe.tags || [])), indexState.tags, render);
  renderChipGroup(pantryChips, uniqueSorted(recipes.flatMap(recipe => recipe.ingredients_types || [])), indexState.pantry, render);

  function syncPlaceholder() {
    searchInput.placeholder = compactQuery.matches ? PLACEHOLDER_NARROW : PLACEHOLDER_WIDE;
  }

  syncPlaceholder();

  searchInput.addEventListener('input', event => {
    indexState.query = event.target.value;
    render();
  });

  advancedToggle.addEventListener('click', () => {
    const willOpen = advancedPanel.hidden;
    advancedPanel.hidden = !willOpen;
    advancedToggle.setAttribute('aria-expanded', String(willOpen));
  });

  function applyView(view) {
    list.classList.toggle('grid', view !== 'list');
    list.classList.toggle('list', view === 'list');
    list.classList.toggle('compact', view === 'list' && compactQuery.matches);
    viewButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
  }

  viewButtons.forEach(button => {
    button.addEventListener('click', () => {
      writeStorage(currentViewKey(), button.dataset.view);
      applyView(button.dataset.view);
    });
  });

  compactQuery.addEventListener('change', () => {
    syncPlaceholder();
    applyView(currentView());
  });

  function render() {
    const filtered = filterRecipes(recipes);
    list.innerHTML = filtered.map(recipeCard).join('');
    emptyState.hidden = filtered.length > 0;
  }

  applyView(currentView());
  render();
}

let wakeLock = null;
let wakeWanted = false;

function setPressed(button, pressed) {
  button.setAttribute('aria-pressed', String(pressed));
}

async function acquireWakeLock(button) {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    setPressed(button, true);
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      setPressed(button, false);
    });
  } catch {
    wakeLock = null;
    setPressed(button, false);
  }
}

function initWakeLock(button) {
  button.addEventListener('click', async () => {
    if (wakeWanted) {
      wakeWanted = false;
      if (wakeLock) await wakeLock.release();
      setPressed(button, false);
    } else {
      wakeWanted = true;
      await acquireWakeLock(button);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeWanted && !wakeLock) {
      acquireWakeLock(button);
    }
  });
}

async function initRecipe() {
  const article = document.getElementById('recipeArticle');
  const errorBox = document.getElementById('recipeError');
  const id = new URLSearchParams(window.location.search).get('id');

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

  document.title = `${recipe.title} · SimpleRecipes`;
  renderRecipe(recipe, article);
}

function addButtonMarkup(done) {
  return `${svg(done ? 'check' : 'listPlus')}<span class="btn-label">${done ? 'Přidáno do seznamu' : 'Přidat do seznamu'}</span>`;
}

function renderRecipe(recipe, root) {
  const base = recipe.servings || 1;
  const unit = recipe.servings_unit || 'porce';
  let current = base;

  const tags = (recipe.tags || []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('');
  const steps = (recipe.steps || []).map((step, index) => `
    <li style="--i:${index}"><span class="step-no">${index + 1}</span><p>${esc(step)}</p></li>
  `).join('');

  root.innerHTML = `
    <section class="recipe-hero">
      <img src="${esc(recipe.image)}" alt="">
      <div class="recipe-hero-text">
        <div class="tags">${tags}</div>
        <h1>${esc(recipe.title)}</h1>
      </div>
    </section>
    <p class="lead">${esc(recipe.description)}</p>
    <div class="recipe-layout">
      <section class="panel">
        <div class="panel-head">
          <h2>Suroviny</h2>
          <div class="servings">
            <div class="stepper" role="group" aria-label="Počet">
              <button type="button" class="step-btn" data-step="-1" aria-label="Méně">${svg('minus')}</button>
              <output id="servingsValue" aria-live="polite">${base}</output>
              <button type="button" class="step-btn" data-step="1" aria-label="Více">${svg('plus')}</button>
            </div>
            <span class="servings-unit">${esc(unit)}</span>
          </div>
        </div>
        <ul class="ingredient-list" id="ingredientList"></ul>
        <div class="actions">
          <button type="button" class="btn ghost btn-wake" id="wakeToggle" aria-pressed="false">${svg('screen')}<span class="btn-label">Nezhasínat displej</span></button>
          <button type="button" class="btn primary btn-add" id="addToCart" aria-label="Přidat do seznamu">${addButtonMarkup(false)}</button>
        </div>
      </section>
      <section class="panel steps-panel">
        <h2>Postup</h2>
        <ol class="steps">${steps}</ol>
      </section>
    </div>
  `;

  const output = root.querySelector('#servingsValue');
  const ingredientList = root.querySelector('#ingredientList');
  const addButton = root.querySelector('#addToCart');
  const wakeButton = root.querySelector('#wakeToggle');

  function currentItems() {
    const factor = current / base;
    return recipe.ingredients.map(ingredient => scaleIngredient(ingredient, factor));
  }

  function drawIngredients() {
    output.textContent = String(current);
    ingredientList.innerHTML = sortIngredients(currentItems()).map(item => `
      <li>
        <span class="ing-qty">${esc(formatAmount(item.amount, item.amount_max))}</span>
        <span class="ing-name">${esc([item.unit, item.name].filter(Boolean).join(' '))}</span>
      </li>
    `).join('');
  }

  root.querySelectorAll('[data-step]').forEach(button => {
    button.addEventListener('click', () => {
      const next = current + Number(button.dataset.step);
      if (next < 1 || next > 20) return;
      current = next;
      drawIngredients();
    });
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
}

function initCommon() {
  initTheme();
  injectIcons();
  initCart();
}

initCommon();

if (document.getElementById('recipeList')) initIndex();
if (document.getElementById('recipeArticle')) initRecipe();
