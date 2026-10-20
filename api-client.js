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

// Bootstrap a separate-page link without joining app.js's data-view router.
(function () {
  function mountLeaveLink() {
    var menu = document.querySelector('#sidebar .nav-menu');
    if (!menu || document.getElementById('td-leave-sidebar-link')) return;
    var style = document.createElement('style');
    style.textContent = '#sidebar .td-leave-nav-link{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:14px;color:rgba(255,255,255,.85);font-size:13.5px;font-weight:600;text-decoration:none;cursor:pointer;transition:background .2s,color .2s}#sidebar .td-leave-nav-link:hover{background:rgba(255,255,255,.1);color:#fff}#sidebar .td-leave-nav-link:focus-visible{outline:2px solid #fff;outline-offset:2px}#td-leave-sidebar-item[hidden]{display:none!important}';
    document.head.appendChild(style);
    var item = document.createElement('li');
    item.id = 'td-leave-sidebar-item';
    var link = document.createElement('a');
    link.id = 'td-leave-sidebar-link';
    link.className = 'td-leave-nav-link';
    link.setAttribute('href', './cuti.html');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24'); svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    svg.style.flexShrink = '0';
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M8 16l3 3 5-5');
    svg.appendChild(path);
    var label = document.createElement('span'); label.textContent = 'Cuti & Izin';
    link.appendChild(svg); link.appendChild(label); item.appendChild(link);
    var attendance = menu.querySelector('[data-view="presensi"]');
    var anchor = attendance && attendance.closest('li');
    if (anchor && anchor.parentNode === menu) menu.insertBefore(item, anchor.nextSibling);
    else menu.appendChild(item);
    var gate = document.getElementById('auth-gate-screen');
    function syncVisibility() { item.hidden = !!gate && !gate.classList.contains('hidden'); }
    syncVisibility();
    if (gate) new MutationObserver(syncVisibility).observe(gate, {attributes:true, attributeFilter:['class']});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLeaveLink, {once:true});
  else mountLeaveLink();
})();
