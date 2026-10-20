/* Apps Script bridge with request-scoped session guards. */
(function () {
  var origFetch=window.fetch.bind(window),cfg=window.TD_CONFIG||{},mem={},epoch=0,authSeq=0;
  function lsGet(k){try{return localStorage.getItem(k);}catch(e){return mem[k]||null;}}
  function lsSet(k,v){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){if(v===null)delete mem[k];else mem[k]=v;}}
  function ssGet(k){try{return sessionStorage.getItem(k);}catch(e){return mem['s:'+k]||null;}}
  function ssSet(k,v){try{if(v===null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,v);}catch(e){if(v===null)delete mem['s:'+k];else mem['s:'+k]=v;}}
  function changed(){var e=new Error('Sesi berubah. Respons lama tidak digunakan.');e.code='TD_SESSION_CHANGED';return e;}
  function snapshot(){return{token:lsGet('td_token')||'',slipToken:ssGet('td_payslip_token')||'',epoch:epoch};}
  function matches(s){return s.epoch===epoch&&s.token===(lsGet('td_token')||'');}
  function guardResponse(response,s,seq){
    ['json','text'].forEach(function(name){var read=response[name].bind(response);response[name]=function(){return read().then(function(data){if(!matches(s)||(seq&&seq!==authSeq))throw changed();return data;});};});
    var clone=response.clone.bind(response);response.clone=function(){return guardResponse(clone(),s,seq);};return response;
  }
  function jsonResponse(status,obj){return new Response(JSON.stringify(obj),{status:status,headers:{'Content-Type':'application/json'}});}
  function apiPath(input){try{var raw=typeof input==='string'?input:input.url;var u=new URL(raw,location.href);return u.origin===location.origin&&u.pathname.indexOf('/api/')===0?u.pathname+u.search:null;}catch(e){return null;}}
  function fileToB64(file){return new Promise(function(resolve,reject){var r=new FileReader();r.onload=function(){resolve(String(r.result).split(',')[1]||'');};r.onerror=function(){reject(new Error('Gagal membaca file'));};r.readAsDataURL(file);});}
  function readBody(init){var b=init&&init.body;if(!b)return Promise.resolve({});if(typeof FormData!=='undefined'&&b instanceof FormData){var f=b.get('file');return f?fileToB64(f).then(function(data){return{filename:f.name,data:data};}):Promise.resolve({});}if(typeof b==='string'){try{return Promise.resolve(JSON.parse(b));}catch(e){return Promise.reject(new Error('Body JSON tidak valid.'));}}return Promise.resolve({});}
  function callApi(payload,attempt,s,seq){
    if(!matches(s)||(seq&&seq!==authSeq))return Promise.reject(changed());
    var ctrl=typeof AbortController!=='undefined'?new AbortController():null;
    var timer=ctrl?setTimeout(function(){ctrl.abort();},90000):null;
    return origFetch(cfg.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow',signal:ctrl?ctrl.signal:undefined}).then(function(res){return res.text();}).then(function(text){
      if(timer)clearTimeout(timer);if(!matches(s)||(seq&&seq!==authSeq))throw changed();
      try{return JSON.parse(text);}catch(e){return{status:502,body:{detail:'Server tidak membalas JSON yang valid. Periksa deployment Apps Script.'}};}
    }).catch(function(err){
      if(timer)clearTimeout(timer);if(err.code==='TD_SESSION_CHANGED'||!matches(s)||(seq&&seq!==authSeq))throw changed();
      if(attempt<1&&payload.method==='GET')return callApi(payload,attempt+1,s,seq);
      return{status:503,body:{detail:typeof navigator!=='undefined'&&navigator.onLine===false?'Tidak ada koneksi internet.':'Gagal menghubungi server. Periksa riwayat sebelum mengulang operasi simpan.'}};
    });
  }
  window.fetch=function(input,init){
    init=init||{};var path=apiPath(input);if(path===null)return origFetch(input,init);
    var s=snapshot(),method=String(init.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();
    var auth=/^\/api\/auth\/(login|register)(?:\?|$)/.test(path),seq=auth?++authSeq:0;
    if(!cfg.API_URL||cfg.API_URL.indexOf('https://script.google.com/')!==0)return Promise.resolve(guardResponse(jsonResponse(500,{detail:'API_URL belum valid. Periksa config.js.'}),s,seq));
    return readBody(init).then(function(body){
      if(!matches(s)||(seq&&seq!==authSeq))throw changed();
      return callApi({method:method,path:path,body:body,token:s.token,slipToken:s.slipToken},0,s,seq);
    }).then(function(r){
      if(!matches(s)||(seq&&seq!==authSeq))throw changed();
      var b=r&&r.body,status=r&&Number.isInteger(r.status)&&r.status>=200&&r.status<=599?r.status:500;
      if(status===200&&b){
        if(auth&&b.token){epoch++;lsSet('td_token',b.token);ssSet('td_payslip_token',null);}
        if(path.indexOf('/api/payroll/verify-pin')===0&&b.payslip_token)ssSet('td_payslip_token',b.payslip_token);
        if(b.__csv!==undefined)return guardResponse(new Response(b.__csv,{status:200,headers:{'Content-Type':'text/csv','X-Filename':b.filename||'export.csv'}}),snapshot(),seq);
      }
      if(status===401&&!auth&&path.indexOf('/verify-pin')<0){epoch++;lsSet('td_token',null);ssSet('td_payslip_token',null);window.dispatchEvent(new Event('td-session-expired'));}
      return guardResponse(jsonResponse(status,b),snapshot(),seq);
    });
  };
  window.addEventListener('storage',function(e){if(e.key==='td_token'||e.key===null)epoch++;});
  window.tdLogout=function(){epoch++;authSeq++;lsSet('td_token',null);ssSet('td_payslip_token',null);};
  window.tdDownloadText=function(text,filename,mime){var blob=new Blob([text],{type:mime||'text/plain'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);};
})();

// Existing leave panel mount: keep template, controller and access rules intact.
(function () {
  const base = document.currentScript ? document.currentScript.src : location.href;
  function mount() {
    const menu = document.querySelector('#sidebar .nav-menu');
    const content = document.querySelector('.content-body');
    if (!menu || !content || document.getElementById('view-cuti')) return;
    if (typeof VIEW_ACCESS === 'undefined' || typeof switchView !== 'function') return;
    VIEW_ACCESS.cuti = 'all';
    const panel = document.createElement('section');
    panel.id = 'view-cuti'; panel.className = 'view-panel';
    panel.setAttribute('aria-label', 'Cuti & Izin');
    const host = document.createElement('div'); panel.append(host); content.append(panel);
    const root = host.attachShadow({mode:'open'});
    let loading = false, mounted = false;
    async function load() {
      if (loading || mounted) return;
      loading = true;
      const message = document.createElement('p'); message.setAttribute('role', 'status');
      message.textContent = 'Memuat panel Cuti & Izin...'; root.replaceChildren(message);
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const response = await fetch(new URL('./cuti.html', base).href, {signal:ctrl.signal, cache:'no-store'});
        if (!response.ok) throw new Error('Template panel tidak tersedia.');
        const source = await response.text();
        const template = new DOMParser().parseFromString(source, 'text/html');
        const main = template.querySelector('main');
        if (!main || !main.querySelector('#leave-form')) throw new Error('Template panel tidak valid.');
        main.querySelectorAll('script,iframe,object,embed,header a,header h1').forEach(node => node.remove());
        const style = document.createElement('style');
        style.textContent = (template.querySelector('style')?.textContent || '') + ':host{display:block;font:14px/1.5 system-ui,sans-serif;color:#242432}main{max-width:none;margin:0;padding:0}header{margin-bottom:12px}';
        root.replaceChildren(style, document.importNode(main, true));
        window.TDLeaveRoot = root;
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = new URL('./cuti.js', base).href;
          const timeout = setTimeout(() => reject(new Error('Controller terlalu lama dimuat. Muat ulang aplikasi untuk mencoba lagi.')), 20000);
          script.onload = () => { clearTimeout(timeout); root.__tdLeaveMounted ? resolve() : reject(new Error('Controller panel gagal dimulai.')); };
          script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Controller panel gagal dimuat.')); };
          document.head.append(script);
        });
        mounted = true;
      } catch (error) {
        const status = document.createElement('p'); status.setAttribute('role', 'alert');
        status.textContent = 'Panel gagal dimuat. ' + error.message + ' Muat ulang aplikasi.';
        root.replaceChildren(status);
      } finally { clearTimeout(timer); loading = false; }
    }
    const item = document.createElement('li'); item.id = 'td-leave-sidebar-item';
    const link = document.createElement('a');
    link.id = 'td-leave-sidebar-link'; link.className = 'nav-item';
    link.dataset.view = 'cuti'; link.href = '#cuti';
    const icon = document.createElement('i'); icon.dataset.feather = 'calendar';
    const label = document.createElement('span'); label.textContent = 'Cuti & Izin';
    link.append(icon, label); item.append(link);
    const previous = menu.querySelector('[data-view="presensi"]')?.closest('li');
    if (previous) previous.after(item); else menu.append(item);
    link.addEventListener('click', event => {
      event.preventDefault(); event.stopImmediatePropagation();
      switchView('cuti');
      if (!panel.classList.contains('active')) return;
      document.getElementById('page-title').textContent = 'Cuti & Izin';
      document.getElementById('page-subtitle').textContent = 'Saldo cuti, pengajuan, riwayat, dan persetujuan';
      if (mounted) window.dispatchEvent(new Event('td-leave-open')); else load();
    });
    const gate = document.getElementById('auth-gate-screen');
    function visibility() { item.style.display = gate && !gate.classList.contains('hidden') ? 'none' : ''; }
    visibility();
    if (gate) new MutationObserver(visibility).observe(gate, {attributes:true, attributeFilter:['class']});
    if (window.feather) window.feather.replace();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
