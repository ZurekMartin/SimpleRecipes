(function () {
  const els = {
    title: document.getElementById('recipeTitle'),
    desc: document.getElementById('recipeDesc'),
    image: document.getElementById('recipeImage'),
    tags: document.getElementById('recipeTags'),
    ingredients: document.getElementById('ingredientsList'),
    steps: document.getElementById('stepsList'),
    year: document.getElementById('year'),
    settingsButton: document.getElementById('settingsButton'),
    settingsContainer: document.getElementById('settingsContainer'),
  };

  const theme = localStorage.getItem('sr:theme') || 'auto';
  if (theme !== 'auto') document.documentElement.dataset.theme = theme;

  async function injectSettings() {
    try {
      const response = await fetch('/SimpleRecipes/settings.html');
      const settingsHtml = await response.text();
      els.settingsContainer.innerHTML = settingsHtml;
      
      els.themeToggle = document.getElementById('themeToggle');
      els.settingsPopover = document.getElementById('settingsPopover');
      els.settingsClose = document.getElementById('settingsClose');
      els.overlay = document.getElementById('overlay');
      
      if (els.settingsPopover) {
        els.settingsPopover.hidden = true;
        els.settingsPopover.classList.remove('show');
        els.settingsPopover.style.left = '';
        els.settingsPopover.style.top = '';
        els.settingsPopover.style.right = '';
        els.settingsPopover.setAttribute('aria-hidden', 'true');
      }
      if (els.overlay) {
        els.overlay.hidden = true;
        els.overlay.classList.remove('show');
      }

      setTheme(theme);
      bindSettings();
    } catch (error) {
      console.error('Chyba při načítání nastavení:', error);
    }
  }

  function setTheme(theme) {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem('sr:theme', theme);
    if (els.themeToggle) {
      [...els.themeToggle.querySelectorAll('button')].forEach((btn) => {
        btn.setAttribute('aria-selected', String(btn.dataset.theme === theme));
      });
    }
  }

  function bindSettings() {
    if (!els.settingsPopover || !els.overlay || !els.settingsClose) return;
    
    const positionPopover = () => {
      const header = document.querySelector('.site-header');
      const container = document.querySelector('.site-header .container');
      if (!header || !container) return;
      const headerRect = header.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const pop = els.settingsPopover;
      pop.style.visibility = 'hidden';
      pop.hidden = false;
      pop.classList.add('show');
      const popWidth = pop.offsetWidth;
      pop.classList.remove('show');
      pop.hidden = true;
      pop.style.visibility = '';

      const gap = 8;
      const top = headerRect.bottom + gap;
      const left = containerRect.right - popWidth;
      pop.style.top = `${top}px`;
      pop.style.left = `${left}px`;
      pop.style.right = 'auto';
      pop.style.transformOrigin = 'top right';
    };

    const open = () => {
      positionPopover();
      els.settingsPopover.hidden = false;
      requestAnimationFrame(() => {
        els.settingsPopover.classList.add('show');
        els.overlay.hidden = false;
        requestAnimationFrame(() => els.overlay.classList.add('show'));
        els.settingsButton.setAttribute('aria-expanded', 'true');
        document.body.classList.add('settings-open');
        els.settingsPopover.removeAttribute('aria-hidden');
        const main = document.querySelector('main');
        if (main) main.setAttribute('inert', '');
        const firstBtn = els.settingsPopover.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstBtn) firstBtn.focus({ preventScroll: true });
      });
    };
    const close = () => {
      els.settingsPopover.classList.remove('show');
      els.overlay.classList.remove('show');
      els.settingsButton.setAttribute('aria-expanded', 'false');
      setTimeout(() => {
        els.settingsPopover.hidden = true; els.overlay.hidden = true;
        els.settingsPopover.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('settings-open');
        const main = document.querySelector('main');
        if (main) main.removeAttribute('inert');
        els.settingsButton.focus({ preventScroll: true });
      }, 180);
    };
    els.settingsButton.addEventListener('click', () => {
      const openNow = els.settingsPopover.hidden;
      openNow ? open() : close();
    });
    els.settingsClose.addEventListener('click', close);
    els.overlay.addEventListener('click', close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window.addEventListener('resize', () => { if (!els.settingsPopover.hidden) positionPopover(); });
    window.addEventListener('scroll', () => { if (!els.settingsPopover.hidden) positionPopover(); }, { passive: true });
  }

  function qsParam(name) {
    const url = new URL(location.href);
    return url.searchParams.get(name);
  }

  async function findRecipePathBySlug(slug) {
    const res = await fetch('/SimpleRecipes/assets/recipes/manifest.json');
    if (!res.ok) throw new Error('Nelze načíst manifest');
    const { recipes } = await res.json();
    for (const path of recipes) {
      const finalPath = path.startsWith('/') ? path : `/${path}`;
      const rr = await fetch(finalPath);
      if (!rr.ok) continue;
      const json = await rr.json();
      const s = json.slug || slugify(json.title);
      if (s === slug) return path;
    }
    return null;
  }

  function slugify(text) {
    return text
      .toString()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  function renderRecipe(recipe) {
    document.title = `${recipe.title} – SimpleRecipes`;
    els.title.textContent = recipe.title;
    els.desc.textContent = recipe.description || '';
    els.image.src = recipe.image;
    els.image.alt = recipe.title;
    els.tags.innerHTML = (recipe.tags || []).map((t) => `<span class="chip">${t}</span>`).join('');
    els.ingredients.innerHTML = (recipe.ingredients || []).map((i) => `<li>${i}</li>`).join('');
    els.steps.innerHTML = (recipe.steps || []).map((s) => `<li>${s}</li>`).join('');
    els.year.textContent = new Date().getFullYear();
  }

  async function init() {
    await injectSettings();
    
    if (els.themeToggle) {
      [...els.themeToggle.querySelectorAll('button')].forEach((btn) => {
        btn.addEventListener('click', () => setTheme(btn.dataset.theme));
      });
    }

    const id = qsParam('id');
    if (!id) return;
    let path = await findRecipePathBySlug(id);
    if (!path) {
      document.querySelector('main').innerHTML = '<p class="empty">Recept nebyl nalezen.</p>';
      return;
    }
    const res = await fetch(path.startsWith('/') ? path : `/${path}`);
    const recipe = await res.json();
    renderRecipe(recipe);
  }

  init();
})();
