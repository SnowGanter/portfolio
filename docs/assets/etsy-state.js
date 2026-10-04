// Shared pure catalogue logic, also exercised by the regression tests.
export function normalizeEtsyState(input) {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input);
  return {
    category: ['wallpaper','painting'].includes(params.get('category')) ? params.get('category') : 'all',
    q: (params.get('q') || '').trim().slice(0,120),
    sort: ['az','za'].includes(params.get('sort')) ? params.get('sort') : 'portfolio',
    saved: params.get('saved') === '1',
  };
}

const normalizeText = value => String(value).normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
export function selectEtsyDesigns(items, state, savedIds = new Set(), language = 'en') {
  const terms = normalizeText(state.q).split(/\s+/).filter(Boolean);
  const selected = items.filter(item => (state.category === 'all' || item.category === state.category) &&
    (!state.saved || savedIds.has(item.id)) && terms.every(term => normalizeText(item.search || item.title).includes(term)));
  if (state.sort !== 'portfolio') {
    const collator = new Intl.Collator(language, {sensitivity:'base',numeric:true});
    selected.sort((a,b) => (state.sort === 'za' ? -1 : 1) * collator.compare(a.title,b.title) || a.order-b.order);
  } else selected.sort((a,b) => a.order-b.order);
  return selected;
}

export function etsyStateQuery(state, project = false) {
  const params = new URLSearchParams();
  if (project) params.set('from','etsy');
  if (state.category !== 'all' || project) params.set('category',state.category);
  if (state.q) params.set('q',state.q);
  if (state.sort !== 'portfolio') params.set('sort',state.sort);
  if (state.saved) params.set('saved','1');
  return params;
}
