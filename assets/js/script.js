(function () {
  const state = {
    allRecipes: [],
    filteredRecipes: [],
    activeTag: null,
    view: localStorage.getItem('sr:view') || 'grid',
    theme: localStorage.getItem('sr:theme') || 'auto',
    selectedIngredients: new Set(),
  };

  const els = {
    results: document.getElementById('results'),
    empty: document.getElementById('emptyState'),
    search: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    tags: document.getElementById('tagFilters'),
    year: document.getElementById('year'),
    scrollTop: document.getElementById('scrollTop'),
    ingredientFilters: document.getElementById('ingredientFilters'),
    filtersToggle: document.getElementById('filtersToggle'),
    settingsButton: document.getElementById('settingsButton'),
    settingsContainer: document.getElementById('settingsContainer'),
  };

  document.documentElement.dataset.theme = state.theme === 'auto' ? '' : state.theme;

  async function injectSettings() {
    try {
      const response = await fetch('/settings.html');
      const settingsHtml = await response.text();
      els.settingsContainer.innerHTML = settingsHtml;
      
      els.viewToggle = document.getElementById('viewToggle');
      els.themeToggle = document.getElementById('themeToggle');
      els.settingsPopover = document.getElementById('settingsPopover');
      els.settingsClose = document.getElementById('settingsClose');
      els.overlay = document.getElementById('overlay');
      
      const viewSettingsGroup = document.getElementById('viewSettingsGroup');
      if (viewSettingsGroup) {
        viewSettingsGroup.style.display = 'block';
      }
      
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

      setTheme(state.theme);
      setView(state.view);
      bindSettings();
    } catch (error) {
      console.error('Chyba při načítání nastavení:', error);
    }
  }

  function setTheme(theme) {
    state.theme = theme;
    if (theme === 'auto') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
    localStorage.setItem('sr:theme', theme);
    if (els.themeToggle) {
      [...els.themeToggle.querySelectorAll('button')].forEach((btn) => {
        btn.setAttribute('aria-selected', String(btn.dataset.theme === theme));
      });
    }
  }

  function setView(view) {
    state.view = view;
    localStorage.setItem('sr:view', view);
    if (els.viewToggle) {
      [...els.viewToggle.querySelectorAll('button')].forEach((btn) => {
        btn.setAttribute('aria-selected', String(btn.dataset.view === view));
      });
    }
    if (els.results) {
      els.results.classList.toggle('grid', view === 'grid');
      els.results.classList.toggle('list', view === 'list');
    }
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

  function recipeUrl(slug) {
    return `/recipe.html?id=${encodeURIComponent(slug)}`;
  }

  function gridCardTemplate(r) {
    const tags = r.tags?.map((t) => `<span class="chip">${t}</span>`).join('') || '';
    const img = r.image;
    return `
      <a class="card" href="${recipeUrl(r.slug)}" data-slug="${r.slug}" data-view="grid">
        <div class="thumb-wrap">
          <img class="thumb" src="${img}" alt="${r.title}" loading="lazy"/>
          <div class="card-tags-overlay">${tags}</div>
        </div>
        <div class="card-body">
          <h3 class="card-title">${r.title}</h3>
        </div>
      </a>
    `;
  }

  function listItemTemplate(r) {
    const tags = r.tags?.map((t) => `<span class="chip">${t}</span>`).join('') || '';
    const img = r.image || `https://images.unsplash.com/photo-1514516870926-2059896c8dfd?q=80&w=1200&auto=format&fit=crop`;
    return `
      <a class="card" href="${recipeUrl(r.slug)}" data-slug="${r.slug}" data-view="list">
        <img class="thumb" src="${img}" alt="${r.title}" loading="lazy"/>
        <div class="card-body">
          <h3 class="card-title">${r.title}</h3>
          <div class="card-tags">${tags}</div>
        </div>
      </a>
    `;
  }

  function render() {
    const view = state.view;
    const html = state.filteredRecipes
      .map((r) => (view === 'grid' ? gridCardTemplate(r) : listItemTemplate(r)))
      .join('');
    els.results.innerHTML = html;
    els.empty.hidden = state.filteredRecipes.length > 0;
  }

  function renderTags() {
    els.tags.innerHTML = '';
    const set = new Set();
    state.allRecipes.forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
    const allTags = Array.from(set).sort((a, b) => a.localeCompare(b, 'cs'));
    allTags.forEach((t) => {
      const btn = document.createElement('button');
      btn.className = 'tag';
      btn.type = 'button';
      btn.textContent = t;
      btn.setAttribute('aria-pressed', String(state.activeTag === t));
      btn.addEventListener('click', () => {
        state.activeTag = state.activeTag === t ? null : t;
        [...els.tags.querySelectorAll('button.tag')].forEach((b) =>
          b.setAttribute('aria-pressed', String(b.textContent === state.activeTag))
        );
        filter();
      });
      els.tags.appendChild(btn);
    });
  }

  function filter() {
    const q = els.search.value
      .trim()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    const active = state.activeTag;
    const selectedIngs = [...state.selectedIngredients];
    state.filteredRecipes = state.allRecipes.filter((r) => {
      const hay = [r.title, r.description, ...(r.tags || [])]
        .join(' ')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();
      const matchesQuery = q ? hay.includes(q) : true;
      const matchesTags = active ? (r.tags || []).includes(active) : true;
      const matchesIngredients = selectedIngs.length
        ? selectedIngs.every((ing) => (r.ingredientTypesNormalized || []).some((i) => i.includes(ing)))
        : true;
      return matchesQuery && matchesTags && matchesIngredients;
    });
    render();
  }

  async function loadManifest() {
    const res = await fetch('/assets/recipes/manifest.json');
    if (!res.ok) throw new Error('Nepodařilo se načíst manifest');
    const manifest = await res.json();
    return manifest.recipes || [];
  }

  async function loadRecipeMeta(path) {
    const finalPath = path.startsWith('/') ? path : `/${path}`;
    const res = await fetch(finalPath);
    if (!res.ok) throw new Error('Chyba načítání receptu');
    const recipe = await res.json();
    return {
      slug: recipe.slug || slugify(recipe.title),
      title: recipe.title,
      description: recipe.description || '',
      image: recipe.image || '',
      tags: recipe.tags || [],
      ingredientTypes: recipe.ingredients_types || [],
      ingredientTypesNormalized: (recipe.ingredients_types || []).map((i) =>
        i
          .toString()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
      ),
    };
  }

  function renderIngredientsFilter(recipes) {
    const set = new Set();
    recipes.forEach((r) => (r.ingredientTypes || []).forEach((i) => { if (i) set.add(i); }));
    const all = Array.from(set).sort((a, b) => a.localeCompare(b, 'cs'));
    els.ingredientFilters.innerHTML = '';
    all.forEach((i) => {
      const id = `ing-${slugify(i)}`;
      const label = document.createElement('label');
      label.className = 'check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.value = i.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      cb.addEventListener('change', () => {
        if (cb.checked) state.selectedIngredients.add(cb.value);
        else state.selectedIngredients.delete(cb.value);
        filter();
      });
      const span = document.createElement('span');
      span.textContent = i;
      label.append(cb, span);
      els.ingredientFilters.appendChild(label);
    });
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
        els.settingsPopover.hidden = true;
        els.overlay.hidden = true;
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

  async function init() {
    try {
      await injectSettings();
      
      els.year.textContent = new Date().getFullYear();
      
      if (els.filtersToggle && els.ingredientFilters) {
        els.filtersToggle.addEventListener('click', () => {
          const isHidden = els.ingredientFilters.hasAttribute('hidden');
          if (isHidden) {
            els.ingredientFilters.removeAttribute('hidden');
          } else {
            els.ingredientFilters.setAttribute('hidden', '');
          }
          els.filtersToggle.setAttribute('aria-pressed', String(isHidden));
          els.filtersToggle.setAttribute('aria-expanded', String(isHidden));
        });
      }

      if (els.viewToggle) {
        els.viewToggle.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-view]');
          if (!btn) return;
          setView(btn.dataset.view);
        });
      }
      
      if (els.themeToggle) {
        els.themeToggle.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-theme]');
          if (!btn) return;
          setTheme(btn.dataset.theme);
        });
      }
      
      els.scrollTop?.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      const handleSearchInput = () => {
        if (!els.searchClear) return filter();
        const hasText = els.search.value.trim().length > 0;
        els.searchClear.hidden = !hasText;
        filter();
      };
      els.search.addEventListener('input', handleSearchInput);
      els.searchClear?.addEventListener('click', (e) => {
        e.preventDefault();
        els.search.value = '';
        els.searchClear.hidden = true;
        filter();
        els.search.focus();
      });

      const files = await loadManifest();
      const metas = await Promise.all(files.map((p) => loadRecipeMeta(p)));
      state.allRecipes = metas.sort((a, b) => a.title.localeCompare(b.title, 'cs'));
      state.filteredRecipes = state.allRecipes;
      render();
      renderTags();
      renderIngredientsFilter(state.allRecipes);
      els.results.setAttribute('aria-busy', 'false');
      if (els.searchClear) els.searchClear.hidden = !(els.search.value && els.search.value.length > 0);
    } catch (err) {
      console.error(err);
      els.results.innerHTML = '<p style="color:var(--muted)">Chyba načítání receptů.</p>';
      els.results.setAttribute('aria-busy', 'false');
    }
  }

  init();
})();
