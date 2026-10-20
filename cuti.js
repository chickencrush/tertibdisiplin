(() => {
  'use strict';
  const el = id => document.getElementById(id);
  let ready = false, busy = false, reviewing = false, loading = false;
  let generation = 0, key = '', draft = '';
  const labels = {pending:'Menunggu', approved:'Disetujui', rejected:'Ditolak', cancelled:'Dibatalkan', cuti:'Cuti', izin:'Izin', sakit:'Sakit'};
  const text = value => value == null ? '—' : String(value);
  function notice(message, kind = '') { el('notice').textContent = message; el('notice').dataset.kind = kind; }
  function controls() { el('request-fields').disabled = !ready || busy; el('refresh').disabled = loading || busy || reviewing; }
  function clearPrivate() {
    generation++; ready = false; controls();
    ['entitlement','used','remaining'].forEach(id => el(id).textContent = '—');
    el('period').textContent = 'Periode: belum tersedia';
    el('identity').textContent = 'Sesi belum tervalidasi';
    el('history').replaceChildren(); el('pending').replaceChildren();
    el('review-panel').hidden = true;
  }
  async function api(path, method = 'GET', body) {
    const res = await fetch(path, {method, ...(body ? {headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})});
    let data;
    try { data = await res.json(); } catch (_) { throw new Error('Respons server tidak valid.'); }
    if (!res.ok) {
      if (res.status === 401) { clearPrivate(); throw new Error('Sesi berakhir. Masuk kembali melalui aplikasi utama.'); }
      if (res.status === 404 || res.status === 501) throw new Error('Endpoint Cuti & Izin belum tersedia. Backend Apps Script perlu diintegrasikan.');
      throw new Error(data && (data.detail || data.message) || 'Permintaan gagal (' + res.status + ').');
    }
    return data;
  }
  function cell(row, value) { const td = document.createElement('td'); td.textContent = text(value); row.append(td); return td; }
  function empty(target, columns, message) { const tr = document.createElement('tr'); const td = cell(tr, message); td.colSpan = columns; target.append(tr); }
  function renderHistory(rows) {
    const target = el('history'); target.replaceChildren();
    if (!rows.length) return empty(target, 5, 'Belum ada pengajuan.');
    rows.forEach(r => {
      const tr = document.createElement('tr');
      cell(tr, labels[r.kind] || r.kind); cell(tr, text(r.start_date) + ' s.d. ' + text(r.end_date));
      cell(tr, r.days); cell(tr, labels[r.status] || r.status);
      cell(tr, text(r.reason) + (r.review_note ? ' / ' + r.review_note : '')); target.append(tr);
    });
  }
  async function loadPending(g) {
    el('pending').replaceChildren(); el('review-status').textContent = 'Memuat antrean...';
    try {
      const data = await api('/api/leave/pending');
      if (g !== generation) return;
      if (!data || !Array.isArray(data.requests)) throw new Error('Format antrean server tidak valid.');
      el('review-status').textContent = '';
      if (!data.requests.length) return empty(el('pending'), 5, 'Tidak ada pengajuan menunggu.');
      data.requests.forEach(r => {
        const tr = document.createElement('tr');
        cell(tr, r.employee_name); cell(tr, (labels[r.kind] || r.kind) + ' / ' + text(r.start_date) + ' s.d. ' + text(r.end_date));
        cell(tr, r.days); cell(tr, r.reason); const actions = cell(tr, '');
        if (r.status === 'pending' && r.id != null && r.version != null) ['approved','rejected'].forEach(decision => {
          const button = document.createElement('button'); button.type = 'button';
          button.textContent = decision === 'approved' ? 'Setujui' : 'Tolak';
          button.addEventListener('click', () => review(r, decision)); actions.append(button);
        });
        el('pending').append(tr);
      });
    } catch (error) { if (g === generation) el('review-status').textContent = error.message; }
  }
  async function refresh() {
    if (loading || busy || reviewing) return;
    loading = true; clearPrivate(); controls(); const g = generation;
    notice('Memvalidasi sesi dan memuat data...');
    try {
      const data = await api('/api/leave/me');
      if (g !== generation) return;
      const b = data && data.balance;
      if (!data || !data.employee || !Array.isArray(data.requests)) throw new Error('Format data Cuti & Izin tidak valid.');
      if (b !== null && (!b || !['entitlement','used','remaining'].every(k => typeof b[k] === 'number' && Number.isFinite(b[k])) || typeof b.period !== 'string')) throw new Error('Format saldo cuti tidak valid.');
      el('identity').textContent = text(data.employee.name);
      renderHistory(data.requests);
      if (b) {
        ['entitlement','used','remaining'].forEach(id => el(id).textContent = String(b[id]));
        el('period').textContent = 'Periode: ' + b.period;
      }
      ready = data.can_submit === true; controls();
      notice(b ? 'Data diperbarui dari server pada ' + new Date().toLocaleTimeString('id-ID') + '.' : 'Hak cuti belum dikonfigurasi. Saldo tidak diasumsikan nol.');
      el('review-panel').hidden = data.can_review !== true;
      if (data.can_review === true) await loadPending(g);
    } catch (error) { if (g === generation) { clearPrivate(); notice(error.message, 'error'); } }
    finally { loading = false; controls(); }
  }
  async function review(request, decision) {
    if (reviewing || busy || loading || !ready && el('review-panel').hidden) return;
    const note = prompt(decision === 'approved' ? 'Catatan persetujuan (opsional):' : 'Alasan penolakan (wajib):', '');
    if (note === null || decision === 'rejected' && !note.trim()) return;
    if (!confirm((decision === 'approved' ? 'Setujui' : 'Tolak') + ' pengajuan ' + text(request.employee_name) + ' (' + text(request.start_date) + ' s.d. ' + text(request.end_date) + ')?')) return;
    reviewing = true; controls();
    el('pending').querySelectorAll('button').forEach(b => b.disabled = true);
    const g = generation;
    try {
      const result = await api('/api/leave/requests/' + encodeURIComponent(request.id) + '/decision', 'POST', {decision, note:note.trim(), expected_version:request.version});
      if (!result || result.status !== 'success') throw new Error('Server tidak mengonfirmasi keputusan. Muat ulang sebelum mencoba lagi.');
      if (g === generation) { reviewing = false; await refresh(); }
    } catch (error) { if (g === generation) notice(error.message + ' Muat ulang untuk memastikan status terakhir.', 'error'); }
    finally { reviewing = false; controls(); }
  }
  el('leave-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!ready || busy || loading || reviewing) return;
    const body = {kind:el('kind').value, start_date:el('start').value, end_date:el('end').value, reason:el('reason').value.trim()};
    if (!body.start_date || !body.end_date || body.end_date < body.start_date || !body.reason) return notice('Lengkapi alasan dan pastikan tanggal selesai tidak sebelum tanggal mulai.', 'error');
    const nextDraft = JSON.stringify(body);
    if (nextDraft !== draft) {
      if (!window.crypto || !crypto.randomUUID) return notice('Browser perlu mendukung crypto.randomUUID melalui HTTPS untuk pengajuan aman.', 'error');
      key = crypto.randomUUID(); draft = nextDraft;
    }
    if (!confirm('Kirim pengajuan ' + body.kind + ' tanggal ' + body.start_date + ' s.d. ' + body.end_date + '?')) return;
    busy = true; controls(); const g = generation; notice('Mengirim pengajuan...');
    try {
      const result = await api('/api/leave/requests', 'POST', {...body, idempotency_key:key});
      if (!result || result.status !== 'success') throw new Error('Server belum mengonfirmasi pengajuan.');
      if (g !== generation) return;
      el('leave-form').reset(); key = ''; draft = ''; busy = false; await refresh();
    } catch (error) { if (g === generation) notice(error.message + ' Jika koneksi terputus, muat ulang riwayat sebelum mengirim ulang.', 'error'); }
    finally { busy = false; controls(); }
  });
  el('refresh').addEventListener('click', refresh);
  window.addEventListener('td-session-expired', () => { clearPrivate(); notice('Sesi berakhir. Login kembali melalui aplikasi utama.', 'error'); });
  window.addEventListener('storage', event => { if (event.key === 'td_token') { clearPrivate(); notice('Sesi berubah. Muat ulang untuk memvalidasi akun.', 'error'); } });
  setInterval(() => { if (!document.hidden && !el('reason').value && !el('start').value && !el('end').value) refresh(); }, 60000);
  refresh();
})();
