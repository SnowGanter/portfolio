(() => {
  'use strict';
  const root=document.querySelector('[data-amazon-page]');
  if(!root)return;
  const gallery=root.querySelector('[data-amazon-gallery]');
  const frames=[...root.querySelectorAll('[data-amazon-frame]')];
  const thumbs=[...root.querySelectorAll('[data-amazon-thumb]')];
  const choices=[...root.querySelectorAll('[data-amazon-design]')];
  const lookChoices=[...root.querySelectorAll('[data-amazon-look]')];
  const image=root.querySelector('[data-amazon-image]');
  let active=0,request=0;
  function show(index) {
    if(!frames[index]||!image)return;
    active=index;const frame=frames[index];
    thumbs.forEach((link,i)=>link.setAttribute('aria-current',String(i===index)));
    for(const link of gallery.querySelectorAll('[data-open-frame]')){
      link.dataset.openFrame=String(index);link.href=frame.href;
    }
    image.alt=frame.querySelector('img').alt;
    const token=++request,loaded=new Image();
    gallery.setAttribute('aria-busy','true');
    const error=gallery.querySelector('.am-image-error');error.hidden=true;
    loaded.onload=()=>{if(token!==request)return;image.src=loaded.src;image.hidden=false;gallery.setAttribute('aria-busy','false');const sticky=root.querySelector('[data-amazon-sticky-image]');if(sticky)sticky.src=loaded.src;};
    loaded.onerror=()=>{if(token!==request)return;image.hidden=true;error.hidden=false;gallery.setAttribute('aria-busy','false');};
    loaded.src=frame.dataset.preview;
  }
  for(const thumb of thumbs){
    thumb.addEventListener('click',event=>{
      if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
      event.preventDefault();show(Number(thumb.dataset.amazonThumb));
    });
    thumb.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      event.preventDefault();
      const index=event.key==='Home'?0:event.key==='End'?thumbs.length-1:(active+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+thumbs.length)%thumbs.length;
      show(index);thumbs[index].focus();
    });
  }
  function selected(id=new URL(location.href).searchParams.get('design')) {
    const choice=choices.find(link=>link.dataset.amazonDesign===id)||choices[0];
    if(!choice)return;
    const name=choice.querySelector('span').textContent;
    root.querySelector('[data-amazon-design-name]').textContent=name;
    root.querySelector('[data-amazon-selected]').textContent=name;
    choices.forEach(link=>link.setAttribute('aria-current',String(link===choice)));
    const index=frames.findIndex(frame=>frame.dataset.design===choice.dataset.amazonDesign);
    if(index>=0)show(index);
  }
  // Progressive enhancement: without JS, all carousel panels and detail copy
  // are available via <noscript>, the brand rail can scroll, and FAQ uses
  // native <details>. The initial JS frame never collapses three tall panels.
  const carouselStates=[];
  for(const carousel of root.querySelectorAll('[data-amazon-carousel]')) {
    const tabs=[...carousel.querySelectorAll('[data-carousel-tab]')];
    const panels=[...carousel.querySelectorAll('[data-carousel-panel]')];
    const tabList=carousel.querySelector('[data-carousel-tabs]');
    tabList.hidden=false;tabList.setAttribute('role','tablist');
    carousel.querySelector('[data-carousel-controls]').hidden=false;
    let current=0;
    function choose(index,focus=false) {
      current=(index+tabs.length)%tabs.length;
      tabs.forEach((tab,i)=>{tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(i===current));tab.tabIndex=i===current?0:-1;});
      panels.forEach((panel,i)=>{panel.hidden=i!==current;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tabs[i].id);});
      carousel.querySelector('[data-carousel-status]').textContent=`${current+1} / ${tabs.length}`;
      if(focus)tabs[current].focus();
    }
    tabs.forEach((tab,i)=>{
      tab.addEventListener('click',()=>choose(i));
      tab.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();choose(event.key==='Home'?0:event.key==='End'?tabs.length-1:current+(event.key==='ArrowLeft'?-1:1),true);
      });
    });
    carousel.querySelector('[data-carousel-prev]').addEventListener('click',()=>choose(current-1));
    carousel.querySelector('[data-carousel-next]').addEventListener('click',()=>choose(current+1));
    choose(0);
    carouselStates.push({choose,designs:panels.map(panel=>panel.dataset.campaignLook||panel.querySelector('[data-pillow-design]')?.dataset.pillowDesign||'')});
  }
  function syncCarousel(id) {
    for(const state of carouselStates){const index=state.designs.indexOf(id);if(index>=0)state.choose(index);}
  }
  for(const block of root.querySelectorAll('[data-amazon-hotspots]')) {
    const buttons=[...block.querySelectorAll('[data-hotspot]')],copy=[...block.querySelectorAll('[data-hotspot-copy]')];
    const stableLayout=block.classList.contains('am-design-breakdown');
    function open(index){
      buttons.forEach((button,i)=>button.setAttribute('aria-expanded',String(i===index)));
      copy.forEach((article,i)=>{
        if(stableLayout){
          article.classList.toggle('is-active',i===index);
          article.setAttribute('aria-hidden',String(i!==index));
          article.inert=i!==index;
        }else article.hidden=i!==index;
      });
    }
    buttons.forEach((button,i)=>{button.hidden=false;button.addEventListener('click',()=>open(i));});
    open(0);
    if(stableLayout)block.dataset.hotspotsReady='';
  }
  for(const rail of root.querySelectorAll('[data-amazon-rail]')) {
    const track=rail.querySelector('[data-rail-track]'),prev=rail.querySelector('[data-rail-prev]'),next=rail.querySelector('[data-rail-next]');
    prev.hidden=false;next.hidden=false;
    const update=()=>{prev.disabled=track.scrollLeft<=1;next.disabled=track.scrollLeft+track.clientWidth>=track.scrollWidth-2;};
    const move=direction=>track.scrollBy({left:direction*Math.min(track.clientWidth,298),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    prev.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
    track.addEventListener('scroll',update,{passive:true});
    track.addEventListener('keydown',event=>{if(event.target!==track||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();move(event.key==='ArrowLeft'?-1:1);});
    if(typeof ResizeObserver==='function')new ResizeObserver(update).observe(track);
    update();
  }
  function selectedLook(id=new URL(location.href).searchParams.get('look')) {
    const choice=lookChoices.find(link=>link.dataset.amazonLook===id)||lookChoices[0];
    if(!choice)return;
    const name=choice.querySelector('span').textContent;
    root.querySelector('[data-amazon-design-name]').textContent=name;
    root.querySelector('[data-amazon-selected]').textContent=name;
    lookChoices.forEach(link=>link.setAttribute('aria-current',String(link===choice)));
    const index=frames.findIndex(frame=>frame.dataset.design===choice.dataset.amazonLook);
    if(index>=0)show(index);
    syncCarousel(choice.dataset.amazonLook);
    for(const link of document.querySelectorAll('[data-language]')) {
      const target=new URL(link.href,location.href);
      target.search=location.search;target.hash=location.hash;
      link.href=target.pathname+target.search+target.hash;
    }
  }
  for(const choice of lookChoices)choice.addEventListener('click',event=>{
    if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();const next=new URL(location.href);
    next.searchParams.set('look',choice.dataset.amazonLook);
    history.pushState(null,'',next);selectedLook(choice.dataset.amazonLook);
  });
  if(lookChoices.length)selectedLook();else if(choices.length)selected();else if(frames.length)show(0);
  syncCarousel(new URL(location.href).searchParams.get('design'));
  window.addEventListener('popstate',()=>{if(lookChoices.length)selectedLook();else{selected();syncCarousel(new URL(location.href).searchParams.get('design'));}});
  root.addEventListener('portfolio:designchange',event=>{selected(event.detail.id);syncCarousel(event.detail.id);});
  // The 3D module owns design/history changes. Without it the links work natively.
  const sections=[...root.querySelectorAll('[data-amazon-search-section]')];
  const result=root.querySelector('[data-amazon-results]');
  const searchField=root.querySelector('[data-amazon-search] input');
  root.querySelector('[data-amazon-search]').addEventListener('submit',event=>{
    event.preventDefault();
    const query=event.currentTarget.querySelector('input').value.trim().toLocaleLowerCase();
    const matches=sections.filter(section=>query&&((section.id==='product-description'?'a+ content ':'')+section.textContent).toLocaleLowerCase().includes(query));
    result.replaceChildren();result.hidden=false;
    const label=document.createElement('span');label.textContent=matches.length?root.dataset.searchResults:root.dataset.searchEmpty;result.append(label);
    for(const section of matches){const link=document.createElement('a');link.href='#'+section.id;link.textContent=section.querySelector('h2').textContent;result.append(link);}
  });
  function closeSearchResults(event) {
    if(event.key!=='Escape'||event.defaultPrevented||result.hidden||document.querySelector('dialog[open]'))return;
    event.preventDefault();
    // Hiding a currently focused result must not drop focus onto body.
    if(result.contains(document.activeElement))searchField.focus({preventScroll:true});
    result.hidden=true;
  }
  document.addEventListener('keydown',closeSearchResults);
  const sectionLinks=[...root.querySelectorAll('.am-section-links a')];
  let navFrame=0,previousSection='';
  function updateNav() {
    navFrame=0;
    // Native anchor alignment includes both html scroll-padding and section
    // scroll-margin. A fixed 135px threshold incorrectly marked the previous
    // section after a completed anchor jump (the heading actually lands at 164px).
    const padding=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
    const margin=sections.length?(parseFloat(getComputedStyle(sections[0]).scrollMarginTop)||0):0;
    const boundary=Math.max(135,padding+margin+3);
    const current=sections.filter(section=>section.getBoundingClientRect().top<=boundary).at(-1);
    for(const link of sectionLinks){link.removeAttribute('aria-current');if(current&&link.hash==='#'+current.id)link.setAttribute('aria-current','location');}
    if(current&&current.id!==previousSection){
      previousSection=current.id;
      const link=sectionLinks.find(item=>item.hash==='#'+current.id),track=root.querySelector('.am-section-links');
      if(link){const box=link.getBoundingClientRect(),rail=track.getBoundingClientRect();if(box.left<rail.left||box.right>rail.right)track.scrollBy({left:box.left-rail.left-12,behavior:'auto'});}
    }
  }
  window.addEventListener('scroll',()=>{if(!navFrame)navFrame=requestAnimationFrame(updateNav);},{passive:true});
  updateNav();
})();
