(() => {
  'use strict';
  const root = window.TDLeaveRoot || document;
  if (root.__tdLeaveMounted) return;
  const el = id => root.getElementById(id);
  if (!el('leave-form')) return;
  let ready = false, busy = false, loading = false, generation = 0;
  let key = '', draft = '';
  const labels = {pending:'Menunggu',approved:'Disetujui',rejected:'Ditolak',cancelled:'Dibatalkan',cuti:'Cuti',izin:'Izin',sakit:'Sakit'};
  const text = value => value == null ? '—' : String(value);
  const active = () => !document.hidden && (!root.host || root.host.closest('.view-panel')?.classList.contains('active'));
  function notice(message, kind = '') { el('notice').textContent = message; el('notice').dataset.kind = kind; }
  function controls() { el('request-fields').disabled = !ready || busy || loading; el('refresh').disabled = busy || loading; }
  function clear() {
    generation++; ready = false; controls();
    ['entitlement','used','remaining'].forEach(id => el(id).textContent = '—');
    el('identity').textContent = 'Sesi belum tervalidasi'; el('period').textContent = 'Periode: belum tersedia';
    el('history').replaceChildren(); el('pending').replaceChildren(); el('review-panel').hidden = true;
    el('leave-form').reset(); key = ''; draft = '';
  }
  async function api(path, method = 'GET', body) {
    const response = await fetch(path, {method, ...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
    let data; try { data = await response.json(); } catch (_) { throw new Error('Respons server tidak valid.'); }
    if (!response.ok) {
      if (response.status === 401) { clear(); throw new Error('Sesi berakhir. Login kembali.'); }
      if ([404,501].includes(response.status)) throw new Error('Backend Cuti & Izin belum tersedia.');
      throw new Error(data?.detail || data?.message || 'Permintaan gagal (' + response.status + ').');
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
    if (busy || loading) return;
    loading = true; ready = false; controls(); const g = ++generation; notice('Memuat data dari server...');
    try {
      const data = await api('/api/leave/me'); if (g !== generation) return;
      const b = data?.balance;
      if (!data?.employee || !Array.isArray(data.requests) || b !== null && (!b || typeof b.period !== 'string' || !['entitlement','used','remaining'].every(k => typeof b[k] === 'number' && Number.isFinite(b[k])))) throw new Error('Format data cuti tidak valid.');
      el('identity').textContent = text(data.employee.name);
      ['entitlement','used','remaining'].forEach(id => el(id).textContent = b ? String(b[id]) : '—');
      el('period').textContent = 'Periode: ' + (b ? b.period : 'belum dikonfigurasi');
      render(data.requests); ready = data.can_submit === true;
      notice(b ? 'Data diperbarui ' + new Date().toLocaleTimeString('id-ID') : 'Hak cuti belum dikonfigurasi; saldo tidak diasumsikan nol.');
      el('review-panel').hidden = data.can_review !== true; el('pending').replaceChildren();
      if (data.can_review === true) {
        el('review-status').textContent = 'Memuat antrean...';
        try {
          const queue = await api('/api/leave/pending'); if (g !== generation) return;
          if (!Array.isArray(queue?.requests)) throw new Error('Format antrean tidak valid.');
          render(queue.requests, true); el('review-status').textContent = '';
        } catch (error) { if (g === generation) el('review-status').textContent = error.message; }
      }
    } catch (error) { if (g === generation) { clear(); notice(error.message, 'error'); } }
    finally { loading = false; controls(); }
  }
  async function review(r, decision) {
    if (busy || loading || el('review-panel').hidden) return;
    const note = prompt(decision === 'approved' ? 'Catatan persetujuan (opsional):' : 'Alasan penolakan (wajib):', '');
    if (note === null || decision === 'rejected' && !note.trim()) return;
    if (!confirm((decision === 'approved' ? 'Setujui' : 'Tolak') + ' pengajuan ' + text(r.employee_name) + ' (' + text(r.start_date) + ' s.d. ' + text(r.end_date) + ')?')) return;
    busy = true; controls(); el('pending').querySelectorAll('button').forEach(b => b.disabled = true); const g = generation;
    try {
      const result = await api('/api/leave/requests/' + encodeURIComponent(r.id) + '/decision', 'POST', {decision,note:note.trim(),expected_version:r.version});
      if (result?.status !== 'success') throw new Error('Server belum mengonfirmasi keputusan.');
      if (g === generation) { busy = false; await refresh(); }
    } catch (error) { if (g === generation) notice(error.message + ' Muat ulang untuk memastikan status terakhir.', 'error'); }
    finally { busy = false; controls(); }
  }
  el('leave-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!ready || busy || loading) return;
    const body = {kind:el('kind').value,start_date:el('start').value,end_date:el('end').value,reason:el('reason').value.trim()};
    if (!body.start_date || !body.end_date || body.end_date < body.start_date || !body.reason) return notice('Lengkapi alasan dan periksa urutan tanggal.', 'error');
    const serialized = JSON.stringify(body);
    if (serialized !== draft) {
      if (!window.crypto?.randomUUID) return notice('Gunakan browser yang mendukung crypto.randomUUID melalui HTTPS.', 'error');
      key = crypto.randomUUID(); draft = serialized;
    }
    if (!confirm('Kirim pengajuan ' + body.kind + ' tanggal ' + body.start_date + ' s.d. ' + body.end_date + '?')) return;
    busy = true; controls(); const g = generation; notice('Mengirim pengajuan...');
    try {
      const result = await api('/api/leave/requests', 'POST', {...body,idempotency_key:key});
      if (result?.status !== 'success') throw new Error('Server belum mengonfirmasi pengajuan.');
      if (g !== generation) return;
      el('leave-form').reset(); key = ''; draft = ''; busy = false; await refresh();
    } catch (error) { if (g === generation) notice(error.message + ' Muat ulang riwayat sebelum mencoba kembali.', 'error'); }
    finally { busy = false; controls(); }
  });
  const hasDraft = () => !!(el('reason').value || el('start').value || el('end').value);
  el('refresh').addEventListener('click', refresh);
  window.addEventListener('td-leave-open', () => { if (!hasDraft()) refresh(); });
  window.addEventListener('td-session-expired', () => { clear(); notice('Sesi berakhir. Login kembali.', 'error'); });
  window.addEventListener('storage', event => { if (event.key === 'td_token' || event.key === null) { clear(); notice('Sesi berubah. Muat ulang data untuk validasi.', 'error'); } });
  const gate = document.getElementById('auth-gate-screen');
  if (gate) new MutationObserver(() => { if (!gate.classList.contains('hidden')) clear(); }).observe(gate, {attributes:true,attributeFilter:['class']});
  setInterval(() => { if (active() && (!gate || gate.classList.contains('hidden')) && !hasDraft()) refresh(); }, 60000);
  root.__tdLeaveMounted = true;
  if (!gate || gate.classList.contains('hidden')) refresh();
})();
