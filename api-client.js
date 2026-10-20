/*
 * api-client.js - penghubung aplikasi ke Google Apps Script.
 * Semua fetch('/api/...') dari app.js dialihkan ke API_URL (Apps Script) sebagai POST JSON.
 * Content-Type "text/plain" dipakai agar browser tidak mengirim preflight CORS.
 */
(function () {
  var origFetch = window.fetch.bind(window);
  var cfg = window.TD_CONFIG || {};
  var mem = {};

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } }
  function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { if (v === null) delete mem[k]; else mem[k] = v; } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return mem['s:' + k] || null; } }
  function ssSet(k, v) { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { if (v === null) delete mem['s:' + k]; else mem['s:' + k] = v; } }

  function urlOf(input) { return typeof input === 'string' ? input : (input && input.url) || ''; }
  function apiPath(url) {
    var i = url.indexOf('/api/');
    if (i === 0) return url;
    if (i > 0 && url.indexOf(location.origin) === 0) return url.slice(i);
    return null;
  }
  function jsonResponse(status, obj) {
    return new Response(JSON.stringify(obj), { status: status, headers: { 'Content-Type': 'application/json' } });
  }
  function fileToB64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { reject(new Error('Gagal membaca file')); };
      r.readAsDataURL(file);
    });
  }
  function readBody(init) {
    var b = init && init.body;
    if (!b) return Promise.resolve({});
    if (typeof FormData !== 'undefined' && b instanceof FormData) {
      var f = b.get('file');
      return f ? fileToB64(f).then(function (d) { return { filename: f.name, data: d }; }) : Promise.resolve({});
    }
    if (typeof b === 'string') { try { return Promise.resolve(JSON.parse(b)); } catch (e) { return Promise.resolve({}); } }
    return Promise.resolve({});
  }

  function callApi(payload, attempt) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 90000) : null;
    return origFetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.text();
    }).then(function (text) {
      try { return JSON.parse(text); }
      catch (e) { return { status: 502, body: { detail: 'Server tidak membalas dengan benar. Periksa link API_URL di config.js dan pengaturan Deploy Apps Script (Who has access: Anyone).' } }; }
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      // Apps Script kadang lambat saat "bangun" pertama kali: coba ulang sekali untuk permintaan baca
      if (attempt < 1 && payload.method === 'GET') return callApi(payload, attempt + 1);
      var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      return { status: 503, body: { detail: offline ? 'Tidak ada koneksi internet.' : 'Gagal menghubungi server. Periksa koneksi lalu coba lagi.' } };
    });
  }

  window.fetch = function (input, init) {
    init = init || {};
    var path = apiPath(urlOf(input));
    if (path === null) return origFetch(input, init);

    if (!cfg.API_URL || cfg.API_URL.indexOf('https://script.google.com/') !== 0) {
      return Promise.resolve(jsonResponse(500, { detail: 'API_URL belum diisi. Buka config.js dan isi dengan link /exec dari Apps Script.' }));
    }
    var method = String(init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();

    return readBody(init).then(function (body) {
      return callApi({ method: method, path: path, body: body, token: lsGet('td_token') || '', slipToken: ssGet('td_payslip_token') || '' }, 0);
    }).then(function (r) {
      var b = r.body;
      if (r.status === 200 && b) {
        if (path.indexOf('/api/auth/login') === 0 && b.token) lsSet('td_token', b.token);
        if (path.indexOf('/api/auth/register') === 0 && b.token) lsSet('td_token', b.token);
        if (path.indexOf('/api/payroll/verify-pin') === 0 && b.payslip_token) ssSet('td_payslip_token', b.payslip_token);
        if (b.__csv !== undefined) {
          return new Response(b.__csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'X-Filename': b.filename || 'export.csv' } });
        }
      }
      if (r.status === 401 && path.indexOf('/api/auth/login') !== 0 && path.indexOf('/api/auth/register') !== 0 && path.indexOf('/verify-pin') < 0) {
        lsSet('td_token', null); ssSet('td_payslip_token', null);
        window.dispatchEvent(new Event('td-session-expired'));
      }
      var status = (r.status >= 200 && r.status <= 599) ? r.status : 500;
      return jsonResponse(status, b);
    });
  };

  window.tdLogout = function () { lsSet('td_token', null); ssSet('td_payslip_token', null); };

  window.tdDownloadText = function (text, filename, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
})();

// Register a native app view. Shadow DOM isolates template styles and IDs.
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
