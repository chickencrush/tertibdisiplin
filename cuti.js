(() => {
  'use strict';
  const root = window.TDLeaveRoot || document;
  if (root.__tdLeaveMounted) return;
  const el = id => root.getElementById(id);
  if (!el('leave-form')) return;
  const gate = document.getElementById('auth-gate-screen');
  const labels = {pending:'Menunggu',approved:'Disetujui',rejected:'Ditolak',cancelled:'Dibatalkan',cuti:'Cuti',izin:'Izin',sakit:'Sakit'};
  const text = value => value == null ? '—' : String(value);
  const validId = value => ['string','number'].includes(typeof value) && String(value).trim() !== '';
  const active = () => !document.hidden && (!root.host || root.host.closest('.view-panel')?.classList.contains('active'));
  let ready = false, canReview = false, busy = false, loading = false, generation = 0;
  let session = '', rejectedToken = '', key = '', draft = '';
  function token() { try { return localStorage.getItem('td_token') || ''; } catch (_) { return ''; } }
  function sessionNow() {
    const t = token();
    if (!t || t === rejectedToken || gate && !gate.classList.contains('hidden')) return '';
    if (typeof AppState !== 'undefined') {
      if (!validId(AppState.currentUser?.id)) return '';
      return JSON.stringify([t,String(AppState.currentUser.id)]);
    }
    return JSON.stringify([t,'']);
  }
  function notice(message, kind = '') { el('notice').textContent = message; el('notice').dataset.kind = kind; }
  function clearData() {
    ready = false; canReview = false;
    ['entitlement','used','remaining'].forEach(id => el(id).textContent = '—');
    el('identity').textContent = 'Sesi belum tervalidasi'; el('period').textContent = 'Periode: belum tersedia';
    el('history').replaceChildren(); el('pending').replaceChildren(); el('review-panel').hidden = true;
    el('review-status').textContent = '';
  }
  function clearSession() {
    generation++; busy = false; loading = false; clearData();
    el('leave-form').reset(); key = ''; draft = '';
  }
  function syncSession() {
    const next = sessionNow();
    if (next !== session) { session = next; clearSession(); }
    return !!session;
  }
  function same(g,s) { return g === generation && s === session && s === sessionNow(); }
  function controls() {
    const signedIn = syncSession();
    // Mengisi draf tidak memerlukan izin submit; tombol kirim tetap menunggu server.
    el('request-fields').disabled = !signedIn || busy;
    el('submit').disabled = !signedIn || !ready || busy || loading;
    el('refresh').disabled = !signedIn || busy || loading;
    el('pending').querySelectorAll('button').forEach(button => { button.disabled = !signedIn || !canReview || busy || loading; });
  }
  function expire(message) {
    rejectedToken = token(); session = ''; clearSession(); controls();
    notice(message || 'Sesi berakhir. Login kembali.', 'error');
  }
  async function api(path, method = 'GET', body) {
    const response = await fetch(path, {method, ...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
    let data; try { data = await response.json(); } catch (_) { throw new Error('Respons server tidak valid.'); }
    if (!response.ok) {
      const message = response.status === 401 ? 'Sesi berakhir. Login kembali.' : [404,501].includes(response.status) ? 'Backend Cuti & Izin belum tersedia.' : data?.detail || data?.message || 'Permintaan gagal (' + response.status + ').';
      const error = new Error(message); error.httpStatus = response.status; throw error;
    }
    return data;
  }
  function cell(row, value) { const td = document.createElement('td'); td.textContent = text(value); row.append(td); return td; }
  function render(rows, pending = false) {
    const target = el(pending ? 'pending' : 'history'); target.replaceChildren();
    if (!rows.length) { const tr = document.createElement('tr'); cell(tr, pending ? 'Tidak ada pengajuan menunggu.' : 'Belum ada pengajuan.').colSpan = 5; target.append(tr); }
    rows.forEach(r => {
      const tr = document.createElement('tr');
      if (pending) {
        cell(tr, r.employee_name); cell(tr, (labels[r.kind] || r.kind) + ' / ' + text(r.start_date) + ' s.d. ' + text(r.end_date)); cell(tr, r.days); cell(tr, r.reason);
        const actions = cell(tr, '');
        if (r.status === 'pending' && r.id != null && r.version != null) ['approved','rejected'].forEach(decision => {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = decision === 'approved' ? 'Setujui' : 'Tolak';
          button.addEventListener('click', () => review(r, decision)); actions.append(button);
        });
      } else {
        cell(tr, labels[r.kind] || r.kind); cell(tr, text(r.start_date) + ' s.d. ' + text(r.end_date)); cell(tr, r.days); cell(tr, labels[r.status] || r.status); cell(tr, text(r.reason) + (r.review_note ? ' / ' + r.review_note : ''));
      }
      target.append(tr);
    });
  }
  async function refresh() {
    if (!syncSession()) { controls(); notice('Login untuk mengisi pengajuan.', 'error'); return; }
    if (busy || loading) return;
    loading = true; clearData(); controls(); const g = generation, s = session;
    notice('Memuat data server. Anda dapat mengisi draf; pengajuan belum dikirim.');
    try {
      const data = await api('/api/leave/me'); if (!same(g,s)) return;
      const b = data?.balance;
      if (!validId(data?.employee?.id) || !Array.isArray(data.requests) || b !== null && (!b || typeof b.period !== 'string' || !['entitlement','used','remaining'].every(k => typeof b[k] === 'number' && Number.isFinite(b[k])))) throw new Error('Format data cuti tidak valid.');
      if (typeof AppState !== 'undefined' && String(data.employee.id) !== String(AppState.currentUser?.id)) throw new Error('Identitas data cuti tidak sesuai akun aktif.');
      el('identity').textContent = text(data.employee.name);
      ['entitlement','used','remaining'].forEach(id => el(id).textContent = b ? String(b[id]) : '—');
      el('period').textContent = 'Periode: ' + (b ? b.period : 'belum dikonfigurasi');
      render(data.requests); ready = data.can_submit === true; canReview = data.can_review === true;
      const balanceNote = b ? 'Data diperbarui ' + new Date().toLocaleTimeString('id-ID') + '.' : 'Hak cuti belum dikonfigurasi; saldo tidak diasumsikan nol.';
      notice(balanceNote + (ready ? ' Formulir siap dikirim setelah dikonfirmasi.' : ' Anda dapat mengisi draf, tetapi server belum mengizinkan pengiriman.'));
      el('review-panel').hidden = !canReview;
      if (canReview) {
        el('review-status').textContent = 'Memuat antrean...';
        try {
          const queue = await api('/api/leave/pending'); if (!same(g,s)) return;
          if (!Array.isArray(queue?.requests)) throw new Error('Format antrean tidak valid.');
          render(queue.requests, true); el('review-status').textContent = '';
        } catch (error) {
          if (same(g,s)) {
            if (error.httpStatus === 401) { expire(); return; }
            canReview = false; el('pending').replaceChildren(); el('review-status').textContent = error.message;
          }
        }
      }
    } catch (error) {
      if (same(g,s)) {
        if (error.httpStatus === 401) { expire(); return; }
        // Kegagalan pemuatan bukan pergantian sesi: jangan menghapus isian atau key retry.
        clearData(); notice(error.message + ' Draf tetap dapat diisi dan belum dikirim. Muat ulang untuk memvalidasi izin kirim.', 'error');
      }
    } finally { if (same(g,s)) { loading = false; controls(); } else controls(); }
  }
  async function review(r, decision) {
    if (!syncSession() || !canReview || busy || loading || el('review-panel').hidden) return;
    const g = generation, s = session;
    const note = prompt(decision === 'approved' ? 'Catatan persetujuan (opsional):' : 'Alasan penolakan (wajib):', '');
    if (note === null || decision === 'rejected' && !note.trim()) return;
    if (!confirm((decision === 'approved' ? 'Setujui' : 'Tolak') + ' pengajuan ' + text(r.employee_name) + ' (' + text(r.start_date) + ' s.d. ' + text(r.end_date) + ')?') || !same(g,s)) return;
    busy = true; controls();
    try {
      const result = await api('/api/leave/requests/' + encodeURIComponent(r.id) + '/decision', 'POST', {decision,note:note.trim(),expected_version:r.version});
      if (!same(g,s)) return;
      if (result?.status !== 'success') throw new Error('Server belum mengonfirmasi keputusan.');
      busy = false; await refresh();
    } catch (error) {
      if (same(g,s)) {
        if (error.httpStatus === 401) { expire(); return; }
        canReview = false; notice(error.message + ' Muat ulang untuk memastikan status terakhir.', 'error');
      }
    } finally { if (same(g,s)) busy = false; controls(); }
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
  }
  el('leave-form').addEventListener('submit', async event => {
    event.preventDefault(); controls();
    if (!session || !ready || busy || loading) return;
    const g = generation, s = session;
    const body = {kind:el('kind').value,start_date:el('start').value,end_date:el('end').value,reason:el('reason').value.trim()};
    if (!['cuti','izin','sakit'].includes(body.kind) || !validDate(body.start_date) || !validDate(body.end_date) || body.end_date < body.start_date || !body.reason || body.reason.length > 2000) return notice('Lengkapi jenis, alasan maksimal 2000 karakter, dan periksa urutan tanggal.', 'error');
    const serialized = JSON.stringify(body);
    if (serialized !== draft || !key) {
      if (!window.crypto?.randomUUID) return notice('Gunakan browser yang mendukung crypto.randomUUID melalui HTTPS.', 'error');
      key = window.crypto.randomUUID(); draft = serialized;
    }
    if (!confirm('Kirim pengajuan ' + body.kind + ' tanggal ' + body.start_date + ' s.d. ' + body.end_date + '?') || !same(g,s)) return;
    busy = true; controls(); notice('Mengirim pengajuan...');
    try {
      const result = await api('/api/leave/requests', 'POST', {...body,idempotency_key:key});
      if (!same(g,s)) return;
      if (result?.status !== 'success' || !validId(result?.request?.id)) throw new Error('Server belum mengonfirmasi pengajuan dengan ID yang valid.');
      const requestId = String(result.request.id);
      el('leave-form').reset(); key = ''; draft = ''; busy = false; await refresh();
      if (same(g,s)) notice('Pengajuan ' + requestId + ' dikonfirmasi tersimpan oleh server. ' + el('notice').textContent);
    } catch (error) {
      if (same(g,s)) {
        if (error.httpStatus === 401) { expire(); return; }
        ready = false; notice(error.message + ' Isian dipertahankan. Muat ulang riwayat sebelum mencoba kembali; hasil pengiriman belum dapat dipastikan.', 'error');
      }
    } finally { if (same(g,s)) busy = false; controls(); }
  });
  const hasDraft = () => !!(el('reason').value || el('start').value || el('end').value || el('kind').value !== 'cuti');
  el('refresh').addEventListener('click', refresh);
  window.addEventListener('td-leave-open', refresh);
  window.addEventListener('td-session-expired', () => expire());
  window.addEventListener('storage', event => {
    if (event.key === 'td_token' || event.key === null) {
      session = ''; clearSession(); controls(); notice('Sesi berubah. Draf dibersihkan; muat ulang untuk validasi akun aktif.', 'error');
    }
  });
  if (gate) new MutationObserver(() => {
    if (!gate.classList.contains('hidden')) { session = ''; clearSession(); controls(); notice('Login kembali untuk mengisi pengajuan.', 'error'); }
    else { controls(); if (active() && session) refresh(); }
  }).observe(gate, {attributes:true,attributeFilter:['class']});
  setInterval(() => { controls(); if (active() && session && !hasDraft()) refresh(); }, 60000);
  root.__tdLeaveMounted = true;
  controls(); if (session) refresh(); else notice('Login untuk mengisi pengajuan. Draf belum dikirim ke server.');
})();
