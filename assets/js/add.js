(function () {
  let els = {
    settingsContainer: document.getElementById('settingsContainer'),
    form: document.getElementById('addForm'),
    id: document.getElementById('recipeId'),
    title: document.getElementById('recipeTitleInput'),
    image: document.getElementById('recipeImageInput'),
    desc: document.getElementById('recipeDescInput'),
    tags: document.getElementById('tagsContainer'),
    ingTypes: document.getElementById('ingTypesContainer'),
    ingredientsFields: document.getElementById('ingredientsFields'),
    stepsFields: document.getElementById('stepsFields'),
    addIngredientBtn: document.getElementById('addIngredientBtn'),
    addStepBtn: document.getElementById('addStepBtn'),
    saveBtn: document.getElementById('saveBtn'),
  };

  const devMode = false;
  const mainPath = devMode ? "/" : "/SimpleRecipes/";

  const state = {
    allTags: [],
    selectedTags: new Set(),
    allIngTypes: [],
    selectedIngTypes: new Set(),
    userTags: new Set(),
    userIngTypes: new Set(),
  };

  function slugify(text) {
    return text
      .toString()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  function setAriaSelectedByData(container, dataKey, activeValue) {
    if (!container) return;
    [...container.querySelectorAll('button')].forEach((btn) => {
      btn.setAttribute('aria-selected', String(btn.dataset[dataKey] === activeValue));
    });
  }

  async function injectComponents() {
    try {
      const headerResponse = await fetch(mainPath + 'assets/components/header.html');
      const headerHtml = await headerResponse.text();
      document.body.insertAdjacentHTML('afterbegin', headerHtml);

      const footerResponse = await fetch(mainPath + 'assets/components/footer.html');
      const footerHtml = await footerResponse.text();
      document.body.insertAdjacentHTML('beforeend', footerHtml);

      const settingsResponse = await fetch(mainPath + 'assets/components/settings.html');
      const settingsHtml = await settingsResponse.text();
      els.settingsContainer.innerHTML = settingsHtml;

      els = {
        ...els,
        year: document.getElementById('year'),
        settingsButton: document.getElementById('settingsButton'),
        themeToggle: document.getElementById('themeToggle'),
        settingsPopover: document.getElementById('settingsPopover'),
        settingsClose: document.getElementById('settingsClose'),
        overlay: document.getElementById('overlay'),
      };
      const theme = localStorage.getItem('sr:theme') || 'auto';
      setTheme(theme);
      bindSettings();
      if (els.themeToggle) {
        els.themeToggle.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-theme]');
          if (!btn) return;
          setTheme(btn.dataset.theme);
        });
      }
    } catch (e) { console.error(e); }
  }

  function setTheme(theme) {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem('sr:theme', theme);
    setAriaSelectedByData(els.themeToggle, 'theme', theme);
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

  async function loadManifest() {
    const res = await fetch(mainPath + 'assets/recipes/manifest.json');
    if (!res.ok) throw new Error('Nelze načíst manifest');
    return (await res.json()).recipes || [];
  }
  async function loadRecipe(path) {
    const finalPath = path.startsWith(mainPath) ? path : mainPath + path;
    const res = await fetch(finalPath);
    if (!res.ok) return null;
    return await res.json();
  }

  function collectExistingTagsAndIngTypes(recipes) {
    const tagSet = new Set();
    const ingTypeSet = new Set();
    recipes.forEach((r) => {
      (r.tags || []).forEach((t) => t && tagSet.add(t));
      (r.ingredients_types || []).forEach((i) => i && ingTypeSet.add(i));
    });
    state.allTags = Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'cs'));
    state.allIngTypes = Array.from(ingTypeSet).sort((a, b) => a.localeCompare(b, 'cs'));
  }

  function makeChip(label, { selectable = true, removable = false, selected = false, isAdd = false } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = isAdd ? 'icon-btn' : 'tag';
    if (isAdd) {
      btn.setAttribute('aria-label', label);
      btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true"><path d="M12 4.5a1 1 0 0 1 1 1V11h5.5a1 1 0 1 1 0 2H13v5.5a1 1 0 1 1-2 0V13H5.5a1 1 0 1 1 0-2H11V5.5a1 1 0 0 1 1-1Z"/></svg>';
    } else {
      btn.textContent = label;
    }
    if (selectable) btn.setAttribute('aria-pressed', String(selected));
    if (removable) btn.dataset.removable = '1';
    return btn;
  }

  function renderTagChips() {
    els.tags.innerHTML = '';
    state.allTags.forEach((t) => {
      const isCustom = state.userTags.has(t);
      const chip = makeChip(t, { selectable: true, removable: isCustom, selected: state.selectedTags.has(t) });
      chip.addEventListener('click', () => {
        if (state.selectedTags.has(t)) state.selectedTags.delete(t); else state.selectedTags.add(t);
        chip.setAttribute('aria-pressed', String(state.selectedTags.has(t)));
        if (state.selectedTags.size > 0) clearFieldNote(els.tags);
      });
      els.tags.appendChild(chip);
    });
    const addChip = makeChip('', { isAdd: true });
    addChip.setAttribute('title', 'Přidat štítek');
    addChip.addEventListener('click', () => {
      const name = prompt('Nový štítek');
      if (!name) return;
      if (!state.allTags.includes(name)) state.allTags.push(name);
      state.allTags.sort((a, b) => a.localeCompare(b, 'cs'));
      if (state.userTags.has(name)) {
        state.userTags.delete(name);
        state.selectedTags.delete(name);
        state.allTags = state.allTags.filter((x) => x !== name);
      } else {
        state.userTags.add(name);
        state.selectedTags.add(name);
      }
      renderTagChips();
    });
    els.tags.appendChild(addChip);
  }

  function renderIngTypeChips() {
    els.ingTypes.innerHTML = '';
    state.allIngTypes.forEach((t) => {
      const isCustom = state.userIngTypes.has(t);
      const chip = makeChip(t, { selectable: true, removable: isCustom, selected: state.selectedIngTypes.has(t) });
      chip.addEventListener('click', () => {
        if (state.selectedIngTypes.has(t)) state.selectedIngTypes.delete(t); else state.selectedIngTypes.add(t);
        chip.setAttribute('aria-pressed', String(state.selectedIngTypes.has(t)));
        if (state.selectedIngTypes.size > 0) clearFieldNote(els.ingTypes);
      });
      els.ingTypes.appendChild(chip);
    });
    const addChip = makeChip('', { isAdd: true });
    addChip.setAttribute('title', 'Přidat typ suroviny');
    addChip.addEventListener('click', () => {
      const name = prompt('Nový typ suroviny');
      if (!name) return;
      if (!state.allIngTypes.includes(name)) state.allIngTypes.push(name);
      state.allIngTypes.sort((a, b) => a.localeCompare(b, 'cs'));
      if (state.userIngTypes.has(name)) {
        state.userIngTypes.delete(name);
        state.selectedIngTypes.delete(name);
        state.allIngTypes = state.allIngTypes.filter((x) => x !== name);
      } else {
        state.userIngTypes.add(name);
        state.selectedIngTypes.add(name);
      }
      renderIngTypeChips();
    });
    els.ingTypes.appendChild(addChip);
  }

  function makeTextRow(placeholder, { removable = true } = {}) {
    const wrap = document.createElement('div');
    wrap.className = removable ? 'row' : 'row row--solo';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input';
    input.placeholder = placeholder;
    wrap.appendChild(input);
    if (removable) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'icon-btn';
      removeBtn.setAttribute('aria-label', 'Smazat');
      removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="22" height="22" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>';
      removeBtn.addEventListener('click', () => wrap.remove());
      wrap.appendChild(removeBtn);
    }
    return wrap;
  }

  function collectValues(listEl) {
    return [...listEl.querySelectorAll('input')]
      .map((i) => i.value.trim())
      .filter((v) => v.length > 0);
  }

  function clearValidation() {
    document.querySelectorAll('.label-note').forEach((el) => el.remove());
    document.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  }

  function clearFieldNote(containerEl) {
    const fieldEl = containerEl.closest('.field') || containerEl.parentElement;
    if (!fieldEl) return;
    const labelEl = fieldEl.querySelector('label');
    const note = labelEl?.querySelector('.label-note');
    if (note) note.remove();
  }

  function addLabelNote(containerEl, message) {
    const fieldEl = containerEl.closest('.field') || containerEl.parentElement;
    if (!fieldEl) return;
    const labelEl = fieldEl.querySelector('label');
    if (!labelEl) return;
    let note = labelEl.querySelector('.label-note');
    if (!note) {
      note = document.createElement('span');
      note.className = 'label-note';
      labelEl.appendChild(note);
    }
    note.textContent = message;
  }

  function validate() {
    clearValidation();
    let hasError = false;

    if (!els.id.value.trim()) {
      els.id.classList.add('invalid');
      addLabelNote(document.getElementById('recipeId'), 'Povinné');
      hasError = true;
    }
    if (!els.title.value.trim()) {
      els.title.classList.add('invalid');
      addLabelNote(document.getElementById('recipeTitleInput'), 'Povinné');
      hasError = true;
    }
    if (state.selectedTags.size === 0) {
      addLabelNote(els.tags, 'Zvolte alespoň 1 štítek');
      hasError = true;
    }
    if (state.selectedIngTypes.size === 0) {
      addLabelNote(els.ingTypes, 'Zvolte alespoň 1 typ suroviny');
      hasError = true;
    }
    const ingValues = collectValues(els.ingredientsFields);
    if (ingValues.length === 0) {
      const firstIngInput = els.ingredientsFields.querySelector('input');
      if (firstIngInput) firstIngInput.classList.add('invalid');
      addLabelNote(els.ingredientsFields, 'Přidejte alespoň 1 surovinu');
      hasError = true;
    }
    const stepValues = collectValues(els.stepsFields);
    if (stepValues.length === 0) {
      const firstStepInput = els.stepsFields.querySelector('input');
      if (firstStepInput) firstStepInput.classList.add('invalid');
      addLabelNote(els.stepsFields, 'Přidejte alespoň 1 krok');
      hasError = true;
    }

    return !hasError;
  }

  function download(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function init() {
    await injectComponents();
    els.year.textContent = new Date().getFullYear();

    try {
      const files = await loadManifest();
      const recipes = (await Promise.all(files.map((p) => loadRecipe(p)))).filter(Boolean);
      collectExistingTagsAndIngTypes(recipes);
    } catch (e) { console.error(e); }

    renderTagChips();
    renderIngTypeChips();

    els.ingredientsFields.appendChild(makeTextRow('např. 2 vejce', { removable: false }));
    els.stepsFields.appendChild(makeTextRow('např. Smíchejte suroviny...', { removable: false }));

    els.addIngredientBtn.addEventListener('click', () => {
      els.ingredientsFields.appendChild(makeTextRow('Další surovina'));
    });
    els.addStepBtn.addEventListener('click', () => {
      els.stepsFields.appendChild(makeTextRow('Další krok'));
    });

    els.form.addEventListener('input', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
      if (target.classList.contains('invalid') && target.value.trim().length > 0) {
        target.classList.remove('invalid');
        const container = target.closest('.field');
        if (container) clearFieldNote(container.querySelector('label') || container);
      }
      if (target.closest('#ingredientsFields')) {
        const ings = collectValues(els.ingredientsFields);
        if (ings.length > 0) clearFieldNote(els.ingredientsFields);
      }
      if (target.closest('#stepsFields')) {
        const steps = collectValues(els.stepsFields);
        if (steps.length > 0) clearFieldNote(els.stepsFields);
      }
    });

    els.saveBtn.addEventListener('click', () => {
      const ok = validate();
      if (!ok) {
        const firstInvalid = document.querySelector('.invalid') || document.querySelector('.label-note');
        firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const id = slugify(els.id.value.trim());
      const data = {
        id,
        title: els.title.value.trim(),
        description: els.desc.value.trim(),
        image: els.image.value.trim(),
        tags: [...state.selectedTags],
        ingredients_types: [...state.selectedIngTypes],
        ingredients: collectValues(els.ingredientsFields),
        steps: collectValues(els.stepsFields),
      };
      download(id + '.json', data);
    });
  }

  init();
})();


