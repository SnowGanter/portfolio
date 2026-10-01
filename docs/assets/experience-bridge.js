document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))window.parent.postMessage({type:'portfolio:escape'},'*');});
