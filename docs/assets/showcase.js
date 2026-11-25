// Animated showcases: Strata Agent replay, vectoriser stages, ComfyFloatBar
// replica and the Photoshop script pipeline. No dependencies. Timers run only
// while a block is on screen and the tab is visible; reduced motion shows the
// final states and keeps every control usable without animation.
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (root, selector) => root.querySelector(selector);
  const $$ = (root, selector) => Array.from(root.querySelectorAll(selector));
  const data = (root, selector) => JSON.parse($(root, selector)?.textContent || 'null');
  const CANCEL = Symbol('cancel');
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'style') node.style.cssText = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) if (child != null) node.append(child.nodeType ? child : document.createTextNode(String(child)));
    return node;
  };
  const img = (src, cls = '', alt = '') => el('img', { src, alt, class: cls || false, decoding: 'async' });

  // One runner per widget: cancellable, pausable, and asleep while off screen.
  class Runner {
    constructor(root) {
      this.visible = false;
      this.paused = false;
      this.token = null;
      this.wakers = new Set();
      const wake = () => { if (this.awake()) for (const fn of [...this.wakers]) fn(); };
      new IntersectionObserver((entries) => { this.visible = entries.some((entry) => entry.isIntersecting); wake(); }, { threshold: 0.12 }).observe(root);
      document.addEventListener('visibilitychange', wake);
      this.wake = wake;
    }
    awake() { return this.visible && !this.paused && document.visibilityState === 'visible'; }
    waitAwake(token) {
      if (token.cancelled) return Promise.reject(CANCEL);
      if (this.awake()) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const fn = () => {
          if (token.cancelled) { this.wakers.delete(fn); reject(CANCEL); }
          else if (this.awake()) { this.wakers.delete(fn); resolve(); }
        };
        token.wakers.add(fn);
        this.wakers.add(fn);
      });
    }
    async sleep(ms, token) {
      let left = ms;
      while (left > 0) {
        await this.waitAwake(token);
        const step = Math.min(left, 120);
        await new Promise((resolve) => setTimeout(resolve, step));
        if (token.cancelled) throw CANCEL;
        left -= step;
      }
    }
    start(job) {
      this.stop();
      const token = this.token = { cancelled: false, wakers: new Set() };
      job(token).catch((error) => { if (error !== CANCEL) console.error(error); });
    }
    stop() {
      if (!this.token) return;
      this.token.cancelled = true;
      for (const fn of this.token.wakers) fn();
      this.token = null;
    }
    setPaused(paused) { this.paused = paused; this.wake(); }
  }

  function toggleButton(button, runner, labels) {
    if (!button) return;
    button.addEventListener('click', () => {
      const paused = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(paused));
      button.textContent = paused ? labels.play : labels.pause;
      runner.setPaused(paused);
    });
  }

  // ---------------------------------------------------------------- visuals
  function animateCount(node, from, to, ms, bar) {
    const start = performance.now();
    return new Promise((resolve) => {
      const tick = (now) => {
        const k = Math.min(1, (now - start) / ms);
        const eased = 1 - Math.pow(1 - k, 3);
        node.textContent = String(Math.round(from + (to - from) * eased));
        if (bar) bar.style.width = (eased * 100) + '%';
        if (k < 1) setTimeout(() => tick(performance.now()), 33); else resolve();
      };
      tick(performance.now());
    });
  }

  async function showVisual(stage, v, runner, token) {
    const instant = reduced.matches;
    const wait = (ms) => instant ? Promise.resolve() : runner.sleep(ms, token);
    let node;
    switch (v.type) {
      case 'image':
        node = el('figure', { class: 'sv-image' + (v.narrow ? ' sv-image--narrow' : '') }, img(v.src), v.caption ? el('figcaption', { text: v.caption }) : null);
        break;
      case 'grid': {
        node = el('div', { class: 'sv-grid', style: '--ratio:' + (v.ratio || '1') });
        const slots = v.images.map(() => el('span', { class: 'is-waiting' }));
        node.append(...slots);
        stage.replaceChildren(node);
        for (const [index, slot] of slots.entries()) {
          await wait(index ? 420 : 200);
          slot.classList.remove('is-waiting');
          slot.append(img(v.images[index]));
        }
        return 1200;
      }
      case 'cards': {
        node = el('div', { class: 'sv-cards' });
        stage.replaceChildren(node);
        for (const src of v.images) { await wait(260); node.append(img(src, 'is-in')); }
        return 2200;
      }
      case 'triptych':
        node = el('figure', { class: 'sv-triptych' }, img(v.src), el('figcaption', {}, v.labels.map((label) => el('span', { text: label }))));
        break;
      case 'compare': {
        const before = el('div', { class: 'sv-compare-before' }, img(v.before));
        node = el('div', { class: 'sv-compare' + (v.zoom ? ' sv-compare--zoom' : ''), style: '--split:50%' }, img(v.after), before,
          el('i', { class: 'sv-compare-line', 'aria-hidden': 'true' }),
          el('span', { class: 'sv-compare-label sv-compare-label--before', text: v.labels[0] }), el('span', { class: 'sv-compare-label sv-compare-label--after', text: v.labels[1] }));
        stage.replaceChildren(node);
        if (!instant) {
          for (const split of [88, 14, 50]) { node.style.setProperty('--split', split + '%'); await wait(1100); }
        }
        return 900;
      }
      case 'tiles': {
        const grid = el('div', { class: 'sv-tiles-grid', 'aria-hidden': 'true' });
        const tiles = Array.from({ length: v.cols * v.rows }, () => el('i'));
        grid.append(...tiles);
        node = el('div', { class: 'sv-tiles', style: `--cols:${v.cols};--rows:${v.rows}` }, img(v.src), grid);
        stage.replaceChildren(node);
        for (const tile of tiles) { tile.classList.add('is-active'); await wait(300); tile.classList.replace('is-active', 'is-done'); }
        return 900;
      }
      case 'layers': {
        const list = el('ol');
        node = el('div', { class: 'sv-layers' }, img(v.src), list);
        stage.replaceChildren(node);
        for (const name of v.layers) { await wait(300); list.append(el('li', { class: 'is-in', text: name })); }
        return 2200;
      }
      case 'progress': {
        const count = el('strong', { text: String(v.from) });
        const bar = el('i', { style: 'width:0' });
        node = el('div', { class: 'sv-progress' }, count, el('span', { text: v.label }), el('div', { class: 'sv-progress-bar' }, bar), v.note ? el('p', { text: v.note }) : null);
        stage.replaceChildren(node);
        if (instant) { count.textContent = String(v.to); bar.style.width = '100%'; }
        else await animateCount(count, v.from, v.to, 2600, bar);
        return 900;
      }
      case 'axes': {
        node = el('div', { class: 'sv-axes' });
        stage.replaceChildren(node);
        for (const [head, items] of v.columns) {
          const column = el('div', {}, el('b', { text: head }));
          node.append(column);
          for (const item of items.split(' · ')) { await wait(90); column.append(el('span', { class: 'is-in', text: item })); }
        }
        return 1400;
      }
      case 'briefs': {
        node = el('ol', { class: 'sv-briefs' });
        stage.replaceChildren(node);
        for (const item of v.items) { await wait(230); node.append(el('li', { class: 'is-in' }, el('code', { text: item }))); }
        return 1200;
      }
      default: return 0;
    }
    stage.replaceChildren(node);
    return v.type === 'image' ? 2400 : 2000;
  }

  // ---------------------------------------------------------------- Strata Agent
  function initStrata(root) {
    const modes = data(root, '[data-strata-script]');
    const labels = JSON.parse(root.dataset.labels);
    const thread = $(root, '[data-sa-thread]');
    const stage = $(root, '[data-sa-stage]');
    const title = $(root, '[data-sa-title]');
    const state = $(root, '[data-sa-state]');
    const gpu = $(root, '[data-sa-gpu]');
    const main = $(root, '.sa-main');
    const tabs = $$(root, '[data-sa-mode]');
    const queue = $$(root, '[data-sa-q]');
    const runner = new Runner(root);
    let current = 0;
    let chosen = false;
    const comfyTool = /series_run|series_verdict|pattern_start|take_found|pattern_build|upscale_trial|upscale_run|series_mockups/;
    const setGpu = (tool) => {
      const comfy = comfyTool.test(tool);
      const label = comfy ? 'GPU · ComfyUI' : 'GPU · Qwen3.8-Flash-Next';
      if (gpu.textContent !== label) { gpu.classList.add('is-swapping'); setTimeout(() => gpu.classList.remove('is-swapping'), 900); }
      gpu.textContent = label;
      gpu.classList.toggle('is-comfy', comfy);
    };
    const agentLine = (step, done) => el('div', { class: 'sa-msg sa-msg--agent' }, el('p', { text: step.say }),
      el('span', { class: 'sa-tool' + (done ? ' is-done' : '') }, el('i', { 'aria-hidden': 'true' }), step.tool));
    const scrollThread = () => { thread.scrollTop = thread.scrollHeight; };
    function renderFinal(index) {
      const mode = modes[index];
      thread.replaceChildren(el('div', { class: 'sa-msg sa-msg--user', text: mode.user }), ...mode.steps.map((step) => agentLine(step, true)));
      const token = { cancelled: false, wakers: new Set() };
      showVisual(stage, mode.steps[mode.steps.length - 1].visual, runner, token);
      state.textContent = labels.done;
      state.classList.remove('is-busy');
      scrollThread();
    }
    async function play(index, token) {
      const mode = modes[index];
      thread.replaceChildren();
      stage.replaceChildren();
      state.textContent = labels.working;
      state.classList.add('is-busy');
      queue.forEach((item, i) => item.classList.toggle('is-active', i === index));
      await runner.sleep(350, token);
      thread.append(el('div', { class: 'sa-msg sa-msg--user is-in', text: mode.user }));
      scrollThread();
      await runner.sleep(900, token);
      for (const step of mode.steps) {
        const line = agentLine(step, false);
        line.classList.add('is-in');
        thread.append(line);
        scrollThread();
        setGpu(step.tool);
        await runner.sleep(650, token);
        const dwell = await showVisual(stage, step.visual, runner, token);
        await runner.sleep(dwell, token);
        $(line, '.sa-tool').classList.add('is-done');
      }
      state.textContent = labels.done;
      state.classList.remove('is-busy');
      queue[index]?.classList.add('is-done');
      await runner.sleep(6500, token);
      if (!chosen) select((index + 1) % modes.length);
    }
    function select(index) {
      current = index;
      tabs.forEach((tab, i) => tab.setAttribute('aria-selected', String(i === index)));
      main.setAttribute('aria-labelledby', tabs[index].id);
      title.textContent = modes[index].title;
      if (reduced.matches) { runner.stop(); renderFinal(index); return; }
      runner.start((token) => play(index, token));
    }
    tabs.forEach((tab, index) => tab.addEventListener('click', () => { chosen = true; select(index); }));
    $(root, '[data-sa-replay]').addEventListener('click', () => select(current));
    toggleButton($(root, '[data-sa-toggle]'), runner, labels);
    // Keyboard: arrows move between mode tabs.
    $(root, '.sa-modes').addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
      const index = (current + delta + tabs.length) % tabs.length;
      chosen = true;
      tabs[index].focus();
      select(index);
    });
    if (!reduced.matches) select(0);
  }

  // ---------------------------------------------------------------- Vectoriser
  function initVectorizer(root) {
    const examples = data(root, '[data-vz-examples]');
    const labels = JSON.parse(root.dataset.labels);
    const canvas = $(root, '[data-vz-canvas]');
    const input = $(root, '[data-vz-input]');
    const quant = $(root, '[data-vz-quant]');
    const host = $(root, '[data-vz-svg]');
    const badge = $(root, '[data-vz-badge]');
    const palette = $(root, '[data-vz-palette]');
    const stats = $(root, '[data-vz-stats]');
    const zoomRaster = $(root, '[data-vz-zoom-raster]');
    const zoomVector = $(root, '[data-vz-zoom-vector]');
    const stageButtons = $$(root, '[data-vz-stage]');
    const nodes = $$(root, '[data-vz-node]');
    const exampleButtons = $$(root, '[data-vz-example]');
    const runner = new Runner(root);
    const cache = new Map();
    // Points on a colour edge; the boxes show ~25 source pixels at 6×.
    const focus = { flowers: [0.27, 0.305], autumn: [0.105, 0.42] };
    let example = 0;
    let stage = 5;
    let auto = !reduced.matches;

    async function load(index) {
      const ex = examples[index];
      if (cache.has(ex.key)) return cache.get(ex.key);
      const text = await (await fetch(ex.svg)).text();
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const svg = document.importNode(doc.documentElement, true);
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('vz-svg-el');
      const counts = new Map();
      const paths = $$(svg, 'path');
      for (const path of paths) {
        const fill = path.closest('[fill]')?.getAttribute('fill') || '#000';
        path.style.setProperty('--c', fill);
        counts.set(fill, (counts.get(fill) || 0) + 1);
      }
      const info = { svg, paths, colours: [...counts.entries()].sort((a, b) => b[1] - a[1]), lengths: null };
      cache.set(ex.key, info);
      return info;
    }
    function setNodes(index) {
      nodes.forEach((node, i) => { node.classList.toggle('is-active', i === index); node.classList.toggle('is-done', i < index); });
      stageButtons.forEach((button, i) => button.setAttribute('aria-current', i === index ? 'step' : 'false'));
    }
    function strokeWidth() {
      const width = host.getBoundingClientRect().width || 600;
      return (1.3 * 32640 / width).toFixed(1);
    }
    function paintPalette(info, animate) {
      palette.replaceChildren(...info.colours.map(([colour], i) => el('i', { style: `--c:${colour};--d:${animate ? i * 45 : 0}ms`, class: animate ? 'is-pop' : '' })));
    }
    function paintStats(info, ex) {
      stats.textContent = `${info.colours.length} ${labels.colours} · ${info.paths.length} ${labels.shapes} · ${labels.size} ${Math.round(ex.svgBytes / 1024)} KB`;
    }
    function paintZoom(ex) {
      const [fx, fy] = focus[ex.key];
      for (const [box, src] of [[zoomRaster, ex.input], [zoomVector, ex.svg]]) {
        box.style.backgroundImage = `url("${src}")`;
        box.style.backgroundPosition = `${fx * 100}% ${fy * 100}%`;
        box.style.backgroundSize = `${1448 * 6}px auto`;
      }
    }
    async function render(index, animate, token) {
      const ex = examples[example];
      const info = await load(example);
      if (token?.cancelled) throw CANCEL;
      stage = index;
      canvas.dataset.stage = String(index);
      setNodes(index);
      const paths = info.paths;
      if (!host.contains(info.svg)) host.replaceChildren(info.svg);
      info.svg.style.setProperty('--sw', strokeWidth());
      canvas.classList.remove('is-scanning', 'is-outline', 'is-stacking');
      for (const path of paths) { path.style.transition = 'none'; path.style.opacity = ''; path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; }
      const badges = ['PNG · 1448 × 1086', 'RealESRGAN ×4 → 2 MP · 1632 × 1224', `${info.colours.length} ${labels.colours}`, 'potrace ×2', `${paths.length} ${labels.shapes}`, `SVG · ${Math.round(ex.svgBytes / 1024)} KB`];
      badge.textContent = badges[index];
      paintPalette(info, animate && index === 2);
      paintStats(info, ex);
      if (index === 1 && animate) { void canvas.offsetWidth; canvas.classList.add('is-scanning'); }
      if (index === 3) {
        canvas.classList.add('is-outline');
        if (animate) {
          if (!info.lengths) info.lengths = paths.map((path) => path.getTotalLength());
          paths.forEach((path, i) => { path.style.strokeDasharray = String(info.lengths[i]); path.style.strokeDashoffset = String(info.lengths[i]); });
          void host.getBoundingClientRect();
          const step = 2600 / paths.length;
          paths.forEach((path, i) => { path.style.transition = `stroke-dashoffset 1.4s ease ${Math.round(i * step)}ms`; path.style.strokeDashoffset = '0'; });
        }
      }
      if (index === 4) {
        canvas.classList.add('is-stacking');
        if (animate) {
          paths.forEach((path) => { path.style.opacity = '0'; });
          void host.getBoundingClientRect();
          const step = 2400 / paths.length;
          paths.forEach((path, i) => { path.style.transition = `opacity .45s ease ${Math.round(i * step)}ms`; path.style.opacity = '1'; });
        }
      }
      if (index === 5) paintZoom(ex);
    }
    const durations = [1700, 2600, 2600, 4300, 3600, 5200];
    async function cycle(token, from = 0) {
      for (;;) {
        for (let i = from; i < 6; i++) {
          await render(i, true, token);
          await runner.sleep(durations[i], token);
        }
        from = 0;
        await runner.sleep(1800, token);
        if (!auto) return;
        await selectExample((example + 1) % examples.length, false);
      }
    }
    async function selectExample(index, restart = true) {
      example = index;
      exampleButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      const ex = examples[index];
      input.src = ex.input;
      quant.src = ex.quant;
      input.alt = ex.label;
      host.replaceChildren();
      if (restart) {
        if (auto) runner.start((token) => cycle(token));
        else await render(stage, false);
      }
    }
    exampleButtons.forEach((button, index) => button.addEventListener('click', () => selectExample(index)));
    stageButtons.forEach((button, index) => button.addEventListener('click', () => {
      auto = false;
      runner.stop();
      const token = { cancelled: false, wakers: new Set() };
      render(index, !reduced.matches, token).catch(() => {});
    }));
    $(root, '[data-vz-replay]').addEventListener('click', () => { auto = !reduced.matches; if (auto) runner.start((token) => cycle(token)); else render(5, false); });
    toggleButton($(root, '[data-vz-toggle]'), runner, labels);
    window.addEventListener('resize', () => { const info = cache.get(examples[example].key); if (info) info.svg.style.setProperty('--sw', strokeWidth()); });
    if (auto) runner.start((token) => cycle(token));
    else render(5, false).catch(() => {});
  }

  // ---------------------------------------------------------------- ComfyFloatBar replica
  function initFloatbar(root) {
    const actions = data(root, '[data-cfb-actions]');
    const labels = JSON.parse(root.dataset.labels);
    const panel = $(root, '[data-cfb]');
    const canvas = $(root, '[data-ps-canvas]');
    const list = $(root, '[data-ps-layers]');
    const tab = $(root, '[data-ps-tab]');
    const status = $(root, '[data-ps-status]');
    const empty = $(root, '[data-ps-empty]');
    const ants = $(root, '[data-ps-ants]');
    const model = $(panel, '[data-cfb-model]');
    const dot = $(panel, '[data-cfb-dot]');
    const progress = $(panel, '[data-cfb-progress]');
    const progressText = $(panel, '[data-cfb-progress-text]');
    const bar = $(panel, '[data-cfb-bar]');
    const toast = $(panel, '[data-cfb-toast]');
    let layers = [];
    let docKey = '';
    let busy = null;
    let toastTimer = 0;
    let uid = 0;

    const say = (text) => {
      toast.textContent = text;
      toast.classList.add('is-on');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('is-on'), 3600);
    };
    // Panel behaviour: sections, tabs, sliders, toggles.
    $$(panel, '.cfb-sec-head').forEach((head) => head.addEventListener('click', () => {
      const section = head.parentElement;
      const open = !section.classList.contains('is-open');
      section.classList.toggle('is-open', open);
      head.setAttribute('aria-expanded', String(open));
      head.nextElementSibling.hidden = !open;
    }));
    $$(panel, '[data-cfb-tabs]').forEach((group) => group.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cfb-tab]');
      if (!button) return;
      const name = group.dataset.cfbTabs;
      $$(group, '[data-cfb-tab]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      $$(group.parentElement, '[data-cfb-pane]').forEach((pane) => { if (pane.dataset.cfbPane.startsWith(name + ':')) pane.hidden = pane.dataset.cfbPane !== name + ':' + button.dataset.cfbTab; });
      if (name === 'aplus') {
        const premium = button.dataset.cfbTab === 'premium';
        const run = $(group.parentElement, '[data-cfb-run="aplus"]');
        if (run) run.textContent = premium ? 'Создать Premium A+ комплект' : 'Создать Basic A+ комплект';
        const size = $(group.parentElement, '[data-cfb-aplus-size]');
        if (size) size.selectedIndex = premium ? 1 : 0;
      }
    }));
    $$(panel, 'input[type="range"]').forEach((range) => range.addEventListener('input', () => {
      range.nextElementSibling.textContent = range.value + (range.dataset.unit || '');
    }));
    $$(panel, '[data-cfb-dir]').forEach((button) => button.addEventListener('click', () => {
      const on = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(on));
      $(button, 'small').textContent = (on ? '1024' : '0') + ' px';
    }));
    $$(panel, '[data-cfb-select]').forEach((button) => button.addEventListener('click', () => {
      ants.hidden = false;
      ants.classList.remove('is-on');
      void ants.offsetWidth;
      ants.classList.add('is-on');
      setTimeout(() => { ants.hidden = true; }, 1600);
      const drop = $(button.closest('.cfb-pane, .cfb-sec-body'), '[data-cfb-drop]');
      if (drop) drop.textContent = 'Выделение из Photoshop · 1000 × 1000 px';
      say('Выделение отправлено в панель');
    }));
    $(panel, '[data-cfb-free]').addEventListener('click', () => { model.textContent = 'Модель: —'; dot.className = 'cfb-dot is-idle'; say('Память ComfyUI освобождена'); });
    $(panel, '[data-cfb-cancel]').addEventListener('click', () => { if (busy) busy.cancelled = true; });

    // Photoshop document: a white background plus result layers.
    function renderLayers() {
      $$(canvas, '.ps-layer:not(.ps-layer--bg)').forEach((node) => node.remove());
      const bg = $(canvas, '.ps-layer--bg');
      bg.hidden = !layers.find((layer) => layer.id === 'bg').visible;
      for (const layer of layers.filter((item) => item.id !== 'bg')) {
        const node = el('div', { class: 'ps-layer' + (layer.reveal ? ' is-revealing' : '') + (layer.row ? ' ps-layer--row' : ''), 'data-layer-id': layer.id });
        if (layer.row) node.append(...layer.row.map((src) => img(src)));
        else node.append(img(layer.src));
        node.hidden = !layer.visible;
        canvas.append(node);
        // Force a style flush so the clip-path transition starts from the hidden state.
        if (layer.reveal) { layer.reveal = false; void node.offsetWidth; node.classList.add('is-shown'); }
      }
      empty.hidden = layers.length > 1;
      list.replaceChildren(...[...layers].reverse().map((layer, index) => {
        const thumb = layer.id === 'bg' ? el('span', { class: 'ps-thumb ps-thumb--white' })
          : el('span', { class: 'ps-thumb', style: `background-image:url("${layer.row ? layer.row[0] : layer.src}")` });
        const eye = el('button', { type: 'button', class: 'ps-eye', 'aria-pressed': String(layer.visible), 'aria-label': labels.toggle, 'data-ps-eye': layer.id, text: '👁' });
        return el('li', { class: index === 0 ? 'is-active' : '', 'data-layer-li': layer.id }, eye, thumb, el('span', { text: layer.name }));
      }));
    }
    list.addEventListener('click', (event) => {
      const eye = event.target.closest('[data-ps-eye]');
      if (!eye) return;
      const layer = layers.find((item) => item.id === eye.dataset.psEye);
      layer.visible = !layer.visible;
      renderLayers();
    });
    function resetDoc(name = 'portfolio-demo.psd') {
      layers = [{ id: 'bg', name: labels.background, visible: true }];
      docKey = '';
      tab.textContent = name + ' @ 50% (RGB/8)';
      status.textContent = '50% · RGB/8';
      renderLayers();
    }
    function addLayer(layer) {
      if (layer.hideBelow) layers.forEach((item) => { item.visible = false; });
      layers.push({ id: 'l' + (++uid), visible: true, reveal: !reduced.matches, ...layer });
      renderLayers();
    }
    $(root, '[data-ps-reset]').addEventListener('click', () => { if (!busy) resetDoc(); });

    const wait = (ms, token) => new Promise((resolve, reject) => setTimeout(() => token.cancelled ? reject(CANCEL) : resolve(), reduced.matches ? Math.min(ms, 120) : ms));
    async function run(key) {
      if (busy) return;
      const action = actions[key];
      if (!action) return;
      if (action.requires && docKey !== action.requires) await run(action.requires);
      const token = busy = { cancelled: false };
      // On narrow screens the panel sits below the canvas: bring the result into view.
      if (getComputedStyle(panel).position === 'static') $(root, '.ps-window').scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
      model.textContent = 'Модель: ' + action.model;
      dot.className = 'cfb-dot is-busy';
      progress.hidden = false;
      $$(panel, '[data-cfb-run]').forEach((button) => { button.dataset.wasDisabled = button.disabled ? '1' : ''; button.disabled = true; });
      try {
        if (!action.requires) {
          resetDoc(action.doc);
          if (action.before) addLayer({ name: 'Слой 0', src: action.before });
        } else tab.textContent = action.doc + ' @ 50% (RGB/8)';
        const steps = action.steps;
        for (const [index, label] of steps.entries()) {
          progressText.textContent = label;
          bar.style.width = ((index + 1) / steps.length * 100) + '%';
          await wait(index === steps.length - 1 ? 650 : 1050, token);
          if (action.sequence && index < action.sequence.length) { const item = action.sequence[index]; addLayer({ name: item.layer, src: item.src, hideBelow: item.hideBelow }); }
        }
        if (action.after) addLayer({ name: action.layer, src: action.after, hideBelow: action.hideBelow });
        if (action.row) addLayer({ name: action.layer, row: action.row, hideBelow: true });
        docKey = key;
        dot.className = 'cfb-dot is-ready';
        const last = layers[layers.length - 1];
        say('Готово: слой «' + last.name + '» вставлен в Photoshop');
        if (action.next) $(panel, `[data-cfb-run="${action.next}"]`)?.classList.add('is-next');
        else $$(panel, '.is-next').forEach((node) => node.classList.remove('is-next'));
      } catch (error) {
        if (error !== CANCEL) throw error;
        dot.className = 'cfb-dot is-idle';
        say('Отменено');
      } finally {
        progress.hidden = true;
        bar.style.width = '0';
        busy = null;
        $$(panel, '[data-cfb-run]').forEach((button) => { button.disabled = button.dataset.wasDisabled === '1'; });
      }
    }
    panel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cfb-run]');
      if (button && !button.disabled) run(button.dataset.cfbRun);
    });
    resetDoc();
  }

  // ---------------------------------------------------------------- Photoshop pipeline
  function initPipeline(section) {
    const root = $(section, '[data-pipeline]');
    const info = data(root, '[data-pp-data]');
    const labels = info.labels;
    const visual = $(root, '[data-pp-visual]');
    const log = $(root, '[data-pp-log]');
    const script = $(root, '[data-pp-script]');
    const title = $(root, '[data-pp-title]');
    const text = $(root, '[data-pp-text]');
    const buttons = $$(root, '[data-pp-step]');
    const runner = new Runner(root);
    let current = info.steps.length - 1;
    const instant = () => reduced.matches;
    const time = () => new Date().toTimeString().slice(0, 8);
    const write = (line) => { log.textContent += line + '\n'; log.scrollTop = log.scrollHeight; };
    const art = info.art;
    const file = (src, name, cls = '') => el('figure', { class: 'pp-file ' + cls }, img(src), el('figcaption', {}, el('code', { text: name })));
    const folder = (name) => el('div', { class: 'pp-folder' }, el('span', { class: 'pp-folder-icon', 'aria-hidden': 'true' }), el('code', { text: name }));
    const sides = [['left', 'l'], ['center', 'c'], ['right', 'r']];

    const stages = {
      async rename(token, wait) {
        const raw = ['p71_7f3a.png', 'p71_09bc.png', 'p71_c41d.png'];
        const files = sides.map(([side], i) => file(art[side], raw[i]));
        visual.replaceChildren(el('div', { class: 'pp-row' }, folder('D:/загрузки'), el('div', { class: 'pp-files' }, files)));
        write(`[${time()}] ренейм.jsx · D:/загрузки`);
        await wait(1100);
        const suffixes = ['_r', '_c', '_l'];
        files.forEach((node, i) => node.classList.add('is-shuffling'));
        await wait(700);
        sides.forEach(([, s], i) => { $(files[i], 'code').textContent = `p71_${s}.png`; files[i].classList.remove('is-shuffling'); files[i].classList.add('is-renamed'); });
        write('Готово.\nПереименовано: 3\nПропущено: 0');
        void suffixes;
        return 1600;
      },
      async topaz(token, wait) {
        const files = sides.map(([side, s]) => file(art[side], `p71_${s}.png`, 'is-upscaling'));
        visual.replaceChildren(el('div', { class: 'pp-row' }, el('div', { class: 'pp-files' }, files), el('span', { class: 'pp-arrow', 'aria-hidden': 'true', text: '→' }), folder('F:/work/work2/topaz')));
        write(`[${time()}] Topaz Gigapixel · ×4 · ${labels.external}`);
        for (const node of files) { await wait(380); node.classList.add('is-up'); }
        write('→ topaz/p71_l.png, p71_c.png, p71_r.png');
        return 1500;
      },
      async sort(token, wait) {
        const source = folder('topaz/');
        const target = folder('p71/');
        const files = sides.map(([side, s]) => file(art[side], `p71_${s}.png`));
        const tray = el('div', { class: 'pp-files pp-files--tray' }, files);
        visual.replaceChildren(el('div', { class: 'pp-sort' }, el('div', { class: 'pp-sort-col' }, source, tray), el('span', { class: 'pp-arrow', 'aria-hidden': 'true', text: '→' }), el('div', { class: 'pp-sort-col' }, target, el('div', { class: 'pp-files pp-files--target' }))));
        write(`[${time()}] сортировка.jsx · F:/work/work2/topaz`);
        const dest = $(visual, '.pp-files--target');
        await wait(700);
        for (const node of files) { node.classList.add('is-moving'); await wait(420); dest.append(node); node.classList.remove('is-moving'); }
        write('Создано папок: 1\nПеренесено файлов: 3\nПропущено: 0\nОшибок: 0');
        return 1600;
      },
      async mockups(token, wait) {
        const frames = [[0.1655, 0.138, 0.1964, 0.31], [0.398, 0.138, 0.2018, 0.31], [0.636, 0.138, 0.1964, 0.31]];
        const result = el('div', { class: 'pp-mock' }, img(art.mockup, 'pp-mock-result'),
          ...frames.map(([x, y, w, h], i) => el('span', { class: 'pp-so', style: `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%` }, img(art[sides[i][0]]))));
        const counter = el('strong', { text: '0/20' });
        const thumbs = el('div', { class: 'pp-templates' }, Array.from({ length: 20 }, (_, i) => el('span', {}, img(info.templates[i % info.templates.length]))));
        visual.replaceChildren(el('div', { class: 'pp-mockups' }, result, el('div', { class: 'pp-mock-side' }, el('p', { class: 'pp-counter' }, 'Mockup triple ', counter), thumbs)));
        write(`[${time()}] Подготовка Photoshop...`);
        write(`[${time()}] Найдено папок: 1`);
        write(`[${time()}] Папок для обработки: 1`);
        write(`[${time()}] Папка 1/1: p71`);
        write(`[${time()}]   Найдено изображений: 3`);
        await wait(500);
        result.classList.add('is-placing');
        await wait(1500);
        result.classList.add('is-placed');
        const cells = $$(thumbs, 'span');
        for (let i = 0; i < 20; i++) {
          cells[i].classList.add('is-done');
          counter.textContent = `${i + 1}/20`;
          if (i < 3 || i === 19) write(`[${time()}]   Mockup triple ${i + 1}/20`);
          else if (i === 3) write('  …');
          await wait(instant() ? 0 : 150);
        }
        write(`[${time()}]   p71_y_mockup_1…20.png`);
        return 1500;
      },
      async sizes(token, wait) {
        const grid = el('div', { class: 'pp-sizes' });
        visual.replaceChildren(grid);
        write(`[${time()}]   ${'11 печатных размеров × 3 изображения'}`);
        for (const [w, h] of info.sizes) {
          const name = `${w}×${h} in`;
          const px = `${Math.round(w * 300)}×${Math.round(h * 300)} px`;
          grid.append(el('figure', { class: 'pp-size is-in', style: `--w:${w};--h:${h}` }, el('span', { class: 'pp-size-frame' }, img(art.center)), el('figcaption', {}, el('b', { text: name }), el('small', { text: px }))));
          if (grid.children.length <= 2 || grid.children.length === 11) write(`[${time()}]   p71_c_${String(w).replace('.', '.')}x${h}in.png · ${px}`);
          await wait(240);
        }
        write(`[${time()}]   33 PNG · 300 dpi`);
        write(`[${time()}] Готово папок: 1/1`);
        return 2200;
      },
      async catalog(token, wait) {
        const slots = 30;
        const sheet = el('div', { class: 'pp-sheet' });
        const cells = Array.from({ length: slots }, () => el('span'));
        sheet.append(...cells);
        const tabs = el('div', { class: 'pp-sheet-tabs' }, [1, 2, 3, 4].map((n) => el('span', { text: `${labels.sheet} 0${n}` })));
        const note = el('p', { class: 'pp-sheet-note', text: '' });
        visual.replaceChildren(el('div', { class: 'pp-catalog' }, el('div', {}, tabs, sheet), note));
        write(`[${time()}] automation_100_images_all_psd_console.jsx`);
        write(`[${time()}] Папка: japandi · 100`);
        write(`[${time()}] mockup_100.psd · смарт-объектов: ${slots}`);
        const used = new Set();
        const sprite = (cell, d) => { cell.style.backgroundImage = `url("${art.sprite}")`; cell.style.backgroundPosition = `${(d % 10) / 9 * 100}% ${Math.floor(d / 10) / 9 * 100}%`; };
        for (let batch = 0; batch < 4; batch++) {
          $$(tabs, 'span').forEach((tabNode, i) => tabNode.classList.toggle('is-active', i === batch));
          cells.forEach((cell) => { cell.className = ''; cell.style.backgroundImage = ''; });
          used.clear();
          const start = batch * slots;
          const count = Math.min(slots, 100 - start);
          for (let i = 0; i < count; i++) { sprite(cells[i], start + i); used.add(start + i); cells[i].className = 'is-in'; if (i % 3 === 0) await wait(instant() ? 0 : 40); }
          if (count < slots) {
            await wait(500);
            let pick = 7;
            for (let i = count; i < slots; i++) {
              while (used.has(pick % 100)) pick += 13;
              used.add(pick % 100);
              sprite(cells[i], pick % 100);
              cells[i].className = 'is-in is-random';
              pick += 13;
              await wait(instant() ? 0 : 50);
            }
            note.textContent = `${count} + ${slots - count} · ${labels.random}`;
          }
          write(`[${time()}] mockup_100_0${batch + 1}.png`);
          await wait(1100);
        }
        return 1800;
      },
      async result(token, wait) {
        const row = el('div', { class: 'pp-result' }, [art.mockup, art.p74, art.p127].map((src) => img(src, 'is-in')));
        const sum = el('ul', { class: 'pp-summary' },
          el('li', {}, el('b', { text: '3' }), labels.sources), el('li', {}, el('b', { text: '20' }), labels.mockups), el('li', {}, el('b', { text: '33' }), labels.prints), el('li', {}, el('b', { text: '56' }), labels.files));
        visual.replaceChildren(row, sum);
        write(`[${time()}] p71/ · 56 ${labels.files}`);
        return 3600;
      },
    };

    function copy(index) {
      const step = info.steps[index];
      script.textContent = step.script + (step.external ? ' · ' + labels.external : '');
      title.textContent = step.title;
      text.textContent = step.text;
      buttons.forEach((button, i) => button.setAttribute('aria-current', i === index ? 'step' : 'false'));
    }
    async function playStep(index, token) {
      current = index;
      copy(index);
      const wait = (ms) => instant() ? Promise.resolve() : runner.sleep(ms, token);
      const dwell = await stages[info.steps[index].id](token, wait);
      return dwell;
    }
    async function sequence(token, from) {
      log.textContent = '';
      for (let i = from; ; i = (i + 1) % info.steps.length) {
        if (i === 0) log.textContent = '';
        const dwell = await playStep(i, token);
        await runner.sleep(dwell, token);
      }
    }
    buttons.forEach((button, index) => button.addEventListener('click', () => {
      if (reduced.matches) { runner.stop(); log.textContent = ''; playStep(index, { cancelled: false, wakers: new Set() }); return; }
      runner.start((token) => sequence(token, index));
    }));
    $(section, '[data-pp-replay]').addEventListener('click', () => {
      if (reduced.matches) return;
      runner.start((token) => sequence(token, 0));
    });
    toggleButton($(section, '[data-pp-toggle]'), runner, labels);
    if (!reduced.matches) runner.start((token) => sequence(token, 0));
  }

  const start = () => {
    for (const root of $$(document, '[data-strata]')) initStrata(root);
    for (const root of $$(document, '[data-vectorizer]')) initVectorizer(root);
    for (const root of $$(document, '[data-floatbar]')) initFloatbar(root);
    for (const section of $$(document, '.sc-pipeline')) initPipeline(section);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
