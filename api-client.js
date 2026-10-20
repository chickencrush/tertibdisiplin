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
        if (path.indexOf('/api/payroll/verify-pin') === 0 && b.payslip_token) ssSet('td_payslip_token', b.payslip_token);
        if (b.__csv !== undefined) {
          return new Response(b.__csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'X-Filename': b.filename || 'export.csv' } });
        }
      }
      if (r.status === 401 && path.indexOf('/api/auth/login') !== 0 && path.indexOf('/verify-pin') < 0) {
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
