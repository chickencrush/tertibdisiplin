/* Presentation only. No API calls or changes to business permissions. */
(() => {
  'use strict';
  function mount() {
    const sidebar=document.getElementById('sidebar'), toolbar=document.querySelector('.topbar-left'), content=document.querySelector('.content-body');
    if (!sidebar || !toolbar || !content || document.getElementById('td-command-dialog')) return;
    document.documentElement.dataset.tdUi='modern';
    const gate=document.getElementById('auth-gate-screen');
    const svg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 3v18M14 8h3M14 12h3M14 16h3"/></svg>';
    function signedIn() {
      return !!gate && gate.classList.contains('hidden') && typeof AppState!=='undefined' && !!AppState.currentUser?.id;
    }
    function allowed(link) {
      const view=link.dataset.view;
      if (!signedIn() || !view || !document.getElementById('view-'+view) || typeof canAccessView!=='function' || !canAccessView(view)) return false;
      if (link.hidden || link.getAttribute('aria-hidden')==='true' || getComputedStyle(link).display==='none') return false;
      const item=link.closest('li');
      return !item || !item.hidden && getComputedStyle(item).display!=='none';
    }
    const links=()=>[...sidebar.querySelectorAll('.nav-item[data-view]')].filter(allowed);
    const dialog=document.createElement('dialog'); dialog.id='td-command-dialog'; dialog.className='td-command'; dialog.setAttribute('aria-labelledby','td-command-title');
    dialog.innerHTML='<header><h2 id="td-command-title">Cari menu aplikasi</h2><button type="button" class="td-ui-button" aria-label="Tutup pencarian menu">Tutup</button></header><label for="td-command-input">Ketik nama menu</label><input id="td-command-input" type="search" placeholder="Presensi, cuti, profil..." autocomplete="off"><div class="td-command-list" role="group" aria-label="Hasil pencarian menu"></div><p>Menu mengikuti hak akses akun. Esc untuk menutup.</p>';
    document.body.append(dialog);
    const search=dialog.querySelector('input'), list=dialog.querySelector('.td-command-list');
    const command=document.createElement('button'); command.type='button'; command.className='td-ui-button'; command.setAttribute('aria-haspopup','dialog'); command.setAttribute('aria-controls',dialog.id); command.innerHTML=svg+'<span>Cari menu</span><kbd>Ctrl K</kbd>'; command.disabled=typeof dialog.showModal!=='function'; toolbar.append(command);
    let returnFocus=null;
    function navigate(link) {
      if (!allowed(link)) return;
      if (dialog.open) dialog.close();
      link.click();
    }
    function renderMenu() {
      list.replaceChildren();
      const q=search.value.trim().toLocaleLowerCase('id-ID');
      for (const link of links().filter(link=>(link.getAttribute('aria-label') || link.textContent).toLocaleLowerCase('id-ID').includes(q))) {
        const button=document.createElement('button'); button.type='button'; button.textContent=link.getAttribute('aria-label') || link.textContent.trim(); button.addEventListener('click',()=>navigate(link)); list.append(button);
      }
      if (!list.children.length) {const p=document.createElement('p');p.textContent='Tidak ada menu yang sesuai untuk akun ini.';list.append(p);}
    }
    function openCommand() {
      if (!signedIn() || command.disabled || dialog.open || document.querySelector('.modal-overlay.active')) return;
      returnFocus=document.activeElement; search.value=''; renderMenu(); dialog.showModal(); search.focus();
    }
    command.addEventListener('click',openCommand);
    dialog.querySelector('header button').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{search.value='';list.replaceChildren();if(signedIn() && returnFocus?.isConnected)returnFocus.focus();});
    search.addEventListener('input',renderMenu);
    search.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();list.querySelector('button')?.focus();}if(event.key==='Enter'){event.preventDefault();list.querySelector('button')?.click();}});
    list.addEventListener('keydown',event=>{
      if(!['ArrowDown','ArrowUp'].includes(event.key))return;
      const buttons=[...list.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);event.preventDefault();
      if(event.key==='ArrowUp' && i<=0)search.focus();else buttons[(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
    });
    const compact=document.createElement('button');compact.type='button';compact.className='td-ui-button td-compact-button';compact.innerHTML=svg+'<span>Ringkas</span>';compact.setAttribute('aria-label','Ringkas sidebar desktop');compact.setAttribute('aria-pressed','false');toolbar.append(compact);
    compact.addEventListener('click',()=>{const state=document.documentElement.classList.toggle('td-sidebar-compact');compact.setAttribute('aria-pressed',String(state));compact.setAttribute('aria-label',state?'Perluas sidebar desktop':'Ringkas sidebar desktop');compact.querySelector('span').textContent=state?'Perluas':'Ringkas';});
    const hero=document.createElement('section');hero.className='td-workspace-bar';hero.setAttribute('aria-label','Akses cepat ruang kerja');hero.innerHTML='<div><span class="td-eyebrow">TERTIB DISIPLIN</span><h3>Ruang kerja Anda, lebih terarah.</h3><p>Buka aktivitas utama dari satu tempat.</p></div><div class="td-quick-actions"></div>';document.getElementById('view-dashboard')?.prepend(hero);
    const actions=hero.querySelector('.td-quick-actions'), roots=new WeakSet();let signature='',queued=false,errorNo=0;
    const shadowCss=':host{color:#1e293b;font:14px/1.6 system-ui,sans-serif}.card{border:1px solid #e5e8f0;border-radius:22px;padding:24px;background:#fff;box-shadow:0 3px 14px #18243a08;margin-bottom:20px}h2{font-size:18px;color:#581329}label{font-size:12px;font-weight:650}input,select,textarea{font:inherit;min-height:44px;border:1px solid #d6dce6;border-radius:12px;background:#fbfcfe;padding:11px;max-width:100%}button{font:600 13px/1.5 system-ui;border-radius:12px;min-height:42px;padding:10px 15px;background:#701c34;color:#fff;border:1px solid #701c34}button:disabled{opacity:.5;cursor:not-allowed}:focus-visible{outline:3px solid #2563eb;outline-offset:3px}fieldset{border:1px solid #e5e8f0;border-radius:16px;padding:18px;margin-top:18px;min-width:0}fieldset:disabled{background:#f8f9fc}#notice,#status,#photo-status{border:1px solid #e5e8f0;border-radius:12px;background:#f8fafc;padding:12px;font-size:12px}#notice[data-kind="error"]{background:#fff1f3;color:#991b36}.metric{background:#fcf1f3;border-radius:16px;padding:20px}th{background:#f7f8fc}#photo{border-style:dashed}.td-field-error{color:#a11935;font-size:12px;margin:6px 0}.td-invalid{border-color:#b42343!important}[hidden]{display:none!important}@media(max-width:600px){.card{padding:18px}.metrics,.dates,.grid{grid-template-columns:minmax(0,1fr)}.scroll{overflow:auto}main{padding:0}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}';
    function clearError(field) {
      if(!field.__tdError)return;
      field.classList.remove('td-invalid');field.__tdError.remove();field.__tdError=null;
      for(const [name,value] of Object.entries(field.__tdAria)){if(value===null)field.removeAttribute(name);else field.setAttribute(name,value);}
    }
    function enhance(target) {
      if(!roots.has(target)) {
        roots.add(target);
        target.addEventListener('invalid',event=>{
          const field=event.target;if(!field.matches?.('input,select,textarea') || field.disabled)return;
          if(!field.__tdError){
            const p=document.createElement('p');p.id='td-field-error-'+(++errorNo);p.className='td-field-error';p.setAttribute('role','alert');
            field.__tdAria={'aria-invalid':field.getAttribute('aria-invalid'),'aria-describedby':field.getAttribute('aria-describedby')};
            (field.closest('.form-group') || field.parentElement).append(p);field.__tdError=p;
            field.setAttribute('aria-describedby',[field.__tdAria['aria-describedby'],p.id].filter(Boolean).join(' '));
          }
          field.classList.add('td-invalid');field.setAttribute('aria-invalid','true');field.__tdError.textContent=field.validationMessage || 'Periksa isian kolom ini.';
        },true);
        for(const name of ['input','change'])target.addEventListener(name,event=>{const field=event.target;if(field.__tdError){if(field.validity.valid)clearError(field);else field.__tdError.textContent=field.validationMessage;}});
        target.addEventListener('reset',event=>{queueMicrotask(()=>event.target.querySelectorAll('input,select,textarea').forEach(clearError));},true);
        if(target!==document)new MutationObserver(schedule).observe(target,{childList:true,subtree:true});
      }
      if(target!==document && !target.querySelector('style[data-td-ui-theme]')){const style=document.createElement('style');style.dataset.tdUiTheme='modern';style.textContent=shadowCss;target.append(style);}
      for(const field of target.querySelectorAll('.form-group input[id],.form-group select[id],.form-group textarea[id]')){
        const label=field.closest('.form-group')?.querySelector('label');
        if(label && !label.htmlFor && !field.getAttribute('aria-label') && !field.getAttribute('aria-labelledby'))label.htmlFor=field.id;
      }
    }
    function refreshUi() {
      queued=false;const logged=signedIn();command.hidden=!logged;compact.hidden=!logged;hero.hidden=!logged;
      if(!logged && dialog.open)dialog.close();
      const nav=links();
      for(const link of sidebar.querySelectorAll('.nav-item[data-view]')){
        if(!link.getAttribute('aria-label')){const copy=link.cloneNode(true);copy.querySelectorAll('.badge').forEach(b=>b.remove());link.setAttribute('aria-label',copy.textContent.trim());}
        if(!link.getAttribute('href'))link.setAttribute('href','#'+link.dataset.view);
        if(!link.querySelector('svg,i')){const span=document.createElement('span');span.innerHTML=svg;link.prepend(span.firstElementChild);}
        if(link.classList.contains('active'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
      }
      const picks=['presensi','daily-report','cuti','profile'].map(view=>nav.find(link=>link.dataset.view===view)).filter(Boolean),next=picks.map(link=>link.dataset.view).join('|');
      if(next!==signature){signature=next;actions.replaceChildren();for(const link of picks){const button=document.createElement('button');button.type='button';button.className='td-ui-button';button.textContent=link.getAttribute('aria-label') || link.textContent.trim();button.addEventListener('click',()=>navigate(link));actions.append(button);}}
      const toggle=document.getElementById('btn-toggle-sidebar');if(toggle){toggle.setAttribute('aria-controls','sidebar');toggle.setAttribute('aria-expanded',String(sidebar.classList.contains('open')));}
      enhance(document);
      for(const host of [document.getElementById('td-personal-profile-host'),document.getElementById('td-personal-kpi-host'),document.getElementById('view-cuti')?.firstElementChild])if(host?.shadowRoot)enhance(host.shadowRoot);
      if(dialog.open)renderMenu();
    }
    function schedule(){if(!queued){queued=true;queueMicrotask(refreshUi);}}
    new MutationObserver(schedule).observe(sidebar,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','style']});
    new MutationObserver(schedule).observe(content,{childList:true,subtree:true});
    if(gate)new MutationObserver(schedule).observe(gate,{attributes:true,attributeFilter:['class']});
    window.addEventListener('td-session-expired',()=>{if(dialog.open)dialog.close();actions.replaceChildren();signature='';});
    document.addEventListener('keydown',event=>{if((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='k' && signedIn() && !command.disabled){event.preventDefault();openCommand();}if(event.key==='Escape' && !dialog.open && sidebar.classList.contains('open') && !document.querySelector('.modal-overlay.active'))document.getElementById('btn-toggle-sidebar')?.click();});
    refreshUi();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
