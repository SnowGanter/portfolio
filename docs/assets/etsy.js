import {normalizeEtsyState,selectEtsyDesigns,etsyStateQuery} from './etsy-state.js?v=fc1c85679c80';

const root = document.querySelector('[data-etsy-page]');
if (root) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'portfolio-etsy-saved-v1';
  let storageAvailable = true;
  let saved = new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) saved = new Set(stored.filter(id => typeof id === 'string' && /^[a-z0-9-]+$/.test(id)));
  } catch { storageAvailable = false; }

  function syncLanguages() {
    for (const link of document.querySelectorAll('[data-language]')) {
      const target = new URL(link.href,location.href);
      target.search = location.search;
      target.hash = location.hash;
      link.href = target.pathname + target.search + target.hash;
    }
  }

  function syncSaved() {
    for (const button of root.querySelectorAll('[data-etsy-save]')) {
      const active = saved.has(button.dataset.etsySave);
      button.setAttribute('aria-pressed',String(active));
      button.setAttribute('aria-label',active ? button.dataset.removeLabel : button.dataset.saveLabel);
    }
    for (const count of root.querySelectorAll('[data-etsy-saved-count]')) count.textContent = saved.size;
  }

  const catalogue = root.hasAttribute('data-etsy-catalog');
  let renderCatalogue = null;
  for (const button of root.querySelectorAll('[data-etsy-save]')) button.addEventListener('click',() => {
    const id = button.dataset.etsySave;
    if (saved.has(id)) saved.delete(id); else saved.add(id);
    try { localStorage.setItem(storageKey,JSON.stringify([...saved]));storageAvailable=true; }
    catch { storageAvailable = false; }
    syncSaved();
    root.querySelector('[data-etsy-save-status]').textContent = storageAvailable ? root.dataset.savedNote : root.dataset.saveFailed;
    renderCatalogue?.(false);
    if (button.closest('[data-etsy-card]')?.hidden) {
      (root.querySelector('[data-etsy-card]:not([hidden]) .et-card-link') || root.querySelector('.et-empty button'))?.focus();
    }
  });
  window.addEventListener('storage',event => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      const ids = JSON.parse(event.newValue || '[]');
      saved = new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && /^[a-z0-9-]+$/.test(id)) : []);
      syncSaved(); renderCatalogue?.(false);
    } catch {}
  });
  syncSaved();

  if (catalogue) {
    const grid = root.querySelector('.et-grid');
    const cards = [...root.querySelectorAll('[data-etsy-card]')];
    const items = cards.map(card => ({node:card,id:card.dataset.projectId,category:card.dataset.category,title:card.dataset.title,search:card.dataset.search,order:Number(card.dataset.order)}));
    const search = root.querySelector('[data-etsy-search]');
    const input = search.querySelector('input');
    const sort = root.querySelector('[data-etsy-sort]');
    const filters = [...root.querySelectorAll('[data-filter]')];
    const count = root.querySelector('[data-visible-count]');
    const empty = root.querySelector('.et-empty');
    const active = root.querySelector('[data-etsy-active-filters]');
    const label = root.querySelector('[data-etsy-query-label]');
    let state = normalizeEtsyState(location.search);

    renderCatalogue = (animate = false) => {
      input.value = state.q;
      sort.value = state.sort;
      for (const filter of filters) filter.setAttribute('aria-pressed',String(filter.dataset.filter === state.category));
      root.querySelector('.et-results-heading h2').textContent = state.saved ? root.querySelector('.et-saved-link').getAttribute('aria-label') : filters.find(filter=>filter.dataset.filter===state.category).querySelector('span').textContent;
      const chosen = selectEtsyDesigns(items,state,saved,document.documentElement.lang);
      const visible = new Set(chosen.map(item => item.id));
      for (const card of cards) {
        card.getAnimations().forEach(animation => animation.cancel());
        card.hidden = !visible.has(card.dataset.projectId);
        const link = card.querySelector('.et-card-link');
        const target = new URL(link.href,location.href);
        target.search = etsyStateQuery(state,true).toString();
        link.href = target.pathname + target.search;
      }
      for (const item of chosen) {
        grid.append(item.node);
        if (animate && !reducedMotion.matches) item.node.animate([{opacity:.65},{opacity:1}],{duration:160,easing:'ease-out'});
      }
      count.textContent = chosen.length;
      empty.hidden = chosen.length > 0;
      active.hidden = !state.q && !state.saved;
      label.textContent = [state.q ? '“'+state.q+'”' : '',state.saved ? root.dataset.savedNote : ''].filter(Boolean).join(' · ');
      syncLanguages();
    };

    function setState(next) {
      state = normalizeEtsyState(etsyStateQuery({...state,...next}));
      const target = new URL(location.href);
      target.search = etsyStateQuery(state).toString();
      if (target.href !== location.href) history.pushState(null,'',target.pathname + target.search + target.hash);
      renderCatalogue(true);
    }
    search.addEventListener('submit',event => { event.preventDefault();setState({q:input.value}); });
    input.addEventListener('search',() => { if (!input.value) setState({q:''}); });
    sort.addEventListener('change',() => setState({sort:sort.value}));
    for (const filter of filters) filter.addEventListener('click',() => setState({category:filter.dataset.filter}));
    for (const reset of root.querySelectorAll('[data-etsy-reset]')) reset.addEventListener('click',() => setState({category:'all',q:'',saved:false,sort:'portfolio'}));
    window.addEventListener('popstate',() => { state=normalizeEtsyState(location.search);renderCatalogue(false); });
    renderCatalogue(false);
  } else {
    // Native case return is enriched with the catalogue's search/sort/saved context.
    const state = normalizeEtsyState(location.search);
    for (const link of root.querySelectorAll('[data-case-back],[data-case-next]')) {
      const target = new URL(link.href,location.href);
      target.search = etsyStateQuery(state,link.hasAttribute('data-case-next')).toString();
      link.href = target.pathname + target.search;
    }
    const gallery = root.querySelector('[data-etsy-gallery]');
    if (gallery) {
      const frames = [...gallery.querySelectorAll('[data-etsy-frame]')];
      const thumbs = [...gallery.querySelectorAll('[data-etsy-thumb]')];
      const picker = root.querySelector('[data-etsy-view]');
      const counter = root.querySelector('[data-etsy-frame-count]');
      const selectedOpener = root.querySelector('[data-etsy-open-selected]');
      const error = root.querySelector('.et-media-error');
      let current = 0;
      function imageFromUrl() {
        const raw = new URL(location.href).searchParams.get('image');
        const value = raw && /^\d+$/.test(raw) ? Number(raw)-1 : 0;
        return value >= 0 && value < frames.length ? value : 0;
      }
      function show(index,updateHistory=false) {
        current = (index + frames.length) % frames.length;
        frames.forEach((frame,i) => {frame.hidden=i!==current;});
        thumbs.forEach((thumb,i) => thumb.setAttribute('aria-current',String(i===current)));
        picker.value = String(current);
        counter.textContent = (current+1)+' / '+frames.length;
        selectedOpener.dataset.openFrame = current;
        selectedOpener.href = frames[current].href;
        const image = frames[current].querySelector('img');
        error.hidden = !image.complete || image.naturalWidth > 0;
        if (updateHistory) {
          const target = new URL(location.href);
          if (current) target.searchParams.set('image',current+1); else target.searchParams.delete('image');
          if (target.href !== location.href) history.pushState(null,'',target.pathname+target.search+target.hash);
        }
        syncLanguages();
      }
      for (const thumb of thumbs) thumb.addEventListener('click',event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();show(Number(thumb.dataset.etsyThumb),true);
      });
      picker.addEventListener('change',() => show(Number(picker.value),true));
      gallery.querySelector('[data-etsy-previous]').addEventListener('click',() => show(current-1,true));
      gallery.querySelector('[data-etsy-next]').addEventListener('click',() => show(current+1,true));
      for (const [index,frame] of frames.entries()) {
        const image = frame.querySelector('img');
        image.addEventListener('error',() => {if(index===current)error.hidden=false;});
        image.addEventListener('load',() => {if(index===current)error.hidden=true;});
        frame.addEventListener('keydown',event => {
          if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
          event.preventDefault();show(current+(event.key==='ArrowLeft'?-1:1),true);frames[current].focus({preventScroll:true});
        });
      }
      window.addEventListener('popstate',() => show(imageFromUrl()));
      show(imageFromUrl());
      gallery.classList.add('is-enhanced');
    }
  }
}
