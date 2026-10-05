const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const language=document.documentElement.lang;
const t=values=>values[['en','uk','ru'].indexOf(language)]??values[0];
function languageLinks(){for(const a of document.querySelectorAll('[data-language]')){const u=new URL(a.href,location.href);u.search=location.search;u.hash=location.hash;a.href=u.pathname+u.search+u.hash;}}
const catalog=document.querySelector('[data-ad-catalog]');
if(catalog){
  const buttons=[...catalog.querySelectorAll('[data-ad-filter]')],cards=[...catalog.querySelectorAll('[data-ad-card]')];
  function render(value,push=false){
    const category=buttons.some(b=>b.dataset.adFilter===value)?value:'all';
    for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.adFilter===category));
    for(const card of cards){
      card.getAnimations().forEach(a=>a.cancel());
      card.hidden=category!=='all'&&card.dataset.adCategory!==category;
      const href=new URL(card.href,location.href);
      if(category==='all')href.searchParams.delete('category');else href.searchParams.set('category',category);
      card.href=href.pathname+href.search;
      if(!card.hidden&&push&&!reduced.matches)card.animate([{opacity:.65},{opacity:1}],{duration:180,easing:'ease-out'});
    }
    catalog.querySelector('[data-ad-count]').textContent=cards.filter(c=>!c.hidden).length;
    if(push){const u=new URL(location.href);if(category==='all')u.searchParams.delete('category');else u.searchParams.set('category',category);if(u.href!==location.href)history.pushState({},'',u);}
    languageLinks();
  }
  buttons.forEach(b=>b.addEventListener('click',()=>render(b.dataset.adFilter,true)));
  addEventListener('popstate',()=>render(new URL(location.href).searchParams.get('category')));
  render(new URL(location.href).searchParams.get('category'));
}
const page=document.querySelector('[data-ad-case]');
if(page){
  const frames=[...page.querySelectorAll('[data-ad-format]')],buttons=[...page.querySelectorAll('[data-ad-select]')];
  const status=page.querySelector('[data-ad-status]'),error=page.querySelector('[data-ad-error]');
  let active='feed',token=0;
  for(const frame of frames){
    const img=frame.querySelector('img');
    img.addEventListener('error',()=>{if(frame.dataset.adFormat===active){status.textContent='';error.hidden=false;}});
    img.addEventListener('load',()=>{if(frame.dataset.adFormat===active)error.hidden=true;});
  }
  const valid=value=>frames.some(f=>f.dataset.adFormat===value)?value:'feed';
  function state(value,push){
    active=valid(value);
    for(const f of frames){f.hidden=f.dataset.adFormat!==active;f.inert=f.hidden;}
    for(const b of buttons){if(b.dataset.adSelect===active)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');}
    const img=frames.find(f=>f.dataset.adFormat===active).querySelector('img');
    // Width/height HTML attributes are the full layout size, independent of rendered size.
    page.querySelector('[data-ad-dimensions]').textContent=img.getAttribute('width')+' × '+img.getAttribute('height')+' px';
    if(push){const u=new URL(location.href);u.searchParams.set('format',active);if(u.href!==location.href)history.pushState({},'',u);}
    const category=new URL(location.href).searchParams.get('category');
    const back=new URL(page.querySelector('[data-ad-back]').href,location.href);
    if(['product','travel','culture'].includes(category))back.searchParams.set('category',category);else back.searchParams.delete('category');
    page.querySelector('[data-ad-back]').href=back.pathname+back.search;
    for(const b of [...buttons,...page.querySelectorAll('[data-ad-jump]')]){const href=new URL(location.href);href.hash='';href.searchParams.set('format',b.dataset.adSelect||b.dataset.adJump);b.href=href.pathname+href.search;}
    languageLinks();
  }
  async function change(value,push=true,scroll=false){
    const id=valid(value),request=++token;
    status.textContent=t(['Loading…','Завантаження…','Загрузка…']);error.hidden=true;
    const img=frames.find(f=>f.dataset.adFormat===id).querySelector('img');
    img.loading='eager';
    try{await img.decode();if(request!==token)return;}
    catch{if(request===token){status.textContent='';error.hidden=false;}return;}
    state(id,push);status.textContent='';
    const f=frames.find(f=>f.dataset.adFormat===id);
    if(!reduced.matches)f.animate([{opacity:.55},{opacity:1}],{duration:180,easing:'ease-out'});
    if(scroll)page.querySelector('.ad-showcase').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});
  }
  for(const b of [...buttons,...page.querySelectorAll('[data-ad-jump]')])b.addEventListener('click',event=>{
    if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();change(b.dataset.adSelect||b.dataset.adJump,true,Boolean(b.dataset.adJump));
  });
  page.querySelector('[data-ad-safe]').addEventListener('change',event=>page.classList.toggle('ad-show-safe',event.target.checked));
  page.classList.add('ad-ready');state(new URL(location.href).searchParams.get('format'),false);
  const first=frames.find(f=>f.dataset.adFormat===active).querySelector('img');
  if(first.complete&&!first.naturalWidth)error.hidden=false;
  addEventListener('popstate',()=>change(new URL(location.href).searchParams.get('format'),false));
  addEventListener('pageshow',languageLinks);
}
