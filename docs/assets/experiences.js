(() => {
  const $=selector=>document.querySelector(selector),all=selector=>[...document.querySelectorAll(selector)];
  const s=JSON.parse($('[data-experience-strings]').textContent);
  if(window.parent!==window)document.body.classList.add('is-embedded');
  for(const b of all('[data-close]'))b.addEventListener('click',()=>b.closest('dialog').close());
  for(const d of all('dialog'))d.addEventListener('click',event=>{if(event.target===d){const rect=d.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)d.close();}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('dialog[open]'))window.parent.postMessage({type:'portfolio:escape'},'*');});
  if(document.documentElement.dataset.experience==='forma') {
    const bag=[],dialog=$('.product-dialog');let product=null,color='';
    const draw=()=>{if(product){$('[data-product-art]').innerHTML=product.querySelector('svg').outerHTML;for(const node of $('[data-product-art]').querySelectorAll('[fill]'))if(node.getAttribute('fill')===product.dataset.color)node.setAttribute('fill',color);}};
    for(const b of all('[data-product]'))b.addEventListener('click',()=>{product=b;color=b.dataset.color;$('[data-product-title]').textContent=b.dataset.title;$('[data-product-price]').textContent='€'+b.dataset.price;for(const c of all('[data-product-colour]'))c.setAttribute('aria-pressed',String(c.dataset.productColour===color));draw();dialog.showModal();});
    for(const b of all('[data-product-colour]'))b.addEventListener('click',()=>{color=b.dataset.productColour;for(const c of all('[data-product-colour]'))c.setAttribute('aria-pressed',String(c===b));draw();});
    for(const b of all('[data-product-filter]'))b.addEventListener('click',()=>{for(const c of all('[data-product-filter]'))c.setAttribute('aria-pressed',String(c===b));for(const p of all('[data-product]'))p.hidden=b.dataset.productFilter!=='all'&&(b.dataset.productFilter==='chair'?!['chair','stool'].includes(p.dataset.kind):p.dataset.kind!==b.dataset.productFilter);});
    const renderBag=(focusIndex=null)=>{
      const items=$('[data-bag-items]');items.replaceChildren();
      if(!bag.length)items.textContent=s.empty;
      for(const [index,item]of bag.entries()) {
        const row=document.createElement('div');row.className='bag-row';
        const name=document.createElement('span');name.textContent=item.title;
        const finish=document.createElement('small');finish.className='bag-finish';finish.textContent=item.finish;name.append(finish);
        const price=document.createElement('span');price.textContent='€'+item.price;
        const remove=document.createElement('button');remove.type='button';remove.textContent=s.remove;
        remove.setAttribute('aria-label',s.remove+' '+item.title+' — '+item.finish);
        remove.addEventListener('click',()=>{bag.splice(index,1);renderBag(index);});
        row.append(name,price,remove);items.append(row);
      }
      $('[data-bag-count]').textContent=bag.length;$('[data-bag-total]').textContent=bag.length?'€'+bag.reduce((sum,item)=>sum+item.price,0):'';$('[data-bag-checkout]').disabled=!bag.length;$('[data-bag-message]').textContent='';
      if(focusIndex!==null) {
        const removeButtons=[...items.querySelectorAll('button')];
        (removeButtons[Math.min(focusIndex,removeButtons.length-1)]||$('.bag-dialog [data-close]')).focus({preventScroll:true});
      }
    };
    $('[data-add-bag]').addEventListener('click',()=>{const finish=all('[data-product-colour]').find(option=>option.dataset.productColour===color)?.getAttribute('aria-label')||'';bag.push({title:product.dataset.title,price:Number(product.dataset.price),color,finish});renderBag();dialog.close();$('.bag-dialog').showModal();});
    $('[data-bag]').addEventListener('click',()=>{renderBag();$('.bag-dialog').showModal();});
    $('[data-bag-checkout]').addEventListener('click',()=>{$('[data-bag-message]').textContent=s.checkout;});
  }
  if(document.documentElement.dataset.experience==='atelier') {
    let room=0;const render=()=>{$('[data-room-art]').innerHTML=all('[data-room]')[room].querySelector('svg').outerHTML;$('[data-room-title]').textContent=s.roomNames[room];};
    for(const b of all('[data-room]'))b.addEventListener('click',()=>{room=Number(b.dataset.room);render();$('.room-dialog').showModal();});
    $('[data-room-next]').addEventListener('click',()=>{room=(room+1)%2;render();});
    $('[data-enquiry]').addEventListener('submit',event=>{event.preventDefault();if(event.target.reportValidity())$('[data-enquiry-status]').textContent=s.enquiry;});
  }
  if(document.documentElement.dataset.experience==='focus') {
    const progress=()=>{$('[data-task-progress]').textContent=$('[data-task-list]').querySelectorAll('input:checked').length+' / '+$('[data-task-list]').querySelectorAll('input').length;};
    $('[data-task-list]').addEventListener('change',progress);
    $('[data-task-form]').addEventListener('submit',event=>{event.preventDefault();const input=event.target.querySelector('input');if(!input.value.trim())return;const label=document.createElement('label');label.className='task';const check=document.createElement('input');check.type='checkbox';const span=document.createElement('span');span.textContent=input.value.trim();label.append(check,span);$('[data-task-list]').append(label);input.value='';progress();});
    let remaining=25*60,deadline=0,interval=0;
    const display=()=>{$('[data-timer]').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');};
    const stop=()=>{clearInterval(interval);interval=0;$('[data-timer-toggle]').textContent=s.start;};
    $('[data-timer-toggle]').addEventListener('click',()=>{if(interval){remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));stop();display();return;}if(!remaining)remaining=25*60;deadline=Date.now()+remaining*1000;$('[data-timer-toggle]').textContent=s.pause;interval=setInterval(()=>{remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));display();if(!remaining){stop();$('[data-timer-status]').textContent=s.finished;}},250);});
    $('[data-timer-reset]').addEventListener('click',()=>{stop();remaining=25*60;display();$('[data-timer-status]').textContent='';});
    for(const b of all('[data-billing]'))b.addEventListener('click',()=>{for(const c of all('[data-billing]'))c.setAttribute('aria-pressed',String(c===b));$('[data-plan-price]').textContent=b.dataset.billing==='yearly'?'€4':'€6';});
    $('[data-plan-select]').addEventListener('click',()=>{$('[data-plan-status]').textContent=s.checkout;});
  }
})();
