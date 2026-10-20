(() => {
  'use strict';
  const kpi = document.getElementById('view-kpi');
  const content = document.querySelector('.content-body');
  const menu = document.querySelector('#sidebar .nav-menu');
  if (!kpi || !content || !menu || document.getElementById('view-profile')) return;
  if (typeof VIEW_ACCESS === 'undefined' || typeof switchView !== 'function') return;
  VIEW_ACCESS.profile = 'all';
  const css = ':host{display:block;color:#1e293b;font:14px/1.5 system-ui,sans-serif}*{box-sizing:border-box}.card{background:#fff;border:1px solid #ddd;border-radius:14px;padding:20px;margin-bottom:16px}h2{margin-top:0}label{display:block;margin:12px 0}input,textarea,button{font:inherit;padding:10px;border:1px solid #aaa;border-radius:8px}input,textarea{display:block;width:100%;margin-top:6px}button{cursor:pointer;background:#701c34;color:#fff}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #2563eb;outline-offset:2px}img{width:100px;height:100px;object-fit:cover;border-radius:50%}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.metric{padding:16px;background:#fcf1f3;border-radius:10px}.value{display:block;font-size:24px;font-weight:700}p{overflow-wrap:anywhere}[hidden]{display:none!important}';
  function createRoot(parent, id, html) {
    const host = document.createElement('div'); host.id = id; parent.append(host);
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = '<style>' + css + '</style>' + html; return root;
  }
  const hideLegacy = document.createElement('style');
  hideLegacy.textContent = '#view-kpi > :not(#td-personal-kpi-host){display:none!important}'; document.head.append(hideLegacy);
  const kr = createRoot(kpi, 'td-personal-kpi-host', '<section class="card"><h2>Analisis KPI Saya</h2><p id="identity"></p><p id="status" role="status" aria-live="polite">Data KPI pribadi belum tersedia.</p><button id="refresh" type="button">Muat ulang KPI</button></section><div id="metrics" class="grid"></div>');
  const profile = document.createElement('section'); profile.id = 'view-profile'; profile.className = 'view-panel'; profile.setAttribute('aria-label','Profil Saya'); content.append(profile);
  const pr = createRoot(profile, 'td-personal-profile-host', '<section class="card"><h2>Profil Saya</h2><p id="identity"></p><p id="status" role="status" aria-live="polite">Muat profil dari server.</p><button id="refresh" type="button">Muat ulang profil</button><form id="form"><fieldset id="fields" disabled><legend>Data diri karyawan</legend><img id="avatar" src="./logo.png" alt="Foto profil karyawan"><label for="photo">Foto profil (JPEG, PNG, WebP; maksimal 2 MB)<input id="photo" type="file" accept="image/jpeg,image/png,image/webp"></label><label for="name">Nama lengkap<input id="name" required maxlength="120" autocomplete="name"></label><label for="email">Email<input id="email" type="email" required maxlength="254" autocomplete="email"></label><label for="phone">Nomor HP<input id="phone" type="tel" maxlength="30" autocomplete="tel"></label><label for="address">Alamat (opsional)<textarea id="address" maxlength="1000" autocomplete="street-address"></textarea></label><p>NIP, divisi, jabatan, hak akses, dan gaji tidak dapat diubah di sini.</p><button type="submit">Simpan profil</button></fieldset></form></section>');
  const node = (root,id) => root.getElementById(id);
  const status = (root,message) => { node(root,'status').textContent = message; };
  const safeImage = value => { try { const url = new URL(value, location.href); return url.protocol === 'https:' ? url.href : './logo.png'; } catch (_) { return './logo.png'; } };
  const current = () => { const gate = document.getElementById('auth-gate-screen'); return gate && !gate.classList.contains('hidden') ? null : (typeof AppState !== 'undefined' ? AppState.currentUser : null); };
  const validId = value => ['string','number'].includes(typeof value) && String(value).trim() !== '';
  let generation = 0, profileVersion = null, canEdit = false, saving = false, photoBusy = false, photo = null, photoSeq = 0;
  let kpiBusy = false, profileBusy = false;
  function same(g,id) { return g === generation && validId(current()?.id) && String(current().id) === String(id); }
  function controls() { node(pr,'fields').disabled = !canEdit || saving || photoBusy || profileBusy; node(pr,'refresh').disabled = saving || photoBusy || profileBusy; node(kr,'refresh').disabled = kpiBusy; }
  function clear() {
    generation++; photoSeq++; profileVersion = null; canEdit = false; photo = null;
    node(pr,'form').reset(); node(pr,'avatar').src = './logo.png';
    node(kr,'metrics').replaceChildren();
    [kr,pr].forEach(root => { node(root,'identity').textContent = ''; status(root,'Sesi berubah. Muat ulang data akun aktif.'); }); controls();
  }
  function owned(data,user) { if (!validId(user?.id) || !validId(data?.employee?.id) || String(data.employee.id) !== String(user.id)) throw new Error('Identitas pemilik data tidak cocok. Data tidak ditampilkan.'); }
  async function api(path,method='GET',body) {
    const response = await fetch(path,{method,...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
    let data; try { data = await response.json(); } catch (_) { throw new Error('Respons server tidak valid.'); }
    if (!response.ok) throw new Error([404,501].includes(response.status) ? 'Endpoint belum tersedia. Integrasikan backend Apps Script terlebih dahulu.' : (data?.detail || 'Permintaan gagal (' + response.status + ').'));
    return data;
  }
  async function loadKpi() {
    const user = current(); if (!validId(user?.id) || kpiBusy) return;
    kpiBusy = true; controls(); const g = generation; node(kr,'metrics').replaceChildren(); status(kr,'Memuat KPI pribadi...');
    try {
      const data = await api('/api/kpi/me'); if (!same(g,user.id)) return; owned(data,user);
      if (!Array.isArray(data.metrics) || typeof data.period !== 'string') throw new Error('Format KPI pribadi belum sesuai.');
      const cards = data.metrics.map(metric => {
        if (typeof metric.label !== 'string' || typeof metric.value !== 'number' || !Number.isFinite(metric.value)) throw new Error('Metrik KPI tidak valid.');
        const card = document.createElement('section'); card.className = 'metric';
        const label = document.createElement('span'); label.textContent = metric.label;
        const value = document.createElement('span'); value.className = 'value'; value.textContent = String(metric.value) + (typeof metric.unit === 'string' ? ' ' + metric.unit : ''); card.append(label,value); return card;
      });
      node(kr,'identity').textContent = data.employee.name + ' · Periode: ' + data.period; node(kr,'metrics').replaceChildren(...cards);
      status(kr,cards.length ? 'Hanya KPI akun aktif. Tidak ada leaderboard atau data karyawan lain.' : 'Belum ada penilaian pada periode ini.');
    } catch (error) { if (same(g,user.id)) status(kr,error.message); }
    finally { kpiBusy = false; controls(); }
  }
  async function loadProfile() {
    const user = current(); if (!validId(user?.id) || saving || photoBusy || profileBusy) return;
    profileBusy = true; canEdit = false; photo = null; photoSeq++; node(pr,'form').reset(); node(pr,'avatar').src = './logo.png'; controls(); const g = generation; status(pr,'Memuat profil...');
    try {
      const data = await api('/api/profile/me'); if (!same(g,user.id)) return; owned(data,user);
      const e = data.employee;
      ['name','email','phone','address'].forEach(key => node(pr,key).value = typeof e[key] === 'string' ? e[key] : '');
      node(pr,'identity').textContent = [e.nip,e.division,e.role].filter(value => typeof value === 'string').join(' · ');
      node(pr,'avatar').src = safeImage(e.avatar_url || './logo.png');
      profileVersion = data.version; canEdit = data.can_edit === true && (typeof data.version === 'string' || Number.isFinite(data.version));
      status(pr,canEdit ? 'Profil tervalidasi. Foto baru hanya menjadi pratinjau sampai disimpan ke server.' : 'Profil hanya-baca; server belum mengizinkan perubahan.');
    } catch (error) { if (same(g,user.id)) status(pr,error.message); }
    finally { profileBusy = false; controls(); }
  }
  node(pr,'photo').addEventListener('change',async () => {
    const file = node(pr,'photo').files[0]; const seq = ++photoSeq, g = generation; photo = null;
    if (!file) return; photoBusy = true; controls();
    try {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2*1024*1024) throw new Error('Pilih JPEG, PNG, atau WebP maksimal 2 MB.');
      const bitmap = await createImageBitmap(file);
      try {
        if (!bitmap.width || !bitmap.height || bitmap.width > 6000 || bitmap.height > 6000) throw new Error('Dimensi gambar tidak didukung.');
        const scale = Math.min(1,512/Math.max(bitmap.width,bitmap.height));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(bitmap.width*scale)); canvas.height = Math.max(1,Math.round(bitmap.height*scale));
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        const preview = canvas.toDataURL('image/jpeg',.85);
        if (preview.length > 1000000) throw new Error('Foto hasil konversi terlalu besar.');
        if (g !== generation || seq !== photoSeq) return;
        photo = {mime:'image/jpeg',data:preview.split(',')[1]}; node(pr,'avatar').src = preview; status(pr,'Pratinjau foto siap. Klik Simpan profil untuk menyimpan ke server.');
      } finally { bitmap.close(); }
    } catch (error) { if (g === generation && seq === photoSeq) { node(pr,'photo').value = ''; status(pr,error.message); } }
    finally { photoBusy = false; controls(); }
  });
  node(pr,'form').addEventListener('submit',async event => {
    event.preventDefault(); const user = current(); if (!canEdit || saving || photoBusy || !validId(user?.id)) return;
    const body = {expected_version:profileVersion};
    ['name','email','phone','address'].forEach(key => body[key] = node(pr,key).value.trim());
    if (!body.name || !body.email) return status(pr,'Nama dan email wajib diisi.');
    if (photo) body.avatar = photo;
    if (!confirm('Simpan perubahan data diri' + (photo ? ' dan foto profil' : '') + ' ke server?')) return;
    saving = true; controls(); const g = generation; status(pr,'Menyimpan profil...');
    try {
      const data = await api('/api/profile/me','PATCH',body); if (!same(g,user.id)) return; owned(data,user);
      if (data.status !== 'success') throw new Error('Server belum mengonfirmasi penyimpanan.');
      canEdit = false; photo = null; node(pr,'photo').value = '';
      const e = data.employee;
      if (typeof e.name !== 'string' || typeof e.avatar_url !== 'string') throw new Error('Respons profil tersimpan tidak lengkap. Muat ulang profil untuk memastikan.');
      const fields = {name:e.name,avatar_url:safeImage(e.avatar_url)};
      if (typeof setCurrentUser === 'function') setCurrentUser({...AppState.currentUser,...fields});
      if (Array.isArray(AppState.employees)) {
        AppState.employees = AppState.employees.map(record => String(record.id) === String(user.id) ? {...record,...fields,email:body.email,phone:body.phone,address:body.address} : record);
        if (typeof canAccessView === 'function' && canAccessView('employees') && typeof renderEmployeesTable === 'function') renderEmployeesTable(AppState.employees);
      }
      node(pr,'avatar').src = fields.avatar_url; status(pr,'Profil tersimpan di server. Klik Muat ulang profil sebelum perubahan berikutnya.');
    } catch (error) { if (same(g,user.id)) { canEdit = false; status(pr,error.message + ' Muat ulang profil untuk memastikan hasil sebelum mencoba lagi.'); } }
    finally { saving = false; controls(); }
  });
  const item = document.createElement('li'), link = document.createElement('a');
  link.className = 'nav-item'; link.dataset.view = 'profile'; link.href = '#profile'; link.textContent = 'Profil Saya'; item.append(link); menu.append(item);
  function open(view) {
    if (!current()) return; switchView(view);
    if (!document.getElementById('view-'+view)?.classList.contains('active')) return;
    document.getElementById('page-title').textContent = view === 'kpi' ? 'Analisis KPI Saya' : 'Profil Saya';
    document.getElementById('page-subtitle').textContent = view === 'kpi' ? 'Analisis kinerja akun yang sedang login' : 'Data diri dan foto karyawan';
    if (view === 'kpi') loadKpi(); else loadProfile();
  }
  [link,document.querySelector('.nav-item[data-view="kpi"]')].filter(Boolean).forEach(nav => nav.addEventListener('click',event => { event.preventDefault(); event.stopImmediatePropagation(); open(nav.dataset.view); },true));
  node(kr,'refresh').addEventListener('click',loadKpi); node(pr,'refresh').addEventListener('click',loadProfile);
  const gate = document.getElementById('auth-gate-screen');
  function visibility() { item.style.display = current() ? '' : 'none'; if (!current()) clear(); }
  if (gate) new MutationObserver(visibility).observe(gate,{attributes:true,attributeFilter:['class']});
  window.addEventListener('td-session-expired',clear);
  window.addEventListener('storage',event => { if (event.key === 'td_token' || event.key === null) { clear(); item.style.display = 'none'; } });
  [kpi,profile].forEach(panel => new MutationObserver(() => { if (panel.classList.contains('active') && current()) { document.getElementById('page-title').textContent = panel === kpi ? 'Analisis KPI Saya' : 'Profil Saya'; } }).observe(panel,{attributes:true,attributeFilter:['class']}));
  clear(); visibility(); if (kpi.classList.contains('active') && current()) loadKpi();
})();
