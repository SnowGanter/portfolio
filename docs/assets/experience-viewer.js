(() => {
  const root=document.querySelector('[data-experience-viewer]');if(!root)return;
  const viewport=root.querySelector('.experience-viewport'),frame=root.querySelector('iframe');
  const bar=root.querySelector('.experience-bar');
  const status=root.querySelector('.experience-status');
  const measure=()=>{
    root.style.setProperty('--experience-bar-height',Math.ceil(bar.getBoundingClientRect().height)+'px');
    root.style.setProperty('--experience-status-height',Math.ceil(status?.getBoundingClientRect().height||52)+'px');
  };
  measure();if('ResizeObserver' in window){const observer=new ResizeObserver(measure);observer.observe(bar);if(status)observer.observe(status);}
  for(const b of root.querySelectorAll('[data-device]'))b.addEventListener('click',()=>{
    viewport.dataset.width=b.dataset.device;
    for(const other of root.querySelectorAll('[data-device]'))other.setAttribute('aria-pressed',String(other===b));
  });
  root.querySelector('[data-experience-project]').addEventListener('change',event=>location.assign(event.target.value));
  root.querySelector('[data-experience-reload]').addEventListener('click',()=>{frame.src=frame.getAttribute('src');});
  const full=root.querySelector('[data-experience-fullscreen]');if(!document.fullscreenEnabled)full.hidden=true;
  const fullLabel=full.textContent;
  const exitLabel={en:'Exit fullscreen',uk:'Вийти з повного екрана',ru:'Выйти из полного экрана'}[document.documentElement.lang]||'Exit fullscreen';
  const updateFullscreen=()=>{
    const expanded=document.fullscreenElement===root;
    full.textContent=expanded?exitLabel:fullLabel;
    full.setAttribute('aria-pressed',String(expanded));
    measure();
  };
  document.addEventListener('fullscreenchange',updateFullscreen);
  updateFullscreen();
  full.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();}catch{full.hidden=true;}});
  const exit=()=>{if(!document.fullscreenElement)location.assign(root.querySelector('.experience-exit').href);};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open]'))exit();});
  window.addEventListener('message',event=>{
    // Sandboxed local experiences have an opaque origin. Trust this window only,
    // never arbitrary messages from other tabs or external pages.
    if(event.source!==frame.contentWindow)return;
    if(event.data?.type==='portfolio:escape')exit();
  });
})();
