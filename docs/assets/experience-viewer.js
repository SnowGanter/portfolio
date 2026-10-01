(() => {
  const root=document.querySelector('[data-experience-viewer]');if(!root)return;
  const viewport=root.querySelector('.experience-viewport'),frame=root.querySelector('iframe');
  const bar=root.querySelector('.experience-bar');
  const measure=()=>root.style.setProperty('--experience-bar-height',Math.ceil(bar.getBoundingClientRect().height)+'px');
  measure();if('ResizeObserver' in window)new ResizeObserver(measure).observe(bar);
  for(const b of root.querySelectorAll('[data-device]'))b.addEventListener('click',()=>{
    viewport.dataset.width=b.dataset.device;
    for(const other of root.querySelectorAll('[data-device]'))other.setAttribute('aria-pressed',String(other===b));
  });
  root.querySelector('[data-experience-project]').addEventListener('change',event=>location.assign(event.target.value));
  root.querySelector('[data-experience-reload]').addEventListener('click',()=>{frame.src=frame.getAttribute('src');});
  const full=root.querySelector('[data-experience-fullscreen]');if(!document.fullscreenEnabled)full.hidden=true;
  full.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();}catch{full.hidden=true;}});
  const exit=()=>{if(!document.fullscreenElement)location.assign(root.querySelector('.experience-exit').href);};
  document.addEventListener('keydown',event=>{if(event.key==='Escape')exit();});
  window.addEventListener('message',event=>{
    // Sandboxed local experiences have an opaque origin. Trust this window only,
    // never arbitrary messages from other tabs or external pages.
    if(event.source!==frame.contentWindow)return;
    if(event.data?.type==='portfolio:escape')exit();
  });
})();
