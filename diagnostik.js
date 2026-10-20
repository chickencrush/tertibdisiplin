/*
 * diagnostik.js - memeriksa rantai: GitHub -> config.js -> Apps Script -> Spreadsheet.
 * Dipakai oleh diagnostik.html. env = { cfg, fetch, baseUrl, isHttps, hasSW }
 * log(status, judul, saran)  status: 'ok' | 'warn' | 'fail'
 */
async function tdRunDiagnostics(env, log) {
  const cfg = env.cfg || {};
  const url = cfg.API_URL || '';
  const get = (u, opt) => env.fetch(u, Object.assign({ cache: 'no-store' }, opt || {}));

  // 1. config.js
  let configOk = false;
  if (!env.cfg) {
    log('fail', 'config.js tidak terbaca', 'File config.js belum terunggah, atau isinya salah ketik (tanda kutip / titik koma). Buka config.js di GitHub dan bandingkan dengan contoh.');
  } else if (!url || url.indexOf('GANTI_DENGAN') >= 0) {
    log('fail', 'API_URL di config.js belum diisi', 'Ganti tulisan GANTI_DENGAN_LINK_EXEC_APPS_SCRIPT dengan link Web app dari Apps Script. Setelah disimpan, tunggu 1 sampai 10 menit (cache GitHub) atau tekan Ctrl+F5.');
  } else if (url.indexOf('https://script.google.com/') !== 0) {
    log('fail', 'API_URL bukan link Apps Script', 'Link harus diawali https://script.google.com/ . Yang kamu isi: ' + url.slice(0, 60));
  } else if (/\/dev$/.test(url)) {
    log('fail', 'API_URL memakai link /dev', 'Link /dev hanya untuk pengujian pemilik. Pakai link Web app berakhiran /exec dari Deploy > New deployment.');
  } else if (!/\/exec$/.test(url)) {
    log('warn', 'API_URL tidak berakhiran /exec', 'Pastikan salinan link lengkap sampai /exec, tanpa spasi.');
    configOk = true;
  } else {
    log('ok', 'config.js terbaca dan API_URL terisi', url.slice(0, 55) + '...');
    configOk = true;
  }

  // 2. berkas aplikasi di GitHub
  const files = ['index.html', 'style.css', 'app.js', 'api-client.js', 'manifest.json', 'sw.js', 'icons/logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/favicon.png', 'icons/apple-touch-icon.png'];
  const missing = [];
  for (const f of files) {
    try { const r = await get(env.baseUrl + f); if (!r.ok) missing.push(f); } catch (e) { missing.push(f); }
  }
  if (!missing.length) log('ok', 'Semua berkas aplikasi dan ikon ada di GitHub', files.length + ' berkas terbaca.');
  else {
    const iconMissing = missing.some(m => m.indexOf('icons/') === 0);
    log('fail', 'Berkas belum ada di GitHub: ' + missing.join(', '),
      iconMissing ? 'Folder icons belum terunggah. Di repository: Add file > Upload files, lalu SERET folder "icons" (bukan isinya satu per satu) dari komputer. Setelah commit, repository harus menampilkan folder icons di daftar paling atas.'
                  : 'Unggah berkas tersebut ke repository, di tingkat paling atas (bukan di dalam subfolder).');
  }

  // 3. Apps Script bisa dijangkau
  if (!configOk) { log('warn', 'Pemeriksaan server dilewati', 'Perbaiki config.js dulu.'); }
  else {
    let reachable = false;
    try {
      const r = await get(url);
      const text = await r.text();
      let j = null; try { j = JSON.parse(text); } catch (e) { /* bukan JSON */ }
      if (j && j.body && j.body.ok) { log('ok', 'Apps Script merespons (GET)', 'Server hidup dan akses publik berfungsi.'); reachable = true; }
      else if (/^\s*</.test(text)) log('fail', 'Apps Script mengembalikan halaman Google, bukan data', 'Biasanya Deploy belum diatur "Who has access: Anyone", atau memakai link lama. Buka Deploy > Manage deployments > pastikan Web app, Execute as: Me, Who has access: Anyone, lalu buat New version.');
      else log('fail', 'Balasan Apps Script tidak dikenal', text.slice(0, 120));
    } catch (e) {
      log('fail', 'Tidak bisa terhubung ke Apps Script', 'Periksa internet. Jika internet normal, link /exec salah atau Deploy belum "Anyone". Pesan: ' + (e && e.message));
    }

    if (reachable) {
      // 4. rute API
      const post = async (path, body) => {
        const r = await env.fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ method: 'POST', path: path, body: body || {}, token: '', slipToken: '' }), redirect: 'follow' });
        return JSON.parse(await r.text());
      };
      try {
        const cfgRes = await (async () => {
          const r = await env.fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ method: 'GET', path: '/api/config', body: {}, token: '', slipToken: '' }), redirect: 'follow' });
          return JSON.parse(await r.text());
        })();
        if (cfgRes.status === 200 && cfgRes.body && cfgRes.body.appName) log('ok', 'Kiriman data (POST) dari GitHub ke Apps Script berhasil', 'Jalur CORS aman.');
        else log('fail', 'Apps Script menjawab tapi bukan kode TERTIB DISIPLIN', 'Kemungkinan Code.gs belum ditempel atau belum dibuat "New version". Balasan: ' + JSON.stringify(cfgRes).slice(0, 120));

        // 5. Spreadsheet siap
        const lr = await post('/api/auth/login', { identifier: 'diagnostik-tes', password: 'tes-saja' });
        if (lr.status === 401) log('ok', 'Spreadsheet dan rute login siap', 'Akun uji ditolak seperti seharusnya.');
        else if (lr.status === 429) log('warn', 'Login sedang terkunci sementara', 'Terlalu banyak percobaan. Tunggu 5 menit.');
        else if (lr.status === 500) log('fail', 'Spreadsheet belum siap', (lr.body && lr.body.detail) || 'Jalankan menu TERTIB DISIPLIN > 1. Setup awal di Spreadsheet.');
        else log('warn', 'Balasan login tak terduga (status ' + lr.status + ')', JSON.stringify(lr.body).slice(0, 120));
      } catch (e) {
        log('fail', 'Kiriman data (POST) gagal', 'Pesan: ' + (e && e.message) + '. Bila GET berhasil tapi POST gagal, buat New version di Deploy > Manage deployments.');
      }
    }
  }

  // 6. peramban
  log(env.isHttps ? 'ok' : 'fail', env.isHttps ? 'Dibuka lewat HTTPS' : 'Tidak memakai HTTPS', env.isHttps ? 'Kamera dan lokasi bisa berfungsi.' : 'Buka lewat https://NAMA.github.io/... supaya kamera dan lokasi diizinkan.');
  log(env.hasSW ? 'ok' : 'warn', env.hasSW ? 'Peramban mendukung PWA' : 'Peramban tidak mendukung Service Worker', env.hasSW ? '' : 'Pasang aplikasi lewat Chrome (Android) atau Safari (iPhone).');
}
if (typeof module !== 'undefined') module.exports = { tdRunDiagnostics };
