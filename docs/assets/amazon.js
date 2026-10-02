(() => {
  'use strict';
  const root=document.querySelector('[data-amazon-page]');
  if(!root)return;
  const gallery=root.querySelector('[data-amazon-gallery]');
  const frames=[...root.querySelectorAll('[data-amazon-frame]')];
  const thumbs=[...root.querySelectorAll('[data-amazon-thumb]')];
  const choices=[...root.querySelectorAll('[data-amazon-design]')];
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
    loaded.onload=()=>{if(token!==request)return;image.src=loaded.src;image.hidden=false;gallery.setAttribute('aria-busy','false');};
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
  if(choices.length)selected();else if(frames.length)show(0);
  window.addEventListener('popstate',()=>selected());
  root.addEventListener('portfolio:designchange',event=>selected(event.detail.id));
  // The 3D module owns design/history changes. Without it the links work natively.
  const sections=[...root.querySelectorAll('[data-amazon-search-section]')];
  const result=root.querySelector('[data-amazon-results]');
  root.querySelector('[data-amazon-search]').addEventListener('submit',event=>{
    event.preventDefault();
    const query=event.currentTarget.querySelector('input').value.trim().toLocaleLowerCase();
    const matches=sections.filter(section=>query&&((section.id==='product-description'?'a+ content ':'')+section.textContent).toLocaleLowerCase().includes(query));
    result.replaceChildren();result.hidden=false;
    const label=document.createElement('span');label.textContent=matches.length?root.dataset.searchResults:root.dataset.searchEmpty;result.append(label);
    for(const section of matches){const link=document.createElement('a');link.href='#'+section.id;link.textContent=section.querySelector('h2').textContent;result.append(link);}
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')result.hidden=true;});
  for(const link of root.querySelectorAll('.am-section-nav a'))link.addEventListener('click',()=>{
    for(const item of root.querySelectorAll('.am-section-nav a'))item.removeAttribute('aria-current');link.setAttribute('aria-current','location');
  });
})();
