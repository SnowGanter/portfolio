// ComfyFloatBar demo: the interface ported from the live app (floatbar-app.html, ids prefixed
// "cfb-") driven by the same UI rules as the app's renderer, plus a small Photoshop window.
// ComfyUI does not run in the browser: every button goes through the app's steps and inserts
// a prepared result from the owner's projects as a layer. The mask brush really paints.
(() => {
  'use strict';
  const root = document.querySelector('[data-floatbar]');
  const app = root?.querySelector('[data-cfba]');
  if (!root || !app) return;
  const D = JSON.parse(root.querySelector('[data-cfba-data]').textContent);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const CANCEL = Symbol('cancel');
  const $ = (id) => app.querySelector('#cfb-' + id);
  const $$ = (selector, scope = app) => Array.from(scope.querySelectorAll(selector));
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
  const show = (node, visible) => node?.classList.toggle('hidden', !visible);
  const radio = (name) => app.querySelector(`input[name="${name}"]:checked`)?.value;
  const optionText = (select) => select?.options[select.selectedIndex]?.textContent.trim() || '';
  const val = (id) => $(id)?.value;

  // ---------------------------------------------------------------- status bar, task progress, queue
  const statusBar = $('statusBar');
  const indicator = $('statusIndicator');
  const modelText = $('lastModelText');
  const taskInfo = $('taskInfoText');
  const progress = $('taskProgress');
  const fill = $('taskProgressFill');
  const progressText = $('taskProgressText');
  const queueChip = $('taskQueueChip');
  const cancelBtn = $('cancelBtn');
  const setStatus = (text) => { statusBar.textContent = text; };
  const setIndicator = (state) => {
    indicator.className = 'status-indicator ' + state;
    indicator.textContent = state === 'working' ? '⏳' : '';
  };
  setIndicator('checking');
  setTimeout(() => { setIndicator('connected'); setStatus('Подключено к ComfyUI · ' + (val('serverIP') || '127.0.0.1:8188')); }, reduced.matches ? 0 : 900);

  // ---------------------------------------------------------------- Photoshop window
  const canvas = root.querySelector('[data-ps-canvas]');
  const list = root.querySelector('[data-ps-layers]');
  const tab = root.querySelector('[data-ps-tab]');
  const psStatus = root.querySelector('[data-ps-status]');
  const empty = root.querySelector('[data-ps-empty]');
  const ants = root.querySelector('[data-ps-ants]');
  const tilesBox = root.querySelector('[data-ps-tiles]');
  let layers = [];
  let doc = { name: 'portfolio-demo.psd', key: '' };
  let uid = 0;
  function renderLayers() {
    canvas.querySelectorAll('.ps-layer:not(.ps-layer--bg)').forEach((node) => node.remove());
    canvas.querySelector('.ps-layer--bg').hidden = !layers[0].visible;
    for (const layer of layers.slice(1)) {
      const node = el('div', { class: 'ps-layer' + (layer.reveal ? ' is-revealing' : '') + (layer.row ? ' ps-layer--row' : '') });
      if (layer.row) node.append(...layer.row.map((src) => el('img', { src, alt: '' })));
      else node.append(el('img', { src: layer.src, alt: layer.name }));
      node.hidden = !layer.visible;
      canvas.insertBefore(node, tilesBox);
      if (layer.reveal) { layer.reveal = false; void node.offsetWidth; node.classList.add('is-shown'); }
    }
    empty.hidden = layers.length > 1;
    list.replaceChildren(...[...layers].reverse().map((layer, index) => {
      const thumb = layer.id === 'bg' ? el('span', { class: 'ps-thumb ps-thumb--white' })
        : el('span', { class: 'ps-thumb', style: `background-image:url("${layer.row ? layer.row[1] || layer.row[0] : layer.src}")` });
      return el('li', { class: index === 0 ? 'is-active' : '' },
        el('button', { type: 'button', class: 'ps-eye', 'aria-pressed': String(layer.visible), 'aria-label': D.labels.toggle, 'data-ps-eye': layer.id, text: '👁' }),
        thumb, el('span', { text: layer.name }));
    }));
  }
  list.addEventListener('click', (event) => {
    const eye = event.target.closest('[data-ps-eye]');
    if (!eye) return;
    const layer = layers.find((item) => item.id === eye.dataset.psEye);
    layer.visible = !layer.visible;
    renderLayers();
  });
  function openDoc(name, key = '') {
    layers = [{ id: 'bg', name: D.labels.background, visible: true }];
    doc = { name, key };
    tab.textContent = name + ' @ 50% (RGB/8)';
    psStatus.textContent = '50% · RGB/8';
    renderLayers();
  }
  function addLayer(layer) {
    if (layer.hideBelow) layers.forEach((item) => { item.visible = false; });
    const entry = { id: 'l' + (++uid), visible: true, reveal: !reduced.matches, ...layer };
    if (layer.hidden) entry.visible = false;
    layers.push(entry);
    renderLayers();
    return entry;
  }
  const topLayer = () => [...layers].reverse().find((layer) => layer.id !== 'bg' && layer.visible);
  function ensureDoc(input) {
    if (doc.input === input.name && layers.length > 1) return;
    openDoc(input.doc || input.name.replace(/\.\w+$/, '.psd'), 'source');
    doc.input = input.name;
    addLayer({ name: 'Слой 0', src: input.src, row: input.row, reveal: false });
  }
  function marchingAnts() {
    ants.hidden = false;
    ants.classList.remove('is-on');
    void ants.offsetWidth;
    ants.classList.add('is-on');
    setTimeout(() => { ants.hidden = true; }, 1600);
  }
  root.querySelector('[data-ps-reset]').addEventListener('click', () => { if (!busy) { openDoc('portfolio-demo.psd'); setStatus('Документ сброшен'); } });

  // ---------------------------------------------------------------- task runner
  const queue = [];
  let busy = null;
  const wait = (ms, token) => new Promise((resolve, reject) => setTimeout(() => (token.cancelled ? reject(CANCEL) : resolve()), reduced.matches ? Math.min(ms, 120) : ms));
  const clock = (ms) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function updateQueue() {
    queueChip.classList.toggle('hidden', !queue.length);
    queueChip.textContent = 'Очередь: ' + queue.length;
    $$('.full-btn.action-btn').forEach((button) => button.classList.toggle('queue-mode', !!busy));
  }
  queueChip.addEventListener('click', () => { queue.length = 0; updateQueue(); setStatus('Очередь очищена'); });
  cancelBtn.addEventListener('click', () => { if (busy) busy.cancelled = true; });
  async function run(task) {
    if (busy) { queue.push(task); updateQueue(); setStatus('В очереди: ' + task.name); return; }
    const token = busy = { cancelled: false };
    const started = Date.now();
    setIndicator('working');
    modelText.textContent = 'Модель: ' + task.model;
    modelText.title = 'Последняя использованная модель';
    show(taskInfo, true);
    const tick = () => { taskInfo.textContent = task.name + ' · ' + clock(Date.now() - started); };
    tick();
    const timer = setInterval(tick, 500);
    show(progress, true); show(progressText, true);
    cancelBtn.classList.add('visible');
    updateQueue();
    // On narrow screens the panel sits under the Photoshop window: bring the canvas into view.
    if (getComputedStyle(app).position === 'static') root.querySelector('.ps-window').scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
    try {
      await task.prepare?.(token);
      const steps = task.steps.filter(Boolean);
      for (const [index, step] of steps.entries()) {
        setStatus(step);
        const share = (index + 1) / steps.length;
        fill.style.width = (share * 100) + '%';
        progressText.textContent = Math.round(share * 100) + '%';
        await task.onStep?.(index, token);
        await wait(index === steps.length - 1 ? 700 : 1050, token);
      }
      await task.finish(token);
      setStatus(task.done || 'Готово: результат вставлен в Photoshop');
      if ($('taskNotificationsEnabled')?.checked) notify(task.name);
    } catch (error) {
      if (error !== CANCEL) { console.error(error); setStatus('Ошибка: ' + error.message); }
      else setStatus('Задача отменена');
      tilesBox.hidden = true;
    } finally {
      clearInterval(timer);
      show(taskInfo, false); show(progress, false); show(progressText, false);
      fill.style.width = '0';
      cancelBtn.classList.remove('visible');
      setIndicator('connected');
      busy = null;
      const next = queue.shift();
      updateQueue();
      if (next) run(next);
    }
  }
  // Windows notification stand-in: the title bar flashes the finished task name.
  function notify(name) {
    const chat = $('chatIconBtn');
    chat.classList.add('attention');
    setTimeout(() => chat.classList.remove('attention'), reduced.matches ? 0 : 2400);
    chat.title = 'Задача завершена: ' + name;
  }

  // ---------------------------------------------------------------- accordion (app: toggleSection)
  function toggleSection(header, force) {
    const content = $(header.dataset.target.replace(/^cfb-/, ''));
    const arrow = header.querySelector('.arrow');
    const open = force ?? content.classList.contains('hidden');
    if (header.classList.contains('tool-header') && open) {
      $$('.tool-header').forEach((other) => {
        if (other === header) return;
        const otherContent = $(other.dataset.target.replace(/^cfb-/, ''));
        if (!otherContent.classList.contains('hidden')) {
          otherContent.classList.add('hidden');
          other.querySelector('.arrow').textContent = '▲';
          other.classList.remove('is-open');
          other.setAttribute('aria-expanded', 'false');
        }
      });
    }
    content.classList.toggle('hidden', !open);
    arrow.textContent = open ? '▼' : '▲';
    header.classList.toggle('is-open', open && header.classList.contains('tool-header'));
    header.setAttribute('aria-expanded', String(open));
    queueMicrotask(refreshStickyAction);
  }
  $$('.tool-header, .sub-tool-header').forEach((header) => {
    header.setAttribute('role', 'button');
    header.tabIndex = 0;
    header.setAttribute('aria-expanded', 'false');
    header.addEventListener('click', () => toggleSection(header));
    header.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSection(header); } });
  });
  $$('.tool-header').forEach((header) => {
    $(header.dataset.target.replace(/^cfb-/, '')).classList.add('hidden');
    header.querySelector('.arrow').textContent = '▲';
  });
  const openSection = (id) => { const header = app.querySelector(`.tool-header[data-target="cfb-${id}"]`); if (header && $(id).classList.contains('hidden')) toggleSection(header, true); };

  // ---------------------------------------------------------------- sticky main button (app: refreshStickyAction)
  const stickyRow = $('stickyActionRow');
  const stickyBtn = $('stickyActionBtn');
  const stickyActions = {
    sec_enh: ['btn_enhance_image_apply', 'btn_enhance_apply', 'btn_enhance_combine_apply'], sec_rmbg: ['btn_rmbg'],
    sec_gen: ['btn_gen', 'btn_img2img', 'btn_generate_variations'], sec_expand: ['btn_expand'],
    sec_upscale: ['btn_upscale', 'btn_ai_upscale'], sec_vector: ['btn_vector'], sec_mock: ['btn_gen_mockup'],
  };
  Object.values(stickyActions).flat().forEach((id) => $(id)?.classList.add('sticky-action-source'));
  let stickySource = null;
  const isVisible = (node) => !!node && !node.closest('.hidden');
  function refreshStickyAction() {
    const active = $$('.tool-content').find((content) => !content.classList.contains('hidden'));
    const ids = active ? stickyActions[active.id.replace(/^cfb-/, '')] || [] : [];
    stickySource = ids.map((id) => $(id)).find(isVisible) || null;
    show(stickyRow, !!stickySource);
    if (!stickySource) return;
    stickyBtn.textContent = stickySource.textContent.trim();
    stickyBtn.disabled = stickySource.disabled || stickySource.classList.contains('disabled');
    stickyBtn.className = 'full-btn ' + (stickySource.classList.contains('cta') ? 'cta' : '');
  }
  stickyBtn.addEventListener('click', () => { refreshStickyAction(); if (stickySource && !stickyBtn.disabled) stickySource.click(); });
  app.addEventListener('change', () => queueMicrotask(refreshStickyAction));
  app.addEventListener('click', () => queueMicrotask(refreshStickyAction));

  // ---------------------------------------------------------------- modes (radio groups)
  function setEnhanceMode(mode) {
    show($('enhanceImageUI'), mode === 'image');
    show($('enhanceObjectUI'), mode === 'object');
    show($('enhanceCombineUI'), mode === 'combine');
  }
  function setGenMode(mode) {
    const normal = mode === 'normal'; const img2img = mode === 'img2img'; const variation = mode === 'variations' || mode === 'triptych';
    show($('genNormalPromptGroup'), normal); show($('btn_gen'), normal);
    show($('genImg2ImgUI'), img2img); show($('genVariationsUI'), variation);
    show($('normalGenSettingsBlock'), normal); show($('img2imgGenSettingsBlock'), img2img); show($('variationsGenSettingsBlock'), variation);
    show($('variationSimilarityGroup'), mode !== 'triptych');
    $('variationModeHint').textContent = mode === 'triptych'
      ? 'Загрузите фото или мокап, где видны три картины. Рамки, интерьер, блики и перспектива будут проигнорированы.'
      : 'Загрузите одну отдельную картину. Получите три новых согласованных дизайна для одной серии.';
    $('btn_generate_variations').textContent = mode === 'triptych' ? 'Разобрать триптих на 3 картины' : 'Создать 3 вариации';
    $('hk_gen_variations').dataset.radio = mode === 'triptych' ? 'triptych' : 'variations';
    if (variation && zones.variationDropZone.state && zones.variationDropZone.state.kind !== mode) clearZone('variationDropZone');
    updateModelTitles();
  }
  function setUpscaleMode(mode) { show($('upscaleTaskUI'), mode !== 'ai'); show($('upscaleAIUI'), mode === 'ai'); }
  function setMockupMode(mode) {
    const library = mode !== 'ai';
    show($('mockupLibraryUI'), library); show($('mockupAIPromptUI'), !library); show($('mockupAIUI'), !library);
    if (library) loadLibrary();
  }
  function setMockupKind(kind) {
    const wallpaper = kind !== 'artwork';
    show($('mockupWallpaperOptions'), wallpaper); show($('mockupArtworkOptions'), !wallpaper);
    show($('mockupRemoveWallControl'), wallpaper); show($('mockupRemoveWallHint'), wallpaper);
  }
  function setArtCount(count) {
    show($('mockupArtSinglePlacement'), count !== '3'); show($('mockupArtTriplePlacement'), count === '3');
    $('mockupArtCountHint').textContent = count === '3'
      ? 'Расположите три дизайна в активном документе Photoshop слева направо — этот порядок сохранится в рамах.'
      : 'Активный документ Photoshop считается одной картиной. Макет будет показан в одной раме.';
  }
  const radioHandlers = { enhanceMode: setEnhanceMode, genMode: setGenMode, upscaleMode: setUpscaleMode, mockupMode: setMockupMode, mockupAiKind: setMockupKind, mockupArtCount: setArtCount };
  app.addEventListener('change', (event) => {
    const handler = radioHandlers[event.target.name];
    if (handler && event.target.type === 'radio') handler(event.target.value);
  });

  // ---------------------------------------------------------------- model selects and titles
  const modelNames = { qwen21: 'Qwen', turbo: 'Turbo', krea2: 'Krea 2', flux3: 'FLUX 3', flux: 'FLUX 3', birefnet: 'BiRefNet' };
  function syncQwenSteps() {
    $$('.qwen-steps[data-qwen-model]').forEach((row) => {
      const select = app.querySelector('#' + row.dataset.qwenModel);
      show(row, !!select && select.value === 'qwen21');
    });
  }
  function updateModelTitles() {
    const gen = modelNames[val('genModel')] || 'Turbo';
    $('genModelSettingsTitle').textContent = 'Параметры ' + gen;
    $('img2imgModelSettingsTitle').textContent = 'Параметры ' + (modelNames[val('img2imgModel')] || 'Turbo') + ' img2img';
    $('variationModelSettingsTitle').textContent = 'Параметры ' + (modelNames[val('variationModel')] || 'Turbo') + (radio('genMode') === 'triptych' ? ' · Триптих' : ' · 3 вариации');
  }
  function syncRmbg() { const qwen = val('rmbgModel') === 'qwen21'; show($('rmbgQwenSettings'), qwen); show($('rmbgBiRefSettings'), !qwen); }
  function syncShadowMode() {
    const layer = val('mockupShadowMode') !== 'image';
    show($('mockupShadowStrength')?.closest('.setting-row'), layer);
    $('mockupShadowHint').textContent = layer
      ? 'Слой «Умножение» с одними тенями: детали мокапа остаются в исходном разрешении. Силу можно поменять потом непрозрачностью слоя.'
      : 'FLUX 3 вернёт готовое изображение до 2 Мп; оно ляжет новым слоем поверх мокапа.';
  }
  app.addEventListener('change', (event) => {
    const id = event.target.id.replace(/^cfb-/, '');
    if (['enhanceModel', 'rmbgModel', 'genModel', 'img2imgModel', 'expandModel'].includes(id)) syncQwenSteps();
    if (['genModel', 'img2imgModel', 'variationModel'].includes(id)) updateModelTitles();
    if (id === 'rmbgModel') syncRmbg();
    if (id === 'mockupShadowMode') syncShadowMode();
    if (id === 'serverIP') { setIndicator('checking'); setStatus('Проверка подключения к ' + event.target.value + '…'); setTimeout(() => { setIndicator('connected'); setStatus('Подключено к ComfyUI · ' + event.target.value); }, 900); }
  });

  // ---------------------------------------------------------------- sliders, values and resolution hints
  const aspectLabel = (v) => (D.aspects[Math.round(v)] || D.aspects[6]).label;
  const percent = (v) => v + '%';
  const formats = {
    slider_krea_aspect: aspectLabel, slider_img2img_aspect: aspectLabel, slider_variation_aspect: aspectLabel, slider_mockup_ai_aspect: aspectLabel,
    slider_krea_megapixels: (v) => v + ' MP', slider_img2img_megapixels: (v) => v + ' MP', slider_variation_megapixels: (v) => v + ' MP', slider_mockup_ai_megapixels: (v) => v + ' MP',
    slider_enh_color: percent, slider_rmbg_cleanup: percent, slider_rmbg_detail: percent, slider_variation_similarity: percent, mockupShadowStrength: percent,
    slider_rmbg_edge_shift: (v) => v + ' px', slider_seedvr2_scale: (v) => '×' + v, vectorColors: (v) => v,
    vectorMaxMegapixels: (v) => (Number(v) % 1 ? Number(v).toFixed(1) : Number(v)) + ' MP',
  };
  const valueTargets = { enhanceBrushSize: ['enhanceBrushSizeValue', (v) => v + ' px'], qwenDetailLoraStrength: ['qwenDetailLoraStrengthValue', (v) => Number(v).toFixed(2)], krea2LoraStrength: ['krea2LoraStrengthValue', (v) => Number(v).toFixed(2)] };
  function hint(hintId, aspectId, mpId, suffix = '') {
    const aspect = D.aspects[Math.round(Number(val(aspectId)))] || D.aspects[6];
    const total = (Number(val(mpId)) || 1) * 1e6;
    const w = Math.round(Math.sqrt(total * aspect.ratio) / 8) * 8;
    const h = Math.round(Math.sqrt(total / aspect.ratio) / 8) * 8;
    $(hintId).textContent = `≈ ${w} × ${h} px` + suffix;
  }
  function updateHints() {
    hint('kreaResolutionHint', 'slider_krea_aspect', 'slider_krea_megapixels');
    hint('img2imgResolutionHint', 'slider_img2img_aspect', 'slider_img2img_megapixels');
    hint('variationResolutionHint', 'slider_variation_aspect', 'slider_variation_megapixels', ' на каждую картину');
    hint('mockupAiResolutionHint', 'slider_mockup_ai_aspect', 'slider_mockup_ai_megapixels');
  }
  function syncRange(input) {
    const id = input.id.replace(/^cfb-/, '');
    if (id.startsWith('qwenSteps')) { $('val_' + id).textContent = input.value; return; }
    if (formats[id]) { const out = $('val_' + id.replace(/^slider_/, '')) || $('val_' + id); if (out) out.textContent = formats[id](input.value); }
    if (valueTargets[id]) { const [target, format] = valueTargets[id]; $(target).textContent = format(input.value); }
    if (id === 'slider_enhance_edge_fade') $('input_enhance_edge_fade').value = input.value;
    if (/aspect|megapixels/.test(id)) updateHints();
  }
  $$('input[type="range"]').forEach((input) => { input.addEventListener('input', () => syncRange(input)); syncRange(input); });
  $('input_enhance_edge_fade')?.addEventListener('input', (event) => {
    const value = Math.min(25, Math.max(1, Math.round(Number(event.target.value) || 5)));
    $('slider_enhance_edge_fade').value = value;
  });

  // ---------------------------------------------------------------- checkboxes that open options
  const toggles = { genSeamlessPattern: 'genPatternAssemblyOptions', img2imgSeamlessPattern: 'img2imgPatternAssemblyOptions', krea2LoraEnabled: 'krea2LoraControls', qwenDetailLoraEnabled: 'qwenDetailLoraControls' };
  for (const [box, target] of Object.entries(toggles)) {
    $(box)?.addEventListener('change', (event) => {
      show($(target), event.target.checked);
      // FAQ: a seamless pattern fixes 1:1 and 1 MP.
      if (box === 'genSeamlessPattern') {
        for (const [slider, value] of [['slider_krea_aspect', 0], ['slider_krea_megapixels', 1]]) {
          const input = $(slider);
          if (event.target.checked) { input.dataset.before = input.value; input.value = value; } else if (input.dataset.before) input.value = input.dataset.before;
          input.disabled = event.target.checked;
          syncRange(input);
        }
      }
    });
  }

  // ---------------------------------------------------------------- prompts and presets
  const preset = $('enhanceImagePromptPreset');
  const enhancePrompt = $('enhanceImagePrompt');
  enhancePrompt.value = D.presets.faithful;
  preset.addEventListener('change', () => { if (D.presets[preset.value]) enhancePrompt.value = D.presets[preset.value]; });
  enhancePrompt.addEventListener('input', () => { if (D.presets[preset.value] && enhancePrompt.value.trim() !== D.presets[preset.value].trim()) preset.value = 'custom'; });
  $('rmbgQwenPrompt').value = D.removeBackgroundPrompt;
  $('promptInput').value = '3D wall decal: Spider-Man climbing out of a broken brick wall, Manhattan street and the Empire State Building behind, photorealistic, transparent outside';
  $('img2imgPrompt').value = 'Same breach and city, the hero leans out with one hand over the edge of the bricks';
  $('kreaSeed').value = '104729'; $('img2imgSeed').value = '104729'; $('variationSeed').value = '20261118'; $('mockupAiSeed').value = '512';

  // ---------------------------------------------------------------- Krea 2 LoRA (list from the app)
  const loraSelect = $('krea2Lora');
  loraSelect.replaceChildren(...D.loras.map((lora) => el('option', { value: lora.id, text: lora.label })));
  function syncLora() {
    const lora = D.loras.find((item) => item.id === loraSelect.value) || D.loras[0];
    $('krea2LoraStrength').value = lora.strength;
    syncRange($('krea2LoraStrength'));
    $('krea2LoraTrigger').textContent = lora.trigger ? 'Триггер: ' + lora.trigger : 'Триггер не нужен.';
    $('krea2LoraSource').textContent = lora.strengthNote + (lora.incompatible ? ' Эта LoRA не совместима с Krea 2.' : '');
    $('krea2LoraPreviews').replaceChildren(el('div', { class: 'krea-lora-note', text: 'Примеры стиля хранятся в приложении и в демо не показываются.' }));
  }
  loraSelect.addEventListener('change', syncLora);
  syncLora();

  // ---------------------------------------------------------------- hotkeys (app: capture field)
  const hotkeyInputs = $$('.hotkey-input');
  const keyName = (event) => {
    const code = event.code;
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad\d$/.test(code)) return 'num' + code.slice(6);
    if (/^F\d{1,2}$/.test(code)) return code;
    return { Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
      ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' }[code] || null;
  };
  const combo = (event, key) => [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super', key].filter(Boolean).join('+');
  const bindings = new Map();
  function assign(input, value) {
    for (const other of hotkeyInputs) if (other !== input && bindings.get(other) === value) { bindings.delete(other); other.value = 'Не назначена'; }
    if (value) bindings.set(input, value); else bindings.delete(input);
    input.value = value || 'Не назначена';
    const label = input.closest('.hotkey-row')?.querySelector('.hotkey-label')?.textContent || '';
    setStatus(value ? `Бинд «${value}» назначен: ${label}` : 'Бинд снят: ' + label);
    input.blur();
  }
  for (const input of hotkeyInputs) {
    input.title = 'Нажмите поле, затем клавишу, среднюю кнопку мыши, Mouse4 или Mouse5';
    input.addEventListener('focus', () => { input.value = 'Жмите...'; input.classList.add('listening'); });
    input.addEventListener('blur', () => { input.classList.remove('listening'); input.value = bindings.get(input) || 'Не назначена'; });
    input.addEventListener('keydown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) { assign(input, ''); return; }
      const key = keyName(event);
      if (key) assign(input, combo(event, key));
    });
    input.addEventListener('mousedown', (event) => {
      if (document.activeElement !== input || event.button === 0) return;
      event.preventDefault();
      const name = { 1: 'MouseMiddle', 3: 'Mouse4', 4: 'Mouse5' }[event.button];
      if (name) assign(input, name);
    });
    input.addEventListener('contextmenu', (event) => { if (document.activeElement === input) event.preventDefault(); });
  }
  // Assigned hotkeys work while the page has focus (the app registers them globally).
  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, textarea, select, [contenteditable]')) return;
    const key = keyName(event);
    if (!key) return;
    const pressed = combo(event, key);
    const input = hotkeyInputs.find((item) => bindings.get(item) === pressed);
    if (!input) return;
    event.preventDefault();
    if (input.id === 'cfb-hk_toggle_window') { toggleTray(); return; }
    if (input.dataset.section) openSection(input.dataset.section.replace(/^cfb-/, ''));
    if (input.dataset.radioName) {
      const option = app.querySelector(`input[name="${input.dataset.radioName}"][value="${input.dataset.radio}"]`);
      if (option && !option.checked) { option.checked = true; option.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    $(input.dataset.btn.replace(/^cfb-/, ''))?.click();
  });

  // ---------------------------------------------------------------- image inputs (drop zones)
  const I = D.inputs;
  const zones = {
    enhanceImageDropZone: { input: () => I.enhanceImage, preview: 'enhanceImagePreview', label: 'enhanceImageLabel', info: 'enhanceImageFileInfo', clear: 'btn_enhance_image_clear', pick: ['btn_enhance_image_select'], selection: ['btn_enhance_image_from_selection'] },
    enhanceCombineFirstDropZone: { input: () => I.combineFirst, preview: 'enhanceCombineFirstPreview', label: 'enhanceCombineFirstLabel', info: 'enhanceCombineFirstFileInfo', clear: 'btn_enhance_combine_first_clear', pick: ['btn_enhance_combine_first_select'], selection: ['btn_enhance_combine_first_from_selection'] },
    enhanceCombineSecondDropZone: { input: () => I.combineSecond, preview: 'enhanceCombineSecondPreview', label: 'enhanceCombineSecondLabel', info: 'enhanceCombineSecondFileInfo', clear: 'btn_enhance_combine_second_clear', pick: ['btn_enhance_combine_second_select'], selection: ['btn_enhance_combine_second_from_selection'] },
    img2imgDropZone: { input: () => I.img2img, preview: 'img2imgPreview', label: 'img2imgImageLabel', clear: 'btn_img2img_clear', pick: ['btn_img2img_select'], selection: ['btn_img2img_from_selection'] },
    variationDropZone: { input: () => (radio('genMode') === 'triptych' ? { ...I.triptych, kind: 'triptych' } : { ...I.variation, kind: 'variations' }), preview: 'variationPreview', label: 'variationImageLabel', clear: 'btn_variation_clear', pick: ['btn_variation_select'], selection: ['btn_variation_from_selection'] },
    upscaleDropZone: { input: () => I.upscale, preview: 'upscalePreview', label: 'upscaleImageLabel', info: 'upscaleFileInfo', clear: 'btn_upscale_clear', pick: ['btn_upscale_select'], selection: ['btn_upscale_from_selection', 'btn_topaz_from_layer'] },
    aiUpscaleDropZone: { input: () => I.upscale, preview: 'aiUpscalePreview', label: 'aiUpscaleImageLabel', info: 'aiUpscaleFileInfo', clear: 'btn_ai_upscale_clear', pick: ['btn_ai_upscale_select'], selection: ['btn_ai_upscale_from_selection'] },
    vectorDropZone: { input: () => I.vector, preview: 'vectorPreview', label: 'vectorImageLabel', info: 'vectorFileInfo', clear: 'btn_vector_clear', pick: ['btn_vector_select'], selection: ['btn_vector_from_selection'] },
  };
  function setClearButton(id, active) {
    const button = $(id);
    if (!button) return;
    if (button.classList.contains('enhance-image-clear')) button.classList.toggle('is-inactive', !active);
    else if (id === 'btn_variation_clear') { button.disabled = !active; button.classList.toggle('disabled', !active); }
    else show(button, active);
  }
  function fillZone(zoneId, fromSelection) {
    const zone = zones[zoneId];
    const input = zone.input();
    if (fromSelection) { ensureDoc(input); marchingAnts(); }
    const preview = $(zone.preview);
    preview.src = input.src;
    show(preview, true);
    show($(zone.label), false);
    if (zone.info) {
      const [w, h] = input.size || ['', ''];
      $(zone.info).textContent = `${fromSelection ? 'Выделение Photoshop' : input.name} · ${w} × ${h} px`;
    }
    setClearButton(zone.clear, true);
    zone.state = input;
    if (zoneId === 'upscaleDropZone') topaz.refresh();
    setStatus(fromSelection ? 'Выделение из Photoshop вставлено' : 'Картинка добавлена: ' + input.name);
  }
  function clearZone(zoneId) {
    const zone = zones[zoneId];
    const preview = $(zone.preview);
    preview.removeAttribute('src');
    show(preview, false);
    show($(zone.label), true);
    if (zone.info) $(zone.info).textContent = '';
    setClearButton(zone.clear, false);
    zone.state = null;
    if (zoneId === 'upscaleDropZone') topaz.refresh();
  }
  for (const [zoneId, zone] of Object.entries(zones)) {
    const node = $(zoneId);
    node.setAttribute('role', 'button');
    node.addEventListener('click', () => fillZone(zoneId, false));
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fillZone(zoneId, false); }
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyV') { event.preventDefault(); fillZone(zoneId, false); }
    });
    node.addEventListener('dragover', (event) => { event.preventDefault(); node.classList.add('drag-over'); });
    node.addEventListener('dragleave', () => node.classList.remove('drag-over'));
    node.addEventListener('drop', (event) => { event.preventDefault(); node.classList.remove('drag-over'); fillZone(zoneId, false); setStatus('Демо: вместо вашего файла вставлена подготовленная картинка'); });
    for (const id of zone.pick) $(id)?.addEventListener('click', () => fillZone(zoneId, false));
    for (const id of zone.selection) $(id)?.addEventListener('click', () => fillZone(zoneId, true));
    $(zone.clear)?.addEventListener('click', () => { clearZone(zoneId); setStatus('Картинка удалена'); });
  }
  // A missing input is taken from the active Photoshop document, as the app does for selections.
  const need = (zoneId) => zones[zoneId].state || (fillZone(zoneId, true), zones[zoneId].state);

  // ---------------------------------------------------------------- mask editor («Изменить объект»)
  const maskEditor = $('enhanceMaskEditor');
  const maskCanvas = $('enhanceMaskCanvas');
  const ctx = maskCanvas.getContext('2d');
  const maskImage = new Image();
  let painted = false; let painting = false; let last = null;
  function setObjectButtons(ready) {
    $('btn_enhance_clear_mask').classList.toggle('disabled', !ready);
    $('btn_enhance_apply').classList.toggle('disabled', !painted);
  }
  function drawMaskBase() {
    maskCanvas.width = maskImage.naturalWidth;
    maskCanvas.height = maskImage.naturalHeight;
    ctx.drawImage(maskImage, 0, 0);
    painted = false;
    setObjectButtons(true);
  }
  $('btn_enhance_load').addEventListener('click', () => {
    const input = I.enhanceObject;
    ensureDoc(input);
    marchingAnts();
    show(maskEditor, true);
    if (!$('enhancePrompt').value.trim() || $('enhancePrompt').value === 'Fix details') $('enhancePrompt').value = input.prompt;
    maskImage.onload = drawMaskBase;
    maskImage.src = input.src;
    setStatus('Выделение вставлено: закрасьте область, которую нужно изменить');
  });
  $('btn_enhance_clear_mask').addEventListener('click', () => { if (maskImage.complete && maskImage.naturalWidth) { drawMaskBase(); setStatus('Маска очищена'); } });
  const point = (event) => {
    const rect = maskCanvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * maskCanvas.width / rect.width, y: (event.clientY - rect.top) * maskCanvas.height / rect.height };
  };
  function stroke(from, to) {
    const size = Number(val('enhanceBrushSize')) * maskCanvas.width / 1000;
    ctx.strokeStyle = 'rgba(255,255,255,.78)';
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    if (!painted) { painted = true; setObjectButtons(true); queueMicrotask(refreshStickyAction); }
  }
  maskCanvas.addEventListener('pointerdown', (event) => { if (!maskImage.naturalWidth) return; painting = true; last = point(event); maskCanvas.setPointerCapture(event.pointerId); stroke(last, last); });
  maskCanvas.addEventListener('pointermove', (event) => { if (!painting) return; const next = point(event); stroke(last, next); last = next; });
  const stop = () => { painting = false; last = null; };
  maskCanvas.addEventListener('pointerup', stop);
  maskCanvas.addEventListener('pointercancel', stop);

  // ---------------------------------------------------------------- Topaz (port of topaz-ui.js)
  const topaz = (() => {
    const host = $('set_upscale');
    const fieldset = el('fieldset', { id: 'cfb-topazSettings', style: 'border:0;padding:0;margin:0 0 12px' });
    fieldset.innerHTML = `<div style="font-size:11px;color:#aaa;margin-bottom:8px">Настройки применятся после нажатия «Загрузить в Topaz».</div>
      <label>Модель<select name="model"></select></label>
      <label>Размер<select name="resizeMode"><option value="scale">Масштаб</option><option value="width">Ширина</option><option value="height">Высота</option></select></label>
      <div data-size="scale"><label>Увеличение <output></output><input name="scale" type="range" min="1" max="6" step="0.01" value="4"></label></div>
      <div data-size="dimension" class="hidden" style="display:grid;grid-template-columns:minmax(0,1fr) 72px;gap:6px">
        <label style="margin:0">Значение<input name="dimension" type="number" min="1" max="32000" step="0.01" value="213" inputmode="decimal"></label>
        <label style="margin:0">Единица<select name="unit"><option value="px">px</option><option value="in">дюймы</option><option value="cm">см</option></select></label>
      </div>
      <label>Плотность, PPI<input name="ppi" type="number" min="1" max="1200" step="1" value="100"></label>
      <div data-dimensions style="font-size:11px;margin:6px 0;color:#8abf92"></div>
      <div data-model="core"></div><div data-model="recover"></div><div data-model="redefine"></div>
      <div data-model="strength"><label>Сила восстановления<select name="strength"><option value="Low">Низкая</option><option value="Medium" selected>Средняя</option><option value="High">Высокая</option></select></label></div>
      <div data-model="realistic"><label>Изменение деталей<select name="realisticAdjustment"><option value="None">Без изменения</option><option value="Subtle" selected>Небольшое</option></select></label></div>
      <div data-model="creative"><label>Креативность<select name="creativeAdjustment"><option value="Low">Низкая</option><option value="Medium">Средняя</option><option value="High">Высокая</option><option value="Max">Максимальная</option></select></label></div>
      <div data-feature="texture"><label>Текстура <output></output><input name="texture" type="range" min="1" max="6" value="3"></label></div>
      <div data-feature="description"><textarea name="description" maxlength="2000" placeholder="Описание изображения для Redefine"></textarea></div>
      <label data-feature="face"><input type="checkbox" name="face"> Восстановление лиц</label>
      <label data-feature="gamma"><input type="checkbox" name="gamma"> Коррекция гаммы</label>
      <label>Формат<select name="format"><option>JPEG</option><option>PNG</option><option>TIFF</option></select></label>
      <label data-feature="quality">Качество JPEG <output></output><input name="quality" type="range" min="1" max="100" value="100"></label>
      <label>Цветовой профиль<select name="colorSpace"><option>Adobe RGB (1998)</option><option>sRGB IEC61966-2.1</option><option>ProPhoto RGB</option></select></label>`;
    host.insertBefore(fieldset, host.firstChild);
    fieldset.querySelectorAll('label').forEach((label) => { label.style.display = 'block'; label.style.marginTop = '8px'; label.style.marginBottom = '8px'; });
    const modelSelect = fieldset.querySelector('[name=model]');
    D.topaz.forEach((model) => modelSelect.append(el('option', { value: model.name, text: model.name })));
    const sliders = {
      core: [['sharpen', 'Резкость', 0, 100, 33], ['denoise', 'Удаление шума', 0, 100, 50], ['compression', 'Артефакты сжатия', 0, 100, 1]],
      recover: [['detail', 'Детализация', 0, 100, 50]],
      redefine: [['creativity', 'Креативность', 1, 6, 2], ['extraSharpen', 'Дополнительная резкость', 0, 6, 0], ['extraDenoise', 'Дополнительное шумоподавление', 0, 6, 2]],
    };
    for (const [group, fields] of Object.entries(sliders)) for (const [name, label, min, max, value] of fields) {
      const item = el('label', { style: 'display:block;margin:8px 0' }, label + ' ', el('output', { text: String(value) }), el('input', { type: 'range', name, min, max, value }));
      fieldset.querySelector(`[data-model=${group}]`).append(item);
    }
    const values = () => Object.fromEntries(Array.from(fieldset.querySelectorAll('[name]'), (node) => [node.name, node.type === 'checkbox' ? node.checked : ['range', 'number'].includes(node.type) ? Number(node.value) : node.value]));
    function refresh() {
      const v = values(); const model = D.topaz.find((item) => item.name === v.model); const group = model?.kind;
      fieldset.querySelectorAll('[data-model]').forEach((node) => node.classList.toggle('hidden', node.dataset.model !== group));
      fieldset.querySelector('[data-feature=face]').classList.toggle('hidden', group !== 'core' && !v.model.startsWith('Recover'));
      fieldset.querySelector('[data-feature=gamma]').classList.toggle('hidden', group !== 'core');
      fieldset.querySelector('[name=compression]').parentElement.classList.toggle('hidden', model?.compression === false);
      fieldset.querySelector('[data-feature=texture]').classList.toggle('hidden', !['creative', 'redefine'].includes(group));
      fieldset.querySelector('[data-feature=description]').classList.toggle('hidden', !['creative', 'redefine'].includes(group) && !(group === 'realistic' && v.realisticAdjustment === 'Subtle'));
      fieldset.querySelector('[data-feature=quality]').classList.toggle('hidden', v.format !== 'JPEG');
      fieldset.querySelector('[data-size=scale]').classList.toggle('hidden', v.resizeMode !== 'scale');
      fieldset.querySelector('[data-size=dimension]').classList.toggle('hidden', v.resizeMode === 'scale');
      fieldset.querySelectorAll('input[type=range]').forEach((node) => { node.parentElement.querySelector('output').value = node.value; });
      const input = zones.upscaleDropZone.state;
      const out = fieldset.querySelector('[data-dimensions]');
      if (input?.size) {
        const [w, h] = input.size;
        const px = v.dimension * (v.unit === 'cm' ? v.ppi / 2.54 : v.unit === 'in' ? v.ppi : 1);
        const scale = v.resizeMode === 'scale' ? v.scale : px / (v.resizeMode === 'width' ? w : h);
        out.textContent = `${w} × ${h} → ${Math.round(w * scale)} × ${Math.round(h * scale)} px`;
      } else out.textContent = 'Добавьте изображение, чтобы увидеть итоговый размер.';
    }
    fieldset.addEventListener('input', refresh);
    fieldset.addEventListener('change', refresh);
    const panel = el('div');
    panel.innerHTML = `<div data-connection style="font-size:11px;color:#aaa;margin:8px 0">Подключение к обработчику…</div>
      <div data-current style="font-size:11px;color:#e3b758;margin:6px 0"></div>
      <div class="sub-tool-section"><div class="sub-tool-header" data-history-toggle><span>🕘 История Topaz</span><span class="arrow">▼</span></div>
        <div class="sub-tool-content hidden" data-history><div data-jobs style="font-size:12px;overflow-wrap:anywhere">Пока пусто.</div></div></div>
      <div style="font-size:10px;color:#999;margin-top:8px">Обработка может занимать 30 минут и дольше. Окно можно свернуть: очередь продолжит работу, а результат придёт файлом в Избранное Telegram.</div>`;
    $('topazPanel').append(panel);
    setTimeout(() => { panel.querySelector('[data-connection]').textContent = 'Обработчик Topaz подключён'; }, reduced.matches ? 0 : 1200);
    const historyToggle = panel.querySelector('[data-history-toggle]');
    historyToggle.setAttribute('role', 'button'); historyToggle.tabIndex = 0;
    const flip = () => { const content = panel.querySelector('[data-history]'); content.classList.toggle('hidden'); historyToggle.querySelector('.arrow').textContent = content.classList.contains('hidden') ? '▼' : '▲'; };
    historyToggle.addEventListener('click', flip);
    historyToggle.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flip(); } });
    const jobs = [];
    function addJob(job) {
      jobs.unshift(job);
      const box = panel.querySelector('[data-jobs]');
      box.replaceChildren(...jobs.slice(0, 10).map((item) => el('div', { style: 'padding:8px 0;border-bottom:1px solid #444' }, el('b', { text: item.sourceName }), el('div', { text: item.message }))));
    }
    refresh();
    return { refresh, values, addJob, current: (text) => { panel.querySelector('[data-current]').textContent = text; } };
  })();

  // ---------------------------------------------------------------- mockup library (Library PSD)
  let libraryFolder = null;
  function loadLibrary() {
    const grid = $('mockupGrid');
    const back = $('btn_mockup_back');
    const label = $('mockup_path_label');
    grid.replaceChildren();
    if (!libraryFolder) {
      back.style.display = 'none';
      label.textContent = '';
      for (const folder of D.library) {
        const card = el('div', { class: 'folder-card', role: 'button', tabindex: '0' }, el('div', { class: 'folder-icon', text: '📁' }), folder.folder);
        const open = () => { libraryFolder = folder; loadLibrary(); };
        card.addEventListener('click', open);
        card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
        grid.append(card);
      }
      return;
    }
    back.style.display = 'block';
    label.textContent = '📁 ' + libraryFolder.folder;
    for (const file of libraryFolder.files) {
      const card = el('div', { class: 'mockup-item-card', role: 'button', tabindex: '0', title: file.name }, el('img', { src: file.thumb, alt: '', loading: 'lazy' }), el('span', { text: file.name }));
      const use = () => run(libraryTask(file));
      card.addEventListener('click', use);
      card.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); use(); } });
      grid.append(card);
    }
  }
  $('btn_mockup_back').addEventListener('click', () => { libraryFolder = null; loadLibrary(); });
  $('btn_refresh_mockups').addEventListener('click', () => { loadLibrary(); setStatus('Список шаблонов обновлён'); });

  // ---------------------------------------------------------------- tasks behind every button
  const R = D.results;
  const qwenSteps = (id) => Number(val(id)) || 25;
  const enhanceModel = () => modelNames[val('enhanceModel')] || 'Qwen';
  const colorStep = () => $('enhanceColorEnabled').checked ? `Перенос цвета · ${optionText($('enhanceColorMethod'))} · ${val('slider_enh_color')}%` : 'Без переноса цвета';
  const modelStep = (model, steps) => (model === 'Qwen' ? `Qwen Image 2.1 · шаг ${steps}/${steps}` : 'FLUX 3 Klein · шаг 4/4');
  const place = (name, src, extra = {}) => () => addLayer({ name, src, ...extra });
  let mockupCounter = 1;
  const mockupName = (kind) => `Дизайн__Mockup_${String(mockupCounter++).padStart(3, '0')}__${kind}.png`;

  const tasks = {
    btn_enhance_image_apply: () => {
      const input = need('enhanceImageDropZone'); const model = enhanceModel();
      return { name: 'Enhance', model, steps: ['Экспорт картинки · 1 MP', modelStep(model, qwenSteps('qwenStepsEnhance')) + ' · Detail Enhancer', colorStep(), 'Вставка слоя в Photoshop'],
        prepare: () => ensureDoc(input), finish: place('Enhance · ' + model, R.enhanceImage) };
    },
    btn_enhance_image_auto: () => {
      const input = I.enhanceAuto; const model = enhanceModel();
      const tiles = 6;
      return { name: 'Enhance · авто', model, steps: [`Документ разбит на ${tiles} тайлов · ${val('enhanceAutoTileSize')} px, нахлёст ${val('enhanceAutoOverlap')} px`, ...Array.from({ length: tiles }, (_, i) => `Тайл ${i + 1}/${tiles} · 1 MP → ${model}`), 'Сборка группы слоёв с масками'],
        prepare: () => { openDoc(input.doc, 'auto'); doc.input = input.name; addLayer({ name: 'Слой 0', src: input.src, reveal: false }); showTiles(3, 2); },
        onStep: (index) => markTile(index - 1),
        finish: () => { tilesBox.hidden = true; addLayer({ name: 'Enhance · авто (6 тайлов)', src: R.enhanceAuto }); } };
    },
    btn_enhance_apply: () => {
      const model = enhanceModel();
      return { name: 'Изменить объект', model, steps: ['Выделение и маска → 1 MP', `${modelStep(model, qwenSteps('qwenStepsEnhance'))} · Fun ControlNet`, 'Слой-маска по закрашенной области', 'Вставка на место выделения'],
        prepare: () => ensureDoc(I.enhanceObject), finish: place('Изменить объект · ' + model, R.enhanceObject), done: 'Готово: объект перерисован, маска слоя редактируемая' };
    },
    btn_enhance_combine_apply: () => {
      const first = need('enhanceCombineFirstDropZone'); const second = need('enhanceCombineSecondDropZone'); const model = enhanceModel();
      return { name: 'Совместить', model, steps: ['Первая и вторая картинки → 1 MP', `${modelStep(model, qwenSteps('qwenStepsEnhance'))} · два референса img2img`, 'Вставка слоя в Photoshop'],
        prepare: () => { openDoc('Совмещение.psd', 'combine'); addLayer({ name: 'Первая · ' + first.name, src: first.src, reveal: false, hidden: true }); addLayer({ name: 'Вторая · ' + second.name, src: second.src, reveal: false, hidden: true }); },
        finish: place('Совмещение · ' + model, R.combine) };
    },
    btn_rmbg: () => {
      const input = I.rmbg; const qwen = val('rmbgModel') === 'qwen21';
      const steps = qwen
        ? ['Экспорт выделения из Photoshop', `Qwen Image 2.1 · шаг ${qwenSteps('qwenStepsRemoveBg')}/${qwenSteps('qwenStepsRemoveBg')} · PNG с прозрачностью`, 'Вставка слоя с маской']
        : ['Экспорт выделения из Photoshop', 'BiRefNet · ' + optionText($('rmbgEdgePreset')), `Очистка ${val('slider_rmbg_cleanup')}% · детали ${val('slider_rmbg_detail')}% · край +${val('slider_rmbg_edge_shift')} px`, $('rmbgDecontaminate').checked ? 'Цветной ореол убран' : 'Без очистки ореола', 'Вставка слоя с маской'];
      return { name: 'Remove Background', model: qwen ? 'Qwen' : 'BiRefNet', steps, prepare: () => { ensureDoc(input); marchingAnts(); }, finish: place('Без фона · ' + (qwen ? 'Qwen' : 'BiRefNet'), R.rmbg, { hideBelow: true }) };
    },
    btn_gen: () => {
      const model = modelNames[val('genModel')] || 'Qwen';
      const pattern = $('genSeamlessPattern').checked; const assembly = pattern && $('genPatternAssembly').checked;
      const size = $('kreaResolutionHint').textContent.replace('≈ ', '');
      const steps = [$('kreaPromptEnhance').checked && 'Prompt Enhance · Gemini', `${model} · ${aspectLabel(val('slider_krea_aspect'))} · ${size} · seed ${val('kreaSeed') || 'случайный'}`,
        assembly && 'Gemini: элементы, позы и цвета', assembly && 'Krea 2: элементы по отдельности, проверка стиля', assembly && 'SeedVR2 ×4: элементы и фон', 'Вставка в Photoshop'];
      return { name: 'Генерация', model, steps, prepare: () => openDoc(pattern ? 'Паттерн 40 × 40 in.psd' : 'Без имени-1', 'gen'),
        finish: place(pattern ? (assembly ? 'Паттерн · элементы ×4' : 'Бесшовный паттерн') : model + ' · генерация', pattern ? R.genPattern : R.gen) };
    },
    btn_img2img: () => {
      const input = need('img2imgDropZone'); const model = modelNames[val('img2imgModel')] || 'Qwen';
      return { name: 'img2img', model, steps: ['Временная копия ≤ 1 MP', $('img2imgPromptEnhance').checked && 'Prompt Enhance · Gemini', `${model} · img2img · ${aspectLabel(val('slider_img2img_aspect'))}`, 'Вставка слоя в Photoshop'],
        prepare: () => ensureDoc(input), finish: place(model + ' · img2img', R.img2img) };
    },
    btn_generate_variations: () => {
      const triptych = radio('genMode') === 'triptych';
      const input = need('variationDropZone'); const model = modelNames[val('variationModel')] || 'Turbo';
      const raw = (val('variationSeriesNumber') || '').trim().replace(/^p/i, '');
      const series = 'p' + (raw || '129');
      const steps = triptych
        ? ['Gemini: левая, центральная и правая работы', `${model} · картина 1/3`, `${model} · картина 2/3`, `${model} · картина 3/3`, `Сохранено: ${series}_l · ${series}_c · ${series}_r`]
        : ['Gemini: анализ картины', `${model} · близкий вариант · сходство ${val('slider_variation_similarity')}%`, `${model} · новая композиция`, `${model} · свободная часть серии`, `Сохранено: ${series}_l · ${series}_c · ${series}_r`];
      return { name: triptych ? 'Триптих → 3' : '1 → 3 вариации', model, steps, prepare: () => ensureDoc(input),
        finish: place(`${series}_l · ${series}_c · ${series}_r`, null, { row: triptych ? R.triptych : R.variations, hideBelow: true }) };
    },
    btn_expand: () => {
      const input = I.expand; const model = modelNames[val('expandModel')] || 'Qwen';
      return { name: 'Expand', model, steps: [`Расширение холста · ↑ ${val('expandTop')} · ← ${val('expandLeft')} · → ${val('expandRight')} · ↓ ${val('expandBottom')} px`, `${modelStep(model, qwenSteps('qwenStepsExpand'))} · outpainting`, 'Вставка слоя в Photoshop'],
        prepare: () => ensureDoc(input), finish: place('Расширение фона · ' + model, R.expand) };
    },
    btn_upscale: () => {
      const input = zones.upscaleDropZone.state;
      if (!input) { setStatus('Сначала добавьте изображение'); return null; }
      const v = topaz.values();
      const scale = v.resizeMode === 'scale' ? '×' + Number(v.scale).toFixed(2).replace(/\.?0+$/, '') : `${v.dimension} ${v.unit}`;
      return { name: 'Topaz', model: 'Topaz · ' + v.model, steps: ['Передача оригинала и запуск Topaz…', `Topaz Gigapixel · ${v.model} · ${scale}`, 'Обработка на ПК-обработчике', `Сохранение · ${v.format} · ${v.colorSpace}`, 'Результат отправлен в Избранное Telegram'],
        prepare: () => { ensureDoc(input); topaz.current(input.name + ': обработка…'); },
        finish: () => { topaz.current(''); topaz.addJob({ sourceName: input.name, message: 'Готово: ' + input.name.replace(/\.\w+$/, '') + '_topaz.' + v.format.toLowerCase().replace('jpeg', 'jpg') + ' · ' + $('topazSettings').querySelector('[data-dimensions]').textContent }); addLayer({ name: 'Topaz · ' + v.model, src: R.upscale, hideBelow: true }); },
        done: 'Задача Topaz завершена: файл в Избранном Telegram' };
    },
    btn_ai_upscale: () => {
      const input = need('aiUpscaleDropZone'); const scale = val('slider_seedvr2_scale');
      return { name: 'Upscale ×' + scale, model: 'SeedVR2', steps: ['Подгонка ровно до 1 MP', `SeedVR2 · ×${scale}`, 'Сохранено в Upscales', 'Вставка слоя на место исходника'],
        prepare: () => ensureDoc(input), finish: place('Upscale ×' + scale + ' · SeedVR2', R.upscale, { hideBelow: true }) };
    },
    btn_ai_upscale_from_layer: () => {
      const scale = val('slider_seedvr2_scale');
      return { name: 'Upscale слоя', model: 'SeedVR2', steps: ['Активный слой → 1 MP', `SeedVR2 · ×${scale}`, 'Результат точно на место, маска перенесена', 'Папка Upscale внизу документа'],
        prepare: () => ensureDoc(I.upscale), finish: place('Upscale ×' + scale + ' · активный слой', R.upscale, { hideBelow: true }) };
    },
    btn_ai_upscale_all_visible: () => {
      const scale = val('slider_seedvr2_scale');
      return { name: 'Upscale · все слои', model: 'SeedVR2', steps: ['Видимые слои зафиксированы: 1', `Слой 1/1 · SeedVR2 · ×${scale}`, 'Папка Upscale внизу документа'],
        prepare: () => ensureDoc(I.upscale), finish: place('Upscale · все видимые слои', R.upscale, { hideBelow: true }) };
    },
    btn_vector: () => {
      const input = zones.vectorDropZone.state || I.vector;
      const prefix = (val('vectorFilePrefix') || 'vector_quantized').trim();
      return { name: 'Vectorize', model: 'My Vectorizer', steps: [zones.vectorDropZone.state ? 'Изображение → до ' + formats.vectorMaxMegapixels(val('vectorMaxMegapixels')) : 'Активный слой Photoshop → до ' + formats.vectorMaxMegapixels(val('vectorMaxMegapixels')), `My Vectorizer · ${optionText($('vectorMode')).split(' — ')[0]} · палитра ${val('vectorColors')}`, 'potrace ×2 · фигуры', `SVG сохранён: ${prefix}_00001_.svg`, 'Вставка SVG смарт-объектом'],
        prepare: () => ensureDoc(input), finish: place('Вектор · SVG', R.vector), done: 'Готово: SVG вставлен смарт-объектом' };
    },
    btn_gen_mockup: () => {
      const artwork = radio('mockupAiKind') === 'artwork';
      if (artwork) {
        const three = radio('mockupArtCount') === '3';
        return { name: 'AI мокап · картины', model: 'Krea 2', steps: ['Prompt Enhance · палитра дизайна', `Krea 2 · ${optionText($('mockupArtRoom'))} · ${optionText($('mockupArtFrame'))}`, three ? 'Три картины слева направо' : 'Одна картина в раме', 'Новый документ мокапа'],
          prepare: () => { if (three) ensureDoc(I.artTriple); }, finish: () => { openDoc(three ? 'Мокап · 3 картины.psd' : 'Мокап · 1 картина.psd', three ? 'mockupArt3' : 'mockupArt1'); addLayer({ name: 'Krea 2 · ' + (three ? '3 картины' : '1 картина'), src: three ? R.artTriple : R.artSingle }); } };
      }
      const removeWall = $('mockupRemoveWall').checked;
      return { name: 'AI мокап · обои', model: removeWall ? 'Krea 2 + Qwen' : 'Krea 2',
        steps: ['Prompt Enhance · палитра дизайна', `Krea 2 · ${optionText($('mockupRoom'))} · ${optionText($('mockupInteriorStyle'))}`, removeWall && `Qwen · стена → прозрачность · шаг ${qwenSteps('qwenStepsMockup')}/${qwenSteps('qwenStepsMockup')}`, removeWall ? 'Дизайн под интерьером' : 'Дизайн отдельным слоем', 'Вставка слоёв в Photoshop'],
        prepare: () => { openDoc('Мокап обоев.psd', 'mockupRoom'); addLayer({ name: 'Дизайн · ' + I.mockupDesign.name, src: I.mockupDesign.src, reveal: false, hidden: !removeWall }); },
        onStep: (index) => { if (index === 1) addLayer({ name: 'Интерьер · Krea 2', src: R.mockupRoom }); },
        finish: () => {
          if (removeWall) { layers.forEach((layer) => { if (layer.name === 'Интерьер · Krea 2') layer.visible = false; }); addLayer({ name: 'Стена удалена · Qwen', src: R.mockupWall }); doc.key = 'mockupWall'; }
          else { addLayer({ name: 'Дизайн — разместите вручную', src: I.mockupDesign.src, hidden: true }); doc.key = 'mockupRoom'; }
        },
        done: removeWall ? 'Готово: стена прозрачная, дизайн под интерьером' : 'Готово: интерьер и дизайн добавлены отдельными слоями' };
    },
    btn_mockup_shadows: () => {
      const layerMode = val('mockupShadowMode') !== 'image';
      return { name: 'Естественные тени', model: 'FLUX 3', steps: [doc.key === 'mockupWall' ? 'Склейка видимых слоёв' : 'Нет мокапа: создаю интерьер и убираю стену', 'FLUX 3 · встроенный промт для фотообоев', layerMode ? `Слой «Умножение» · ${val('mockupShadowStrength')}%` : 'Готовое изображение до 2 Мп', 'Вставка слоя поверх'],
        prepare: () => { if (doc.key !== 'mockupWall') { openDoc('Мокап обоев.psd', 'mockupWall'); addLayer({ name: 'Дизайн · ' + I.mockupDesign.name, src: I.mockupDesign.src, reveal: false }); addLayer({ name: 'Стена удалена · Qwen', src: R.mockupWall, reveal: false }); } },
        finish: () => { addLayer({ name: layerMode ? 'Тени (Умножение) · FLUX 3' : 'FLUX 3 · готовое изображение', src: R.mockupFinal }); doc.key = 'mockupFinal'; } };
    },
    btn_save_mockup_png: () => {
      if (!/^mockup|^library/.test(doc.key)) { setStatus('Активный документ — не мокап: нечего сохранять'); return null; }
      const kind = doc.key.startsWith('library') ? 'LIB_' + doc.template : doc.key === 'mockupArt1' ? 'AI_ART_1' : doc.key === 'mockupArt3' ? 'AI_ART_3' : 'AI_WALL';
      const file = mockupName(kind);
      return { name: 'Save PNG', model: 'Photoshop', steps: ['Экспорт PNG', 'Сохранено в Mockups: ' + file, 'Документ закрыт'], finish: () => openDoc('portfolio-demo.psd'), done: 'Сохранено в Mockups: ' + file };
    },
  };
  function libraryTask(file) {
    return { name: 'Library PSD', model: 'Photoshop', steps: [`Скачивание шаблона ${file.name}.psd`, 'Открытие шаблона в Photoshop', 'Дизайн вставлен в смарт-объект', 'Готово'],
      finish: () => { openDoc(file.name + '.psd', 'library'); doc.template = file.name; addLayer({ name: 'Мокап · ' + file.name, src: file.result }); } };
  }
  for (const [id, make] of Object.entries(tasks)) {
    const button = $(id);
    if (!button) continue;
    button.addEventListener('click', () => {
      if (button.disabled || button.classList.contains('disabled')) return;
      const task = make();
      if (task) run(task);
    });
  }

  // Tiles overlay for «Авто: весь документ».
  function showTiles(cols, rows) {
    tilesBox.style.setProperty('--cols', cols);
    tilesBox.style.setProperty('--rows', rows);
    tilesBox.replaceChildren(...Array.from({ length: cols * rows }, () => el('i')));
    tilesBox.hidden = false;
  }
  function markTile(index) {
    const tiles = Array.from(tilesBox.children);
    tiles.forEach((tile, i) => { tile.classList.toggle('is-active', i === index); tile.classList.toggle('is-done', i < index); });
  }

  // ---------------------------------------------------------------- title bar, window buttons, settings
  $('btn_free_models').addEventListener('click', () => { modelText.textContent = 'Модель: —'; setStatus('Модели выгружены, кэш ComfyUI очищен'); });
  const pin = $('btnPhotoshopPin');
  pin.disabled = false;
  pin.addEventListener('click', () => { const on = !pin.classList.contains('active'); pin.classList.toggle('active', on); app.classList.toggle('photoshop-pinned', on); setStatus(on ? 'Окно закреплено за Photoshop' : 'Окно откреплено'); });
  $('btnMinimize').addEventListener('click', () => { app.classList.toggle('is-minimized'); });
  $('btnMaximize').addEventListener('click', () => { app.classList.toggle('is-wide'); });
  const tray = root.querySelector('[data-cfba-tray]');
  function toggleTray(force) {
    const hide = force ?? !app.classList.contains('is-tray');
    app.classList.toggle('is-tray', hide);
    tray.hidden = !hide;
    if (hide) tray.focus(); else $('btnClose').focus();
  }
  $('btnClose').addEventListener('click', () => toggleTray(true));
  tray.addEventListener('click', () => toggleTray(false));
  $('chatIconBtn').addEventListener('click', () => { $('notifDot').classList.remove('visible'); setStatus('Чат открывается отдельным окном приложения · Hub ' + (val('hubIP') || '127.0.0.1:3003')); });
  $('btn_reset_window_position').addEventListener('click', () => { app.classList.remove('is-minimized', 'is-wide'); root.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' }); setStatus('Окно возвращено на место'); });
  $('autoLaunchEnabled').addEventListener('change', (event) => setStatus(event.target.checked ? 'Автозапуск с Windows включён' : 'Автозапуск выключен'));

  // ---------------------------------------------------------------- initial state, as the app starts
  setEnhanceMode(radio('enhanceMode'));
  setGenMode(radio('genMode'));
  setUpscaleMode(radio('upscaleMode'));
  setMockupMode(radio('mockupMode'));
  setMockupKind(radio('mockupAiKind'));
  setArtCount(radio('mockupArtCount'));
  syncQwenSteps(); syncRmbg(); syncShadowMode(); updateModelTitles(); updateHints();
  openDoc('portfolio-demo.psd');
  openSection('sec_enh');
  refreshStickyAction();
})();
