import * as T from './vendor/packaging-three.js?v=41770e7f7122';
import {makePackagingModel,framePackaging} from './packaging-model.js?v=41770e7f7122';
const root=document.querySelector('[data-packaging-viewer]');
if(root) start(root);
async function start(root) {
  const config=JSON.parse(root.querySelector('[data-packaging-config]').textContent);
  const stage=root.querySelector('.pack-stage'),canvas=root.querySelector('canvas'),status=root.querySelector('[data-pack-status]');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const controls=[...root.querySelectorAll('[data-variant]')];
  let renderer,scene,camera,model,materials,raf=0,last=0,visible=true,userPaused=false,lost=false,turnX=.08,turnY=-.38,zoom=1,drag=null,time=0;
  const selected=()=>Math.max(0,config.variants.findIndex(v=>v.id===new URL(location.href).searchParams.get('design')));
  let current=selected(),transition=null,queued=null,request=0;
  const textureCache=new Map(),points=new Map();
  let pinch=0;
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  root.querySelector('[data-pack-retry]').addEventListener('click',()=>location.reload());
  for(const button of controls)button.addEventListener('click',()=>{
    const index=Number(button.dataset.variant);
    if(lost){root.querySelector('.pack-poster').src=config.variants[index].faces[4];root.dataset.variant=config.variants[index].id;status.textContent=config.variants[index].name+' · '+config.strings.failed;for(const other of controls)other.setAttribute('aria-pressed',String(other===button));}
    else if(materials)change(index);
  });
  async function textures(index) {
    if(!textureCache.has(index)) textureCache.set(index,Promise.all(config.variants[index].faces.map(src=>new Promise((resolve,reject)=>{
      let settled=false;
      const timer=setTimeout(()=>{settled=true;reject(new Error('Artwork load timeout'));},20000);
      new T.TextureLoader().load(src,t=>{
        if(settled){t.dispose();return;}settled=true;clearTimeout(timer);
        t.colorSpace=T.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();resolve(t);
      },undefined,error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
    }))).catch(error=>{textureCache.delete(index);throw error;}));
    return textureCache.get(index);
  }
  const needsFrame=()=>!lost&&!document.hidden&&(visible||transition);
  function render() {if(renderer&&!lost){renderer.render(scene,camera);if(model){root.dataset.pose=[model.rotation.x,model.rotation.y,model.position.y].map(n=>n.toFixed(4)).join(',');root.dataset.zoom=zoom.toFixed(3);root.dataset.time=time.toFixed(3);}}}
  function pose() {
    model.rotation.set(turnX,turnY+Math.sin(time*.38)*.07,0);
    model.position.y=Math.sin(time*.65)*.025;
  }
  function tick(now) {
    raf=0;if(!needsFrame())return;
    const dt=last?Math.min(.04,(now-last)/1000):0;last=now;
    if(!reduced.matches&&!userPaused&&!drag)time+=dt;
    if(transition) {
      transition.elapsed+=dt;
      const p=reduced.matches?1:clamp(transition.elapsed/.95,0,1);
      for(const material of materials)material.userData.blend.value=p;
      root.dataset.transition=p.toFixed(3);
      if(p===1) {
        current=transition.index;
        for(let i=0;i<materials.length;i++){materials[i].map=transition.maps[i];materials[i].userData.blend.value=0;materials[i].userData.next.value=transition.maps[i];materials[i].needsUpdate=true;}
        if(transition.record){
          const destination=new URL(location.href);destination.searchParams.set('design',config.variants[current].id);
          if(destination.href!==location.href)history.pushState({design:config.variants[current].id},'',destination);
          for(const link of document.querySelectorAll('[data-language]')){const target=new URL(link.href,location.href);target.search=destination.search;target.hash=destination.hash;link.href=target.pathname+target.search+target.hash;}
        }
        transition=null;root.dataset.variant=config.variants[current].id;root.setAttribute('aria-busy','false');
        status.textContent=config.variants[current].name;
        for(const b of controls)b.setAttribute('aria-pressed',String(Number(b.dataset.variant)===current));
        if(queued!==null){const next=queued;queued=null;change(next.index,next.record);}
      }
    }
    pose();render();
    if(transition||(!reduced.matches&&!userPaused&&!drag))raf=requestAnimationFrame(tick);
  }
  function wake(){last=0;if(needsFrame()&&!raf)raf=requestAnimationFrame(tick);}
  function size(){
    if(!renderer)return;
    const box=stage.getBoundingClientRect(),a=Math.max(1,box.width)/Math.max(1,box.height),distance=framePackaging(config.dimensions,a);
    renderer.setSize(box.width,box.height,false);camera.aspect=a;camera.position.set(0,.12,distance/zoom);camera.lookAt(0,.13,0);camera.updateProjectionMatrix();render();
  }
  async function change(index,record=true) {
    if(transition){queued={index,record};return;}
    if(index===current){
      // Returning to the current skin also cancels an older in-flight load.
      ++request;root.setAttribute('aria-busy','false');status.textContent=config.variants[current].name;return;
    }
    const token=++request;root.setAttribute('aria-busy','true');status.textContent=config.strings.loading;
    try {
      const maps=await textures(index);if(token!==request||lost)return;
      for(let i=0;i<materials.length;i++)materials[i].userData.next.value=maps[i];
      transition={index,maps,elapsed:0,record};wake();
    }catch{if(token!==request||lost)return;root.setAttribute('aria-busy','false');status.textContent=config.strings.textureFailed;}
  }
  function fail(){
    lost=true;cancelAnimationFrame(raf);raf=0;root.dataset.ready='false';canvas.hidden=true;status.textContent=config.strings.failed;
    root.querySelector('[data-pack-retry]').hidden=false;
    for(const button of root.querySelectorAll('.pack-toolbar button'))button.disabled=true;
  }
  try {
    renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
    scene=new T.Scene();camera=new T.PerspectiveCamera(32,1,.1,100);
    scene.add(new T.HemisphereLight('#ffffff','#b5b8c4',1.5));
    const key=new T.DirectionalLight('#ffffff',2.2);key.position.set(-3,4,6);scene.add(key);
    const rim=new T.DirectionalLight('#e1e9ff',1.0);rim.position.set(4,2,-3);scene.add(rim);
    const maps=await textures(current);
    materials=maps.map(map=>{
      const m=new T.MeshStandardMaterial({map,roughness:config.model==='pouch'?.52:.83,metalness:config.model==='pouch'?.08:.01});
      m.userData.blend={value:0};m.userData.next={value:map};
      m.onBeforeCompile=shader=>{
        shader.uniforms.uCoat=m.userData.blend;shader.uniforms.uNext=m.userData.next;
        shader.fragmentShader='uniform float uCoat;uniform sampler2D uNext;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
          vec4 oldCoat=texture2D(map,vMapUv);vec4 newCoat=texture2D(uNext,vMapUv);
          float edge=uCoat*1.3-.15;float coat=smoothstep(vMapUv.x*.72+(1.-vMapUv.y)*.28-.08,vMapUv.x*.72+(1.-vMapUv.y)*.28+.08,edge);
          diffuseColor*=mix(oldCoat,newCoat,coat);
          #endif`);
      };m.customProgramCacheKey=()=> 'packaging-coat-1';return m;
    });
    model=makePackagingModel(T,config,materials);scene.add(model);
    size();pose();render();canvas.hidden=false;root.dataset.ready='true';root.dataset.variant=config.variants[current].id;status.textContent=config.variants[current].name;
    for(const button of controls)button.setAttribute('aria-pressed',String(Number(button.dataset.variant)===current));wake();
  }catch{fail();return;}
  new ResizeObserver(size).observe(stage);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible&&!transition){cancelAnimationFrame(raf);raf=0;last=0;}else wake();},{threshold:.05}).observe(stage);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;last=0;}else wake();});
  window.addEventListener('popstate',()=>change(selected(),false));
  reduced.addEventListener('change',()=>{pose();render();wake();});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail();});
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  const point=event=>({x:event.clientX,y:event.clientY});
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;canvas.setPointerCapture(event.pointerId);points.set(event.pointerId,point(event));drag=point(event);if(points.size===2){const[a,b]=[...points.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}else pinch=0;canvas.dataset.dragging='true';});
  canvas.addEventListener('pointermove',event=>{
    if(!points.has(event.pointerId))return;
    const next=point(event);points.set(event.pointerId,next);
    if(points.size===2){const [a,b]=[...points.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch){zoom=clamp(zoom*distance/pinch,.7,1.9);size();}pinch=distance;}
    else if(drag){turnY+=(next.x-drag.x)*.008;turnX=clamp(turnX+(next.y-drag.y)*.006,-1.1,1.1);}
    drag=next;pose();render();
  });
  const end=event=>{points.delete(event.pointerId);pinch=0;drag=points.size?[...points.values()][0]:null;if(!drag){delete canvas.dataset.dragging;wake();}};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
  canvas.addEventListener('wheel',event=>{if(event.ctrlKey)return;event.preventDefault();zoom=clamp(zoom*Math.exp(-event.deltaY*.001),.7,1.9);size();},{passive:false});
  canvas.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home',' '].includes(event.key))return;event.preventDefault();
    if(event.key==='Home')reset();else if(event.key===' ')togglePause();else{turnY+=(event.key==='ArrowLeft'?-.15:event.key==='ArrowRight'?.15:0);turnX=clamp(turnX+(event.key==='ArrowUp'?-.1:event.key==='ArrowDown'?.1:0),-1.1,1.1);pose();render();}
  });
  function reset(){turnX=.08;turnY=-.38;zoom=1;time=0;pose();size();wake();}
  function togglePause(){userPaused=!userPaused;const b=root.querySelector('[data-pack-pause]');b.setAttribute('aria-pressed',String(userPaused));b.textContent=userPaused?config.strings.play:config.strings.pause;pose();render();wake();}
  root.querySelector('[data-pack-reset]').addEventListener('click',reset);
  root.querySelector('[data-pack-pause]').addEventListener('click',togglePause);
  root.querySelector('[data-pack-zoom-in]').addEventListener('click',()=>{zoom=clamp(zoom*1.15,.7,1.9);size();});
  root.querySelector('[data-pack-zoom-out]').addEventListener('click',()=>{zoom=clamp(zoom/1.15,.7,1.9);size();});
  const full=root.querySelector('[data-pack-fullscreen]');
  if(!document.fullscreenEnabled)full.hidden=true;
  full.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();}catch{status.textContent=config.strings.fullFailed;}});
}
