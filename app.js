const LOGO_URI = './icons/logo.png';
// Gambar rusak / kosong -> logo cadangan yang tertanam (tidak bergantung folder icons)
document.addEventListener('error', (ev) => {
  const t = ev.target;
  if (t && t.tagName === 'IMG' && !t.dataset.fb) { t.dataset.fb = '1'; t.src = window.LOGO_FALLBACK || LOGO_URI; }
}, true);
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img').forEach((im) => {
    if (im.complete && im.naturalWidth === 0 && !im.dataset.fb) { im.dataset.fb = '1'; im.src = window.LOGO_FALLBACK || LOGO_URI; }
  });
});

/**
 * TERTIB DISIPLIN - Main JavaScript Controller
 * Complete functionality for Management & Operational Crew Daily Report & HR Suite
 * v81: FLICKER FIX di Daily Report panel
 */

// Application State
const AppState = {
  currentView: 'dashboard',
  currentMode: 'Management',
  currentUser: null,
  employees: [],
  outlets: [],
  dailyReports: [],
  attendanceLogs: [],
  payslips: [],
  kpiSummary: null,
  kpiDivisionStats: [],
  saUsers: [],
  saOverview: null,
  leaveRequests: [],
  activeChatChannel: '#general',
  selectedPayslipForPin: null,
  deviceCoordinates: { lat: 0, lon: 0 },
  gpsOk: false,
  gpsLoading: false,
  gpsLastError: '',
  gpsAccuracy: 0,
  isMockSuspect: 0,
  gpsReadings: [],
  cameraStream: null,
  cameraReady: false,
  cameraLoading: false,
  deferredPwaPrompt: null,
  outletsLoadError: ''
};
window.AppState = AppState;

// Formatting Utilities
const formatRupiah = (val) => {
  if (val === null || val === undefined || Number.isNaN(val)) return '••••••';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(val || 0);
};

const showToast = (message, type = 'info') => {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  let icon = 'ℹ️';
  let borderColor = 'rgba(255,255,255,0.08)';
  if (type === 'success') { icon = '✅'; borderColor = 'rgba(16, 185, 129, 0.4)'; }
  if (type === 'error') { icon = '❌'; borderColor = 'rgba(239, 68, 68, 0.4)'; }
  if (type === 'warning') { icon = '⚠️'; borderColor = 'rgba(245, 158, 11, 0.4)'; }
  toast.style.borderLeft = `4px solid ${borderColor}`;
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

// === MODERN UI HELPERS ===
const animateCountUp = (el, target, duration = 800) => {
  if (!el) return;
  const start = 0;
  const startTime = performance.now();
  const isPercent = String(target).indexOf('%') >= 0;
  const isDecimal = String(target).indexOf('.') >= 0 && !isPercent;
  const numericTarget = parseFloat(String(target).replace(/[^\d.-]/g, '')) || 0;
  const suffix = isPercent ? '%' : '';
  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = start + (numericTarget - start) * eased;
    if (isDecimal) {
      el.textContent = value.toFixed(1) + suffix;
    } else {
      el.textContent = Math.round(value).toLocaleString('id-ID') + suffix;
    }
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = (isDecimal ? numericTarget.toFixed(1) : numericTarget.toLocaleString('id-ID')) + suffix;
  };
  requestAnimationFrame(step);
};

// v81: Debounced feather.replace — batch multiple calls jadi satu scan di next frame.
let __featherReplaceScheduled_ = false;
const debouncedFeatherReplace = () => {
  if (__featherReplaceScheduled_) return;
  __featherReplaceScheduled_ = true;
  requestAnimationFrame(() => {
    __featherReplaceScheduled_ = false;
    if (window.feather) {
      try { window.feather.replace(); } catch (e) { /* abaikan */ }
    }
  });
};
window.debouncedFeatherReplace = debouncedFeatherReplace;

const animateStatCards = () => {
  setTimeout(() => {
    document.querySelectorAll('.stat-main-number').forEach((el, idx) => {
      if (el.dataset.animated === '1') return;
      el.dataset.animated = '1';
      const text = el.textContent || '';
      const match = text.match(/[\d.,]+%?/);
      if (match) {
        const target = match[0];
        const suffix = text.substring(text.indexOf(target) + target.length);
        setTimeout(() => {
          animateCountUp(el, target, 700);
          if (suffix) setTimeout(() => {
            const currentText = el.textContent;
            if (currentText && !currentText.includes(suffix)) {
              el.innerHTML = currentText + ' <span style="font-size:14px; color:#94a3b8;">' + suffix + '</span>';
            }
          }, 750);
        }, idx * 80);
      }
    });
  }, 200);
};

const staggerViewCards = (view) => {
  if (!view) return;
  if (view.dataset.staggered === '1') return;
  view.dataset.staggered = '1';
  const cards = view.querySelectorAll('.modern-card, .stat-card');
  cards.forEach((card, idx) => {
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = `fadeInUp 0.5s var(--ease-smooth) ${idx * 0.05}s backwards`;
  });
};

// ==========================================
// Hak akses panel per divisi
// ==========================================
const FULL_ACCESS_DIVISIONS = ['OM', 'PCD'];
const PAYROLL_DIVISIONS = ['PCD'];
const LEAVE_APPROVER_DIVISIONS = ['PCD'];
const SUPER_ADMIN_ROLE = 'SUPER ADMIN';
const isSuperAdminUser = (user = AppState.currentUser) =>
  !!user && String(user.role || '').trim().toUpperCase() === SUPER_ADMIN_ROLE;
const isFullAccess = (user = AppState.currentUser) => isSuperAdminUser(user);

const MANAGEMENT_DIVISIONS = ['HRD', 'BM', 'Finance', 'QC', 'Creative', 'DOS', 'Logistik', 'Produksi', 'Driver', 'HRGA', 'Security', 'OM', 'PCD'];
const OPERASIONAL_DIVISIONS = ['SPV', 'Head Kitchen', 'Head Bar', 'Kasir', 'Server', 'Kitchen', 'Bar', 'PA', 'CS'];

const isGeofenceExemptUser_ = () => {
  const u = AppState.currentUser;
  if (!u) return false;
  if (MANAGEMENT_DIVISIONS.indexOf(u.division) >= 0) return true;
  if (Number(u.geofence_exempt) === 1) return true;
  return false;
};
window.isGeofenceExemptUser_ = isGeofenceExemptUser_;

const SHIFT_OPTIONS_MANAGEMENT = [
  { value: 'Shift Management', label: 'Shift Management (08:30 - 16:30)' },
  { value: 'Shift Security', label: 'Shift Security (07:00 - 19:00)' }
];
const SHIFT_OPTIONS_OPERASIONAL = [
  { value: 'Shift Pagi', label: 'Shift Pagi (07:00 - 15:00)' },
  { value: 'Shift Middle', label: 'Shift Middle (12:00 - 20:00)' },
  { value: 'Shift Sore', label: 'Shift Sore (15:00 - 23:00)' },
  { value: 'Shift Malam', label: 'Shift Malam (00:00 - 08:00)' }
];
const SHIFT_OPTIONS_SCH = [
  { value: 'Shift SCH Reguler A', label: 'SCH Reguler A (09:00 - 17:00) — Senin/Rabu/Kamis/Sabtu/Minggu' },
  { value: 'Shift SCH Reguler B', label: 'SCH Reguler B (08:00 - 16:00) — Selasa/Jumat' },
  { value: 'Shift SCH Middle',    label: 'SCH Middle (13:00 - 21:00)' },
  { value: 'Shift SCH 2 Tetap',   label: 'SCH 2 Tetap (14:30 - 22:30)' }
];
const SHIFT_OPTIONS_UII = [
  { value: 'Shift UII 1', label: 'UII Shift 1 (08:00 - 16:00) — Pagi' },
  { value: 'Shift UII 2', label: 'UII Shift 2 (16:00 - 24:00) — Sore/Malam' },
  { value: 'Shift UII 3', label: 'UII Shift 3 (00:00 - 08:00) — Malam/Dini Hari' }
];
const SCH_REGULER_A_DAYS = [1, 3, 4, 6, 0];
const SCH_REGULER_B_DAYS = [2, 5];

const outletTokenMatch_ = (str, token) => {
  if (!str) return false;
  const s = String(str).toUpperCase().trim();
  if (s === token) return true;
  if (s.indexOf(token) === 0) return true;
  const re = new RegExp('(^|\\s|_|-|\\.)(' + token + ')(\\s|$|_|-|\\.)');
  return re.test(s);
};

const isSchOutletUser_ = () => {
  const u = AppState.currentUser;
  if (!u) return false;
  const outlets = AppState.outlets || [];
  const o = outlets.find(x => x.id === u.outlet_id);
  if (o && o.code && outletTokenMatch_(o.code, 'SCH')) return true;
  if (o && o.name && outletTokenMatch_(o.name, 'SCH')) return true;
  if (u.outlet_name && outletTokenMatch_(u.outlet_name, 'SCH')) return true;
  return false;
};

const isUiiOutletUser_ = () => {
  const u = AppState.currentUser;
  if (!u) return false;
  const outlets = AppState.outlets || [];
  const o = outlets.find(x => x.id === u.outlet_id);
  if (o && o.code && outletTokenMatch_(o.code, 'UII')) return true;
  if (o && o.name && outletTokenMatch_(o.name, 'UII')) return true;
  if (u.outlet_name && outletTokenMatch_(u.outlet_name, 'UII')) return true;
  return false;
};

const pickDefaultSchShift_ = () => {
  const today = new Date().getDay();
  if (SCH_REGULER_A_DAYS.indexOf(today) >= 0) return 'Shift SCH Reguler A';
  if (SCH_REGULER_B_DAYS.indexOf(today) >= 0) return 'Shift SCH Reguler B';
  return 'Shift SCH Reguler A';
};

window.populateShiftOptions = () => {
  const shiftSelect = document.getElementById('presensi-shift-select');
  if (!shiftSelect) return;
  const div = AppState.currentUser ? AppState.currentUser.division : '';
  let opts;
  if (MANAGEMENT_DIVISIONS.indexOf(div) >= 0) opts = SHIFT_OPTIONS_MANAGEMENT.slice();
  else if (OPERASIONAL_DIVISIONS.indexOf(div) >= 0) opts = SHIFT_OPTIONS_OPERASIONAL.slice();
  else opts = SHIFT_OPTIONS_MANAGEMENT.concat(SHIFT_OPTIONS_OPERASIONAL);
  const isSch = isSchOutletUser_();
  const isUii = isUiiOutletUser_();
  if (isSch) opts = SHIFT_OPTIONS_SCH.concat(opts);
  if (isUii) opts = SHIFT_OPTIONS_UII.concat(opts);
  const prev = shiftSelect.value;
  shiftSelect.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  if (prev && opts.some(o => o.value === prev)) {
    shiftSelect.value = prev;
  } else if (isSch) {
    shiftSelect.value = pickDefaultSchShift_();
  } else if (isUii) {
    shiftSelect.value = 'Shift UII 1';
  }
};
const populateShiftOptions = window.populateShiftOptions;

const VIEW_ACCESS = {
  'dashboard': 'all',
  'presensi': 'all',
  'daily-report': 'all',
  'payroll': 'all',
  'kpi': 'all',
  'chat': 'all',
  'calendar': 'all',
  'leaves': 'all',
  'profile': 'all',
  'employees': 'superadmin',
  'data-center': ['PCD'],
  'outlets': 'superadmin',
  'superadmin': 'superadmin'
};
const CHAT_CHANNEL_RULES = {
  '#general': null,
  '#management': { type: 'Management' },
  '#kitchen-bar': { divisions: ['Head Kitchen', 'Head Bar', 'Kitchen', 'Bar', 'SPV', 'QC'] },
  '#service-crew': { divisions: ['SPV', 'Kasir', 'Server', 'PA', 'CS', 'BM'] },
  '#logistik': { divisions: ['Logistik', 'Driver', 'Produksi', 'Security', 'HRGA', 'Finance'] }
};

const isPayrollAdmin = (user = AppState.currentUser) => isSuperAdminUser(user);
const canAccessView = (view, user = AppState.currentUser) => {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const rule = VIEW_ACCESS[view];
  if (!rule) return false;
  if (rule === 'all') return true;
  if (rule === 'superadmin') return false;
  return Array.isArray(rule) && rule.includes(user.division);
};
const canAccessChannel = (channel, user = AppState.currentUser) => {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  if (!Object.prototype.hasOwnProperty.call(CHAT_CHANNEL_RULES, channel)) return false;
  const rule = CHAT_CHANNEL_RULES[channel];
  if (!rule) return true;
  if (rule.type && user.type === rule.type) return true;
  return !!(rule.divisions && rule.divisions.includes(user.division));
};

const applyAccessControl = () => {
  const user = AppState.currentUser;
  if (!user) return;
  document.querySelectorAll('.nav-item').forEach(item => {
    const allowed = canAccessView(item.getAttribute('data-view'));
    const li = item.closest('li') || item;
    li.style.display = allowed ? '' : 'none';
  });
  const modeSwitcher = document.querySelector('.mode-switcher-container');
  if (modeSwitcher) modeSwitcher.style.display = isSuperAdminUser(user) ? '' : 'none';
  AppState.currentMode = user.type === 'Management' ? 'Management' : 'Operasional';
  const bm = document.getElementById('btn-mode-management');
  const bo = document.getElementById('btn-mode-operasional');
  if (bm) bm.classList.toggle('active', AppState.currentMode === 'Management');
  if (bo) bo.classList.toggle('active', AppState.currentMode === 'Operasional');
  document.querySelectorAll('.payroll-admin-only').forEach(el => {
    el.style.display = isPayrollAdmin(user) ? '' : 'none';
  });
  document.querySelectorAll('.chat-channel-item').forEach(el => {
    const m = /switchChatChannel\('([^']+)'/.exec(el.getAttribute('onclick') || '');
    el.style.display = (m ? canAccessChannel(m[1]) : true) ? '' : 'none';
  });
  document.body.dataset.access = isSuperAdminUser(user) ? 'super' : 'staff';
};

// ==========================================
// Sidebar
// ==========================================
const setSidebarOpen = (open) => {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  if (!sb) return;
  const isOpen = sb.classList.contains('open');
  if (isOpen === open) return;
  sb.classList.toggle('open', open);
  if (bd) bd.classList.toggle('show', open);
  document.body.classList.toggle('sidebar-locked', open);
  const btn = document.getElementById('btn-toggle-sidebar');
  if (btn) btn.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
};
const isMobileLayout = () => window.innerWidth <= 768;
const setSidebarCollapsed = (collapsed) => {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  try { localStorage.setItem('td_sidebar_collapsed', collapsed ? '1' : '0'); } catch (e) { /* abaikan */ }
  const btn = document.getElementById('btn-toggle-sidebar');
  if (btn) btn.setAttribute('aria-label', collapsed ? 'Tampilkan menu' : 'Sembunyikan menu');
};
const initSidebarToggle = () => {
  const btn = document.getElementById('btn-toggle-sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  const sb = document.getElementById('sidebar');
  let saved = null;
  try { saved = localStorage.getItem('td_sidebar_collapsed'); } catch (e) { /* abaikan */ }
  if (saved === '1' && !isMobileLayout()) setSidebarCollapsed(true);
  if (btn) btn.addEventListener('click', () => {
    if (isMobileLayout()) setSidebarOpen(!sb.classList.contains('open'));
    else setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
  });
  if (bd) bd.addEventListener('click', () => setSidebarOpen(false));
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') setSidebarOpen(false); });
  window.addEventListener('resize', () => { if (!isMobileLayout()) setSidebarOpen(false); });
};

const showLoginError = (msg) => {
  const box = document.getElementById('auth-login-error');
  if (!box) return;
  box.textContent = msg || '';
  box.style.display = msg ? 'block' : 'none';
};

const loadAllAppData = async () => {
  applyAccessControl();
  const criticalJobs = [
    loadOutlets(),
    loadDailyReports(),
    loadAttendanceLogs()
  ];
  const backgroundJobs = [loadPayslips(), loadCalendarEvents()];
  if (canAccessView('employees')) criticalJobs.push(loadEmployees());
  if (canAccessView('kpi')) backgroundJobs.push(loadKpiSummary());
  backgroundJobs.push(loadLeaveBalance());
  backgroundJobs.push(loadLeaveRequests());
  await Promise.all(criticalJobs);
  populateRegisterOutlets();
  populateGlobalOutletFilter && populateGlobalOutletFilter();
  populateGlobalPeriodFilter && populateGlobalPeriodFilter();
  populateDivisionDropdowns();
  switchView('dashboard');
  updateDashboardStats && updateDashboardStats();
  if (window.feather) feather.replace();
  Promise.all(backgroundJobs).then(() => {
    updateDashboardStats && updateDashboardStats();
    if (window.feather) feather.replace();
  }).catch(err => console.warn('Background load error:', err));
};

const initAuthSession = () => {
  const savedUserStr = localStorage.getItem('tertib_disiplin_auth_user');
  const authScreen = document.getElementById('auth-gate-screen');
  if (savedUserStr && localStorage.getItem('td_token')) {
    try {
      const user = JSON.parse(savedUserStr);
      AppState.currentUser = user;
      setCurrentUser(user);
      if (authScreen) authScreen.classList.add('hidden');
      if (user && user.id) {
        fetch('/api/auth/me').then(r => {
          if (r.status === 401) {
            console.warn('Token expired/invalid (401 dari /api/auth/me). Clearing session, showing login screen (NO reload).');
            try { localStorage.removeItem('td_token'); } catch (e) { /* ignore */ }
            try { localStorage.removeItem('tertib_disiplin_auth_user'); } catch (e) { /* ignore */ }
            AppState.currentUser = null;
            const authScreen = document.getElementById('auth-gate-screen');
            if (authScreen) authScreen.classList.remove('hidden');
            return null;
          }
          return r.ok ? r.json() : null;
        }).then(freshUser => {
          if (freshUser && freshUser.id) {
            AppState.currentUser = freshUser;
            try { localStorage.setItem('tertib_disiplin_auth_user', JSON.stringify(freshUser)); } catch (e) { /* abaikan */ }
            if (typeof applyAccessControl === 'function') applyAccessControl();
            const nameEl = document.getElementById('current-user-name');
            if (nameEl) nameEl.textContent = freshUser.name;
          }
        }).catch(err => {
          console.warn('Re-fetch /api/auth/me gagal:', err);
        });
      }
      return true;
    } catch (e) {
      localStorage.removeItem('tertib_disiplin_auth_user');
    }
  }
  if (authScreen) authScreen.classList.remove('hidden');
  return false;
};

const switchAuthTab = (tab) => {
  if (tab === 'register') {
    toggleRegisterForm(true);
  } else {
    toggleRegisterForm(false);
  }
};

window.toggleRegisterForm = (show) => {
  const wrapper = document.getElementById('auth-register-wrapper');
  const toggleBtn = document.getElementById('btn-show-register');
  if (!wrapper) return;
  if (show) {
    wrapper.classList.add('open');
    wrapper.setAttribute('aria-hidden', 'false');
    if (toggleBtn) toggleBtn.style.display = 'none';
    try {
      syncRegisterDivisions(document.getElementById('reg-type').value || 'Operasional');
      populateRegisterOutlets();
    } catch (e) { /* ignored */ }
    setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    if (window.feather) feather.replace();
  } else {
    wrapper.classList.remove('open');
    wrapper.setAttribute('aria-hidden', 'true');
    if (toggleBtn) toggleBtn.style.display = '';
  }
};

const quickFillLogin = (nip, password) => { return; };

const togglePasswordVisibility = (fieldId, btn) => {
  const field = document.getElementById(fieldId);
  if (!field) return;
  if (field.type === 'password') {
    field.type = 'text';
    btn.innerHTML = '<i data-feather="eye-off" style="width:16px; height:16px;"></i>';
  } else {
    field.type = 'password';
    btn.innerHTML = '<i data-feather="eye" style="width:16px; height:16px;"></i>';
  }
  if (window.feather) feather.replace();
};

const handleAuthLogin = async (e) => {
  e.preventDefault();
  showLoginError('');
  const ident = document.getElementById('login-identifier').value.trim();
  const pwd = document.getElementById('login-password').value;
  const submitBtn = document.getElementById('btn-login-submit');
  if (!ident || !pwd) {
    showLoginError('NIP/Email dan password wajib diisi.');
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Memverifikasi...';
  const slowHint = setTimeout(() => { submitBtn.textContent = 'Menghubungi server, mohon tunggu...'; }, 4000);
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: ident, password: pwd })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      document.getElementById('login-password').value = '';
      setCurrentUser(data.user);
      document.getElementById('auth-gate-screen').classList.add('hidden');
      showToast(data.message, 'success');
      await loadAllAppData();
      window.checkBackendVersion && window.checkBackendVersion();
      window.updateTopbarInstallButton && window.updateTopbarInstallButton();
      window.maybeAutoOpenInstallModal && window.maybeAutoOpenInstallModal();
    } else {
      const msg = data.detail || 'Login gagal. Periksa kembali NIP/Email dan password Anda.';
      showLoginError(msg);
      showToast(msg, 'error');
    }
  } catch (err) {
    const msg = 'Terjadi kesalahan koneksi saat login. Periksa internet lalu coba lagi.';
    showLoginError(msg);
    showToast(msg, 'error');
  } finally {
    clearTimeout(slowHint);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Masuk ke Sistem TERTIB DISIPLIN';
  }
};

const handleAuthRegister = async (e) => {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const nip = document.getElementById('reg-nip').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const type = document.getElementById('reg-type').value;
  const division = document.getElementById('reg-division').value;
  const role = document.getElementById('reg-role').value.trim();
  const outlet_id = document.getElementById('reg-outlet').value;
  const password = document.getElementById('reg-password').value;
  const pin_code = document.getElementById('reg-pincode').value.trim();
  const submitBtn = document.getElementById('btn-register-submit');
  if (!name || !nip || !email || !phone || !role) {
    showToast('Mohon lengkapi semua kolom wajib (Nama, NIP, Email, HP, Jabatan).', 'warning');
    return;
  }
  if (password.length < 8) {
    showToast('Password minimal 8 karakter untuk keamanan akun Anda.', 'warning');
    return;
  }
  if (pin_code.length !== 6 || !/^\d{6}$/.test(pin_code)) {
    showToast('PIN slip gaji harus 6 digit angka.', 'warning');
    return;
  }
  if (!outlet_id) {
    showToast('Pilih titik outlet terlebih dahulu. Jika kosong, hubungi admin untuk menambahkan outlet.', 'warning');
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Mendaftarkan akun...';
  const slowHint = setTimeout(() => { submitBtn.textContent = 'Menghubungi server, mohon tunggu...'; }, 4000);
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, nip, email, phone, type, division, role, outlet_id, password, pin_code })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      setCurrentUser(data.user);
      document.getElementById('auth-gate-screen').classList.add('hidden');
      showToast(data.message || `Pendaftaran berhasil! Selamat datang, ${name}.`, 'success');
      window.checkBackendVersion && window.checkBackendVersion();
      if (data.user.type === 'Management') {
        AppState.currentMode = 'Management';
        const btnMgmt = document.getElementById('btn-mode-management');
        const btnOps = document.getElementById('btn-mode-operasional');
        if (btnMgmt) btnMgmt.classList.add('active');
        if (btnOps) btnOps.classList.remove('active');
      } else {
        AppState.currentMode = 'Operasional';
        const btnMgmt = document.getElementById('btn-mode-management');
        const btnOps = document.getElementById('btn-mode-operasional');
        if (btnOps) btnOps.classList.add('active');
        if (btnMgmt) btnMgmt.classList.remove('active');
      }
      await loadAllAppData();
    } else {
      showToast(data.detail || data.message || 'Registrasi gagal. Periksa kembali data Anda.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi saat registrasi. Pastikan koneksi internet stabil.', 'error');
    console.error('Register error:', err);
  } finally {
    clearTimeout(slowHint);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Daftar & Masuk ke Aplikasi';
  }
};

const syncRegisterDivisions = (type) => {
  const divSelect = document.getElementById('reg-division');
  if (!divSelect) return;
  const mgmtDivs = ["HRD", "BM", "Finance", "QC", "Creative", "DOS", "Logistik", "Produksi", "Driver", "HRGA", "Security"];
  const opsDivs = ["SPV", "Head Kitchen", "Head Bar", "Kasir", "Server", "Kitchen", "Bar", "PA", "CS"];
  const list = (type === 'Management') ? mgmtDivs : opsDivs;
  divSelect.innerHTML = list.map(d => `<option value="${d}">${d}</option>`).join('');
};
window.syncRegisterDivisions = syncRegisterDivisions;

const populateRegisterOutlets = () => {
  const outSelect = document.getElementById('reg-outlet');
  if (!outSelect || !AppState.outlets || AppState.outlets.length === 0) return;
  outSelect.innerHTML = AppState.outlets.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
};

const clearSessionData = () => {
  AppState.currentUser = null;
  AppState.employees = [];
  AppState.outlets = [];
  AppState.dailyReports = [];
  AppState.attendanceLogs = [];
  AppState.payslips = [];
  AppState.kpiSummary = null;
  AppState.selectedPayslipForPin = null;
  AppState.activeChatChannel = '#general';
  AppState.currentView = 'dashboard';
  AppState.gpsOk = false;
  if (AppState.cameraStream) {
    try { AppState.cameraStream.getTracks().forEach(t => t.stop()); } catch (e) { /* abaikan */ }
    AppState.cameraStream = null;
  }
  localStorage.removeItem('tertib_disiplin_auth_user');
  if (window.tdLogout) tdLogout();
};
const restartToLogin = (notice) => {
  if (notice) { try { sessionStorage.setItem('td_notice', notice); } catch (e) { /* abaikan */ } }
  if (window.location && typeof window.location.reload === 'function') window.location.reload();
};

const logoutUser = () => {
  if (!confirm('Apakah Anda yakin ingin keluar (Logout) dari TERTIB DISIPLIN?')) return;
  clearSessionData();
  setSidebarOpen(false);
  showLoginError('');
  const authScreen = document.getElementById('auth-gate-screen');
  if (authScreen) authScreen.classList.remove('hidden');
  switchAuthTab('login');
  restartToLogin('Anda telah keluar dari aplikasi.');
};

document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      console.log('TERTIB DISIPLIN Service Worker Registered');
    }).catch(err => console.log('SW registration error:', err));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.deferredPwaPrompt = e;
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.style.display = 'flex';
  });
  initSidebarToggle();
  initGlobalSearch();
  ['login-identifier', 'login-password'].forEach(id => {
    const f = document.getElementById(id);
    if (f) f.addEventListener('input', () => showLoginError(''));
  });
  const btnInstallPwa = document.getElementById('btn-install-pwa');
  if (btnInstallPwa) {
    btnInstallPwa.addEventListener('click', (e) => {
      e.preventDefault();
      try { window.triggerPwaPrompt && window.triggerPwaPrompt(); } catch (err) {
        console.error('PWA install trigger error:', err);
        showToast('Gagal memulai instalasi. Coba refresh halaman lalu tekan lagi.', 'error');
      }
    });
  }
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      if (view) switchView(view);
    });
  });
  setInterval(updateAttendanceClock, 1000);
  detectDeviceGPS();
  let __lastSessionExpiredReload_ = 0;
  window.addEventListener('td-session-expired', () => {
    const now = Date.now();
    if (now - __lastSessionExpiredReload_ < 10000) {
      console.warn('td-session-expired di-skip (cooldown 10s, anti-reload-loop)');
      return;
    }
    __lastSessionExpiredReload_ = now;
    clearSessionData();
    setSidebarOpen(false);
    const authScreen = document.getElementById('auth-gate-screen');
    if (authScreen) authScreen.classList.remove('hidden');
    switchAuthTab('login');
    showToast('Sesi berakhir. Silakan login kembali.', 'warning');
    restartToLogin('Sesi berakhir. Silakan login kembali.');
  });
  try {
    const notice = sessionStorage.getItem('td_notice');
    if (notice) { sessionStorage.removeItem('td_notice'); showToast(notice, 'info'); }
  } catch (e) { /* abaikan */ }
  const isLoggedIn = initAuthSession();
  if (isLoggedIn) {
    await loadAllAppData();
    window.checkBackendVersion && window.checkBackendVersion();
    window.updateTopbarInstallButton && window.updateTopbarInstallButton();
    window.maybeAutoOpenInstallModal && window.maybeAutoOpenInstallModal();
  }
  if (window.Chart) {
    requestIdleCallback ? requestIdleCallback(() => initMockupCharts()) : setTimeout(initMockupCharts, 100);
  }
  populateDivisionDropdowns();
  try {
    const regType = document.getElementById('reg-type');
    const regDiv = document.getElementById('reg-division');
    if (regType && regDiv) {
      window.syncRegisterDivisions(regType.value || 'Operasional');
    }
  } catch (e) { console.warn('Gagal init reg division dropdown:', e); }
  if (window.feather) feather.replace();
});

window.triggerPwaPrompt = () => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) {
    showToast('Aplikasi sudah terinstall di perangkat Anda!', 'success');
    dismissPwaBanner();
    return;
  }
  dismissPwaBanner();
  const body = document.getElementById('install-app-body');
  if (!body) {
    if (AppState.deferredPwaPrompt) {
      AppState.deferredPwaPrompt.prompt();
      AppState.deferredPwaPrompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') {
          showToast('Aplikasi berhasil dipasang di perangkat Anda!', 'success');
        }
        AppState.deferredPwaPrompt = null;
      });
    } else if (isIOS) {
      showToast('iOS: Tap tombol Share (⬆️) di Safari → "Add to Home Screen" → Add', 'info');
    } else {
      showToast('Klik menu titik tiga (⋮) di browser → "Install App" / "Tambahkan ke Layar Utama"', 'info');
    }
    return;
  }
  let html = '';
  if (isIOS) {
    html = `
      <div style="text-align:center; padding:8px 0 12px 0;">
        <div style="font-size:48px; line-height:1; margin-bottom:8px;">📲</div>
        <p style="margin:0 0 14px 0; color:var(--text-dark); font-size:13px;">iPhone/iPad tidak mendukung instalasi otomatis. Ikuti langkah berikut untuk memasang aplikasi:</p>
      </div>
      <ol style="margin:0; padding-left:20px; color:var(--text-dark); font-size:13px; line-height:1.9;">
        <li>Buka aplikasi ini di <strong>Safari</strong> (bukan Chrome di iPhone).</li>
        <li>Tap tombol <strong>Share</strong> <span style="display:inline-block; transform:translateY(2px);">⬆️</span> di toolbar bawah Safari (ikon kotak dgn panah ke atas).</li>
        <li>Scroll ke bawah, pilih <strong>"Add to Home Screen"</strong> / "Tambah ke Layar Utama".</li>
        <li>Tap <strong>Add</strong> (kanan atas) — ikon aplikasi muncul di home screen iPhone.</li>
      </ol>
      <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:10px; padding:10px 12px; margin-top:14px; font-size:11.5px; color:#92400e;">
        <strong>Catatan:</strong> Wajib pakai <strong>Safari</strong>. Chrome/Firefox di iPhone tidak mendukung Add to Home Screen dgn benar.
      </div>
    `;
  } else if (isAndroid && AppState.deferredPwaPrompt) {
    html = `
      <div style="text-align:center; padding:8px 0 12px 0;">
        <div style="font-size:48px; line-height:1; margin-bottom:8px;">🤖</div>
        <p style="margin:0; color:var(--text-dark); font-size:13px;">Perangkat Android Anda siap untuk instalasi. Klik tombol <strong>"Install Sekarang"</strong> di bawah, lalu konfirmasi prompt instalasi dari browser.</p>
      </div>
      <div style="background:#ecfdf5; border:1px solid #10b981; border-radius:10px; padding:10px 12px; margin-top:8px; font-size:11.5px; color:#065f46;">
        <strong>Tip:</strong> Setelah install, aplikasi bisa diakses dari home screen tanpa buka browser. Notifikasi presensi otomatis aktif.
      </div>
    `;
  } else {
    html = `
      <div style="text-align:center; padding:8px 0 12px 0;">
        <div style="font-size:48px; line-height:1; margin-bottom:8px;">💻</div>
        <p style="margin:0 0 14px 0; color:var(--text-dark); font-size:13px;">Browser Anda tidak mendukung instalasi otomatis. Ikuti langkah manual:</p>
      </div>
      ${isAndroid ? `
        <ol style="margin:0; padding-left:20px; color:var(--text-dark); font-size:13px; line-height:1.9;">
          <li>Tap menu <strong>titik tiga (⋮)</strong> di kanan atas browser Chrome.</li>
          <li>Pilih <strong>"Install app"</strong> / "Install aplikasi" / "Add to Home screen".</li>
          <li>Konfirmasi dgn tap <strong>Install</strong>.</li>
        </ol>
      ` : `
        <ol style="margin:0; padding-left:20px; color:var(--text-dark); font-size:13px; line-height:1.9;">
          <li>Di Chrome/Edge: klik icon <strong>Install</strong> di address bar (kanan URL), atau buka menu <strong>⋮</strong> → "Install ... as app".</li>
          <li>Konfirmasi instalasi.</li>
        </ol>
      `}
      <div style="background:#eff6ff; border:1px solid #93c5fd; border-radius:10px; padding:10px 12px; margin-top:14px; font-size:11.5px; color:#1e40af;">
        <strong>Tidak menemukan opsi install?</strong> Pastikan pakai <strong>Chrome/Edge</strong> terbaru, dan sudah login. Refresh halaman lalu coba lagi.
      </div>
    `;
  }
  body.innerHTML = html;
  const actionBtn = document.getElementById('btn-install-action');
  const actionBtnText = document.getElementById('btn-install-action-text');
  if (actionBtn) {
    if (isAndroid && AppState.deferredPwaPrompt) {
      actionBtn.style.display = 'inline-flex';
      if (actionBtnText) actionBtnText.textContent = 'Install Sekarang';
      actionBtn.onclick = null;
      actionBtn.onclick = async () => {
        try {
          if (!AppState.deferredPwaPrompt) {
            showToast('Prompt instalasi sudah tidak tersedia. Refresh halaman lalu coba lagi.', 'warning');
            closeModal('modal-install-app');
            return;
          }
          AppState.deferredPwaPrompt.prompt();
          const choice = await AppState.deferredPwaPrompt.userChoice;
          if (choice.outcome === 'accepted') {
            showToast('Aplikasi berhasil dipasang di perangkat Anda!', 'success');
          } else {
            showToast('Instalasi dibatalkan. Anda bisa coba lagi kapan saja.', 'info');
          }
          AppState.deferredPwaPrompt = null;
          dismissPwaBanner();
          closeModal('modal-install-app');
        } catch (err) {
          console.error('PWA install error:', err);
          showToast('Gagal memulai instalasi. Coba refresh halaman lalu tekan lagi.', 'error');
        }
      };
    } else {
      actionBtn.style.display = 'none';
    }
  }
  if (window.feather) feather.replace();
  openModal('modal-install-app');
};
const triggerPwaPrompt = window.triggerPwaPrompt;

const showPwaBannerIfNeeded = () => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) return;
  const dismissed = sessionStorage.getItem('td_pwa_dismissed');
  if (dismissed) return;
  setTimeout(() => {
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.style.display = 'flex';
  }, 3000);
};

const updateTopbarInstallButton = () => {
  const btn = document.getElementById('btn-topbar-install');
  if (!btn) return;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'flex';
  if (window.feather) feather.replace();
};
window.updateTopbarInstallButton = updateTopbarInstallButton;

const maybeAutoOpenInstallModal = () => {
  try {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
    if (!isMobile) return;
    const shown = sessionStorage.getItem('td_install_modal_shown');
    if (shown) return;
    setTimeout(() => {
      try { sessionStorage.setItem('td_install_modal_shown', '1'); } catch (e) { /* ignore */ }
      if (window.triggerPwaPrompt) window.triggerPwaPrompt();
    }, 2500);
  } catch (e) {
    console.warn('Auto-open install modal gagal:', e);
  }
};
window.maybeAutoOpenInstallModal = maybeAutoOpenInstallModal;

const dismissPwaBanner = () => {
  const banner = document.getElementById('pwa-banner');
  if (banner) banner.style.display = 'none';
  try { sessionStorage.setItem('td_pwa_dismissed', '1'); } catch (e) { /* ignore */ }
};
window.dismissPwaBanner = dismissPwaBanner;

// ============ v81 FLICKER FIX: switchView ============
const switchView = (viewName) => {
  window.switchView = switchView;
  if (!canAccessView(viewName)) {
    showToast('Anda tidak memiliki akses ke panel ini.', 'warning');
    viewName = 'dashboard';
  }
  const isSameView = AppState.currentView === viewName;
  setSidebarOpen(false);
  AppState.currentView = viewName;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (activeNav && activeNav.scrollIntoView) { try { activeNav.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* abaikan */ } }
  if (activeNav) activeNav.classList.add('active');
  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) activePanel.classList.add('active');
  const titles = {
    'dashboard': ['Dashboard', 'Pusat Kontrol Operasional & Manajemen Multi-Outlet'],
    'daily-report': ['Daily Report Operasional', 'Alur Tugas: Proses ➔ Hold (Wajib Bukti) ➔ Selesai (Wajib Bukti)'],
    'presensi': ['Presensi GPS & Selfie', 'Verifikasi Titik Lokasi Geofence & Kamera Langsung'],
    'employees': ['Database Karyawan', 'Manajemen Personel, Skala Upah Permenaker 1/2017 & Struktur Organisasi'],
    'payroll': ['Kompensasi & Payroll Autopilot', 'Perhitungan Upah Harian, BPJS, PPh 21 TER, & Slip Gaji Online'],
    'kpi': ['Analisis Kinerja & KPI', 'Evaluasi Kinerja Otomatis Manajemen & Tim Operasional'],
    'chat': ['Chat Room Internal', 'Saluran Komunikasi Antar Divisi & Direct Messages'],
    'calendar': ['Kalender & Agenda Meeting', 'Jadwal Briefing, Audit QC, dan Agenda Operasional'],
    'leaves': ['Cuti & Ijin Karyawan', 'Pengajuan cuti, Ijin, dan Sisa Cuti Tahunan'],
    'profile': ['Profil Saya', 'Edit data diri, foto profil, password, dan PIN slip gaji'],
    'data-center': ['Input Data Center', 'Edit data karyawan, gaji, dan KPI — Khusus Super Admin'],
    'outlets': ['Pengaturan Titik Outlet', 'Konfigurasi Titik Koordinat GPS dan Toleransi Radius Geofencing'],
    'superadmin': ['Panel Super Admin', 'Kelola Pengguna, Hak Akses, dan Pengaturan Seluruh Sistem Aplikasi']
  };
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  if (titles[viewName]) {
    titleEl.textContent = titles[viewName][0];
    subEl.textContent = titles[viewName][1];
  }
  if (viewName === 'payroll' && !isPayrollAdmin()) {
    titleEl.textContent = 'Slip Gaji Saya';
    subEl.textContent = 'Slip gaji pribadi Anda. Dibuka dengan PIN 6 digit.';
  }
  if (viewName === 'presensi' && !isSameView) {
    window.startCamera && window.startCamera();
    window.populateShiftOptions && window.populateShiftOptions();
    if (!AppState.gpsOk && !AppState.gpsLoading) {
      window.detectDeviceGPS && window.detectDeviceGPS();
    }
    if (!AppState.outlets || AppState.outlets.length === 0 || AppState.outletsLoadError) {
      loadOutlets && loadOutlets();
    }
    window.checkGpsDistance && window.checkGpsDistance();
    loadAttendanceLogs && loadAttendanceLogs();
  } else if (viewName === 'leaves' && !isSameView) {
    stopCamera();
    loadLeaveBalance && loadLeaveBalance();
    loadLeaveRequests && loadLeaveRequests();
    const saBanner = document.getElementById('leaves-sa-adjustment-banner');
    if (saBanner) saBanner.style.display = isFullAccess() ? '' : 'none';
    const jdBanner = document.getElementById('leaves-join-date-banner');
    if (jdBanner) jdBanner.style.display = (isSuperAdminUser() || (AppState.currentUser && AppState.currentUser.division === 'PCD')) ? '' : 'none';
  } else if (viewName === 'chat' && !isSameView) {
    stopCamera();
    if (window.ChatState) ChatState.lastSig = '';
    const cb = document.querySelector('.content-body');
    if (cb) cb.scrollTop = 0;
    loadChatMessages && loadChatMessages(AppState.activeChatChannel || '#general', { showLoading: true });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.sizeChatWrapper && window.sizeChatWrapper();
    }));
    window.startChatPolling && window.startChatPolling();
  } else if (viewName === 'data-center' && !isSameView) {
    stopCamera();
    window.stopChatPolling && window.stopChatPolling();
    loadEmployees && loadEmployees();
    loadDataCenterOutlets && loadDataCenterOutlets();
    renderDataCenterEmployeeList && renderDataCenterEmployeeList();
  } else if (viewName === 'profile' && !isSameView) {
    stopCamera();
    window.stopChatPolling && window.stopChatPolling();
    renderProfileView && renderProfileView();
  } else if (viewName === 'superadmin' && !isSameView) {
    stopCamera();
    window.stopChatPolling && window.stopChatPolling();
    window.loadSaOverview && window.loadSaOverview();
    window.loadSaUsers && window.loadSaUsers();
    window.loadSaSettings && window.loadSaSettings();
  } else if (viewName === 'daily-report' && !isSameView) {
    stopCamera();
    window.stopChatPolling && window.stopChatPolling();
    if (!AppState.dailyReports || AppState.dailyReports.length === 0) {
      loadDailyReports && loadDailyReports();
    } else {
      renderDailyReportBoard && renderDailyReportBoard();
    }
  } else if (!isSameView) {
    stopCamera();
    window.stopChatPolling && window.stopChatPolling();
  }

  // v81 FIX: debounced feather — batch rAF, no synchronous global scan
  window.debouncedFeatherReplace && window.debouncedFeatherReplace();

  if (activePanel && !isSameView) {
    staggerViewCards(activePanel);
    if (viewName === 'dashboard') {
      animateStatCards();
      updateDashboardStats && updateDashboardStats();
      // v81 FIX: render stream saat masuk dashboard (render di-skip saat hidden)
      renderDashboardReportsStream && renderDashboardReportsStream(currentStreamStatus_());
    }
  }
};

window.switchDashboardMode = (mode) => {
  if (mode !== 'Management' && mode !== 'Operasional') return;
  AppState.currentMode = mode;
  const bm = document.getElementById('btn-mode-management');
  const bo = document.getElementById('btn-mode-operasional');
  if (bm) bm.classList.toggle('active', mode === 'Management');
  if (bo) bo.classList.toggle('active', mode === 'Operasional');
  if (mode === 'Management') {
    showToast('Beralih ke Tampilan Management — semua panel kini menampilkan data karyawan Management', 'info');
  } else {
    showToast('Beralih ke Tampilan Tim Operasional — semua panel kini menampilkan data karyawan Operasional', 'info');
  }
  rerenderAllPanels_();
  if (window.feather) feather.replace();
};
const switchDashboardMode = window.switchDashboardMode;

const setCurrentUser = (user) => {
  if (!user) return;
  AppState.currentUser = user;
  window.populateShiftOptions && window.populateShiftOptions();
  const nameEl = document.getElementById('current-user-name');
  const roleEl = document.getElementById('current-user-role');
  const avatarEl = document.getElementById('current-user-avatar');
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = `${user.role} (${user.division})`;
  if (avatarEl) avatarEl.src = user.avatar_url || LOGO_URI;
  const sName = document.getElementById('sidebar-user-name');
  const sRole = document.getElementById('sidebar-user-role');
  const sAv = document.getElementById('sidebar-user-avatar');
  if (sName) sName.textContent = user.name;
  if (sRole) sRole.textContent = `${user.role} (${user.division})`;
  if (sAv) sAv.src = user.avatar_url || LOGO_URI;
  localStorage.setItem('tertib_disiplin_auth_user', JSON.stringify(user));
};

AppState.backendVersion = null;
AppState.backendVersionChecked = false;
const MIN_BACKEND_VERSION = 'v45-leave-fix';
const compareVersion_ = (a, b) => {
  if (!a || !b) return false;
  const am = String(a).match(/v(\d+)/i);
  const bm = String(b).match(/v(\d+)/i);
  if (!am || !bm) return false;
  return Number(am[1]) >= Number(bm[1]);
};

window.checkBackendVersion = async () => {
  if (AppState.backendVersionChecked) return AppState.backendVersion;
  AppState.backendVersionChecked = true;
  try {
    const res = await fetch('/api/');
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const ver = (data && data.body && data.body.version) || data.version || null;
    AppState.backendVersion = ver;
    if (ver && !compareVersion_(ver, MIN_BACKEND_VERSION)) {
      console.warn('Backend outdated:', ver, '< minimum', MIN_BACKEND_VERSION);
      showBackendOutdatedBanner(ver);
    }
    return ver;
  } catch (err) {
    console.warn('checkBackendVersion gagal:', err);
    return null;
  }
};

const showBackendOutdatedBanner = (currentVer) => {
  if (document.getElementById('backend-outdated-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'backend-outdated-banner';
  banner.style.cssText = 'position:fixed; top:0; left:0; right:0; z-index:9999; background:linear-gradient(90deg,#dc2626,#991b1b); color:#fff; padding:10px 16px; font-size:12px; display:flex; align-items:center; gap:10px; box-shadow:0 2px 8px rgba(0,0,0,0.2); flex-wrap:wrap;';
  banner.innerHTML = `
    <i data-feather="alert-triangle" style="width:16px; height:16px; flex-shrink:0;"></i>
    <strong>⚠️ Backend Apps Script perlu diperbarui.</strong>
    <span style="opacity:0.95;">Versi terpasang: <code style="background:rgba(255,255,255,0.2); padding:1px 6px; border-radius:4px;">${escapeHtml(currentVer || '?')}</code>. Minimum: <code style="background:rgba(255,255,255,0.2); padding:1px 6px; border-radius:4px;">${MIN_BACKEND_VERSION}</code>.</span>
    <span style="opacity:0.95;">Beberapa fitur (Panel SUPER ADMIN, Penyesuaian Cuti) tidak akan berfungsi sampai Anda deploy ulang Code.gs.</span>
    <button onclick="this.parentElement.style.display='none'" style="margin-left:auto; background:rgba(255,255,255,0.2); border:none; color:#fff; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:700;">Tutup</button>
  `;
  document.body.appendChild(banner);
  if (window.feather) feather.replace();
  setTimeout(() => { if (banner && banner.parentElement) banner.style.display = 'none'; }, 30000);
};

const loadOutlets = async () => {
  const cfg = window.TD_CONFIG || {};
  if (!cfg.API_URL || cfg.API_URL.indexOf('GANTI_DENGAN') >= 0 || cfg.API_URL.indexOf('script.google.com') < 0) {
    const errMsg = 'API_URL belum diisi di config.js. Buka file config.js, ganti nilai API_URL dengan link /exec dari Apps Script Anda.';
    console.error('loadOutlets:', errMsg);
    AppState.outlets = [];
    AppState.outletsLoadError = errMsg;
    window.checkGpsDistance && window.checkGpsDistance();
    return;
  }
  try {
    const res = await fetch('/api/outlets');
    console.log('loadOutlets response: HTTP', res.status, res.statusText);
    if (!res.ok) {
      let errMsg = 'Gagal memuat outlet (HTTP ' + res.status + ')';
      let errDetail = '';
      try {
        const errData = await res.json();
        errDetail = errData.detail || errData.message || '';
        if (errDetail) errMsg = errDetail;
      } catch (e) { /* response body bukan JSON */ }
      console.error('loadOutlets error:', errMsg, errDetail);
      AppState.outlets = [];
      if (res.status === 500) {
        AppState.outletsLoadError = 'Server error (500). Kemungkinan: (1) Sheet "outlets" belum dibuat — jalankan setupBaru di Apps Script. (2) Code.gs belum di-deploy ulang. Detail: ' + errMsg;
      } else if (res.status === 401) {
        AppState.outletsLoadError = 'Sesi login berakhir. Silakan login kembali.';
      } else {
        AppState.outletsLoadError = errMsg;
      }
      window.checkGpsDistance && window.checkGpsDistance();
      return;
    }
    const data = await res.json();
    console.log('loadOutlets data:', Array.isArray(data) ? data.length + ' outlets' : typeof data, data);
    const outletList = Array.isArray(data) ? data : (data && data.body && Array.isArray(data.body) ? data.body : []);
    AppState.outlets = outletList;
    AppState.outletsLoadError = '';
    window.populateGlobalOutletFilter && window.populateGlobalOutletFilter();
    window.populateShiftOptions && window.populateShiftOptions();
    const pSelect = document.getElementById('presensi-outlet-select');
    const rSelect = document.getElementById('rep-form-outlet');
    if (pSelect && outletList.length > 0) {
      pSelect.innerHTML = '<option value="">— Pilih outlet —</option>' +
        outletList.map(o => `<option value="${o.id}">${o.name}${o.radius_meters ? ' (Radius: ' + o.radius_meters + 'm)' : ''}</option>`).join('');
      console.log('Dropdown presensi terisi dengan', outletList.length, 'outlet');
    } else if (pSelect) {
      pSelect.innerHTML = '<option value="">— Belum ada outlet —</option>';
      AppState.outletsLoadError = 'Tidak ada outlet di database. Jalankan setupBaru di Apps Script, atau tambah outlet via menu "Titik Lokasi Outlet".';
    }
    if (rSelect && outletList.length > 0) {
      rSelect.innerHTML = outletList.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    }
    renderOutletsTable();
    window.checkGpsDistance && window.checkGpsDistance();
  } catch (err) {
    console.error('Failed loading outlets:', err);
    AppState.outlets = [];
    AppState.outletsLoadError = (err && err.message) ? err.message : 'Kesalahan koneksi saat memuat outlet. Periksa internet & pastikan API_URL di config.js benar.';
    window.checkGpsDistance && window.checkGpsDistance();
  }
};

window.diagnosePresensi = async () => {
  const results = [];
  const log = (msg) => { results.push(msg); console.log('[DIAGNOSE]', msg); };
  log('=== DIAGNOSTIC PRESENSI ===');
  log('Waktu: ' + new Date().toString());
  const cfg = window.TD_CONFIG || {};
  log('1. Config TD_CONFIG: ' + (cfg ? 'OK' : 'TIDAK DITEMUKAN'));
  log('   API_URL: ' + (cfg.API_URL || '(kosong)'));
  if (!cfg.API_URL) {
    log('   ❌ API_URL belum diisi! Buka config.js, isi dengan link /exec dari Apps Script.');
  } else if (cfg.API_URL.indexOf('GANTI_DENGAN') >= 0) {
    log('   ❌ API_URL masih placeholder! Ganti dengan link /exec asli dari Apps Script Anda.');
  } else if (cfg.API_URL.indexOf('script.google.com') < 0) {
    log('   ❌ API_URL tidak valid! Harus berformat https://script.google.com/macros/s/.../exec');
  } else {
    log('   ✅ API_URL terlihat valid.');
  }
  const token = localStorage.getItem('td_token');
  log('2. Token login: ' + (token ? 'Ada (' + token.substring(0, 20) + '...)' : 'TIDAK ADA — silakan login dulu'));
  log('3. Current user: ' + (AppState.currentUser ? AppState.currentUser.name + ' (' + AppState.currentUser.nip + ')' : 'TIDAK ADA — silakan login'));
  log('4. Test API /api/outlets...');
  try {
    const res = await fetch('/api/outlets');
    log('   HTTP status: ' + res.status + ' ' + res.statusText);
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      log('   ✅ Berhasil! Jumlah outlet: ' + list.length);
      if (list.length > 0) {
        list.forEach(function (o, i) {
          log('   Outlet ' + (i + 1) + ': ' + o.name + ' (id=' + o.id + ', lat=' + (o.lat) + ' type=' + typeof o.lat + ', lon=' + (o.lon) + ' type=' + typeof o.lon + ', radius=' + (o.radius_meters || 'N/A') + 'm)');
        });
        if (AppState.gpsOk && list.length > 0) {
          const o = list[0];
          const oLat = parseFloat(o.lat), oLon = parseFloat(o.lon);
          const myLat = AppState.deviceCoordinates.lat, myLon = AppState.deviceCoordinates.lon;
          log('   --- GPS DISTANCE TEST ---');
          log('   My GPS: ' + myLat + ', ' + myLon);
          log('   Outlet ' + o.name + ' raw lat: ' + o.lat + ' (typeof: ' + typeof o.lat + ')');
          log('   Outlet ' + o.name + ' raw lon: ' + o.lon + ' (typeof: ' + typeof o.lon + ')');
          log('   Outlet ' + o.name + ' parsed lat: ' + oLat + ' (isNaN: ' + isNaN(oLat) + ')');
          log('   Outlet ' + o.name + ' parsed lon: ' + oLon + ' (isNaN: ' + isNaN(oLon) + ')');
          if (!isNaN(oLat) && !isNaN(oLon)) {
            const dist = calculateHaversine(myLat, myLon, oLat, oLon);
            log('   Distance: ' + dist + ' meter');
          }
        }
      } else {
        log('   ⚠️ Array kosong — sheet outlets mungkin belum diisi. Jalankan setupBaru di Apps Script.');
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      log('   ❌ Gagal! Detail: ' + (errData.detail || errData.message || res.statusText));
      if (res.status === 500) {
        log('   Kemungkinan: Code.gs belum di-deploy ulang, atau sheet outlets belum dibuat.');
      } else if (res.status === 401) {
        log('   Kemungkinan: Token login expired. Logout & login kembali.');
      }
    }
  } catch (err) {
    log('   ❌ Error koneksi: ' + err.message);
    log('   Kemungkinan: API_URL salah, internet mati, atau Apps Script tidak aktif.');
  }
  log('5. GPS status: ' + (AppState.gpsOk ? 'AKTIF (' + AppState.deviceCoordinates.lat + ', ' + AppState.deviceCoordinates.lon + ')' : 'BELUM AKTIF'));
  if (AppState.gpsLastError) log('   GPS error terakhir: ' + AppState.gpsLastError);
  log('6. Outlets di AppState: ' + (AppState.outlets ? AppState.outlets.length + ' outlet' : 'tidak ada'));
  if (AppState.outletsLoadError) log('   Error: ' + AppState.outletsLoadError);
  log('=== DIAGNOSTIC SELESAI ===');
  const msg = results.join('\n');
  try { alert(msg); } catch (e) { /* abaikan */ }
  return results;
};

const loadEmployees = async () => {
  try {
    const res = await fetch('/api/employees');
    if (!res.ok) return;
    const data = await res.json();
    AppState.employees = Array.isArray(data) ? data : [];
    renderEmployeesTable(AppState.employees);
    if (typeof updateDashboardStats === 'function') updateDashboardStats();
  } catch (err) {
    console.error('Failed loading employees:', err);
  }
};

const loadDailyReports = async () => {
  try {
    const res = await fetch('/api/daily-reports');
    if (!res.ok) return;
    const data = await res.json();
    AppState.dailyReports = Array.isArray(data) ? data : [];
    renderDashboardReportsStream();
    renderDailyReportBoard();
    if (typeof updateDashboardStats === 'function') updateDashboardStats();
  } catch (err) {
    console.error('Failed loading reports:', err);
  }
};

const loadKpiSummary = async () => {
  try {
    const res = await fetch('/api/kpi/summary');
    if (!res.ok) return;
    const data = await res.json();
    AppState.kpiSummary = data;
    const personalCard = document.getElementById('kpi-personal-card');
    const adminTableCard = document.getElementById('kpi-admin-table-card');
    const leaderboardCard = document.getElementById('kpi-leaderboard-card');
    if (data.mode === 'personal') {
      renderPersonalKpi(data);
      if (personalCard) personalCard.style.display = 'block';
      if (adminTableCard) adminTableCard.style.display = 'none';
      if (leaderboardCard) leaderboardCard.style.display = 'none';
      renderStaffRatingsCards([]);
      AppState.kpiDivisionStats = [];
      renderKpiTable([]);
    } else {
      renderStaffRatingsCards(data.topStaff || []);
      AppState.kpiDivisionStats = data.divisionStats || [];
      renderKpiTable(data.divisionStats || []);
      if (personalCard) personalCard.style.display = 'none';
      if (adminTableCard) adminTableCard.style.display = 'block';
      if (leaderboardCard) leaderboardCard.style.display = 'block';
    }
  } catch (err) {
    console.error('Failed loading KPI:', err);
  }
};

// v81: renderPersonalKpi uses debounced feather
const renderPersonalKpi = (data) => {
  const container = document.getElementById('kpi-personal-card');
  if (!container) return;
  container.style.display = 'block';
  const u = data.user || {};
  const p = data.personal || {};
  const onTimeColor = p.on_time_rate >= 85 ? '#10b981' : (p.on_time_rate >= 60 ? '#f59e0b' : '#ef4444');
  const kpiColor = p.kpi_score >= 85 ? '#10b981' : (p.kpi_score >= 70 ? '#f59e0b' : '#ef4444');
  container.innerHTML = `
    <div style="display:flex; align-items:center; gap:14px; padding:18px; background:linear-gradient(135deg, var(--burgundy-soft), #fff); border-radius:18px; margin-bottom:18px;">
      <div style="width:64px; height:64px; border-radius:50%; background:var(--burgundy-primary); color:#fff; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800; flex-shrink:0;">
        ${(u.name || '?').charAt(0).toUpperCase()}
      </div>
      <div>
        <h3 style="margin:0; font-size:18px; color:var(--text-dark);">${u.name || '-'}</h3>
        <p style="margin:2px 0 0 0; font-size:12px; color:#64748b;">${u.role || ''} • ${u.division || ''} • ${u.outlet_name || ''}</p>
        <p style="margin:2px 0 0 0; font-size:11px; color:#94a3b8;">${u.grade || ''} • ${u.type || ''}</p>
      </div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
      <div style="padding:14px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
        <p style="font-size:11px; color:#64748b; margin:0 0 4px 0; font-weight:700; text-transform:uppercase;">Rating</p>
        <p style="font-size:22px; font-weight:800; color:var(--burgundy-primary); margin:0;">⭐ ${p.rating || '-'}</p>
        <p style="font-size:11px; color:#94a3b8; margin:2px 0 0 0;">dari 5.0</p>
      </div>
      <div style="padding:14px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
        <p style="font-size:11px; color:#64748b; margin:0 0 4px 0; font-weight:700; text-transform:uppercase;">Skor KPI</p>
        <p style="font-size:22px; font-weight:800; color:${kpiColor}; margin:0;">${p.kpi_score || 0}%</p>
        <p style="font-size:11px; color:#94a3b8; margin:2px 0 0 0;">penilaian performa</p>
      </div>
      <div style="padding:14px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
        <p style="font-size:11px; color:#64748b; margin:0 0 4px 0; font-weight:700; text-transform:uppercase;">Hadir</p>
        <p style="font-size:22px; font-weight:800; color:#0284c7; margin:0;">${p.present_days || 0}</p>
        <p style="font-size:11px; color:#94a3b8; margin:2px 0 0 0;">hari presensi</p>
      </div>
      <div style="padding:14px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
        <p style="font-size:11px; color:#64748b; margin:0 0 4px 0; font-weight:700; text-transform:uppercase;">Tepat Waktu</p>
        <p style="font-size:22px; font-weight:800; color:${onTimeColor}; margin:0;">${p.on_time_rate || 0}%</p>
        <p style="font-size:11px; color:#94a3b8; margin:2px 0 0 0;">${p.late_count || 0}x terlambat</p>
      </div>
    </div>
    <div style="margin-top:14px; padding:14px; background:linear-gradient(135deg, #ecfdf5, #d1fae5); border:1px solid #a7f3d0; border-radius:12px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
      <div>
        <p style="font-size:11px; color:#065f46; margin:0; text-transform:uppercase; font-weight:700;">Sisa Cuti Tahunan</p>
        <p style="font-size:13px; color:#475569; margin:2px 0 0 0;">Berdasarkan UU Ketenagakerjaan (12 hari/tahun)</p>
      </div>
      <div style="text-align:right;">
        <div style="font-size:28px; font-weight:800; color:#059669; line-height:1;">
          <span id="kpi-leave-balance">-</span>
        </div>
        <div style="font-size:10px; color:#065f46; font-weight:700; text-transform:uppercase;">hari tersisa</div>
      </div>
    </div>
    <div style="margin-top:14px; padding:12px 14px; background:#fef3c7; border:1px solid #fde68a; border-radius:10px; font-size:12px; color:#92400e;">
      <i data-feather="info" style="width:13px; height:13px; vertical-align:middle;"></i>
      <strong>Catatan:</strong> Data KPI hanya menampilkan performa pribadi Anda. Hubungi HRD untuk evaluasi lengkap.
    </div>
  `;
  // v81 FIX: debounced feather
  window.debouncedFeatherReplace && window.debouncedFeatherReplace();
  loadLeaveBalance && loadLeaveBalance();
};

const loadAttendanceLogs = async () => {
  try {
    const res = await fetch('/api/attendance');
    if (!res.ok) return;
    const data = await res.json();
    AppState.attendanceLogs = Array.isArray(data) ? data : [];
    renderAttendanceTable(AppState.attendanceLogs);
    if (typeof updateDashboardStats === 'function') updateDashboardStats();
  } catch (err) {
    console.error('Failed loading attendance:', err);
  }
};

const loadPayslips = async () => {
  try {
    const res = await fetch('/api/payroll/slips');
    if (!res.ok) return;
    const data = await res.json();
    AppState.payslips = Array.isArray(data) ? data : [];
    renderPayslipsTable(AppState.payslips);
    const sumRes = await fetch('/api/payroll/summary');
    if (!sumRes.ok) return;
    const sum = await sumRes.json();
    if (sum) {
      document.getElementById('pay-total-gross').textContent = formatRupiah(sum.total_gross || 0);
      document.getElementById('pay-total-net').textContent = formatRupiah(sum.total_net || 0);
      const taxTotal = (sum.total_bpjs_tk || 0) + (sum.total_bpjs_kes || 0) + (sum.total_pph21 || 0);
      document.getElementById('pay-total-tax').textContent = formatRupiah(taxTotal);
    }
  } catch (err) {
    console.error('Failed loading payslips:', err);
  }
};

const populateDivisionDropdowns = () => {
  const empDivFilter = document.getElementById('emp-filter-division');
  if (!empDivFilter) return;
  const mgmtDivs = ["HRD", "BM", "Finance", "QC", "Creative", "DOS", "Logistik", "Produksi", "Driver", "HRGA", "Security"];
  const opsDivs = ["SPV", "Head Kitchen", "Head Bar", "Kasir", "Server", "Kitchen", "Bar", "PA", "CS"];
  let html = '<option value="all">Semua Divisi</option>';
  html += '<optgroup label="Management">';
  mgmtDivs.forEach(d => html += `<option value="${d}">${d}</option>`);
  html += '</optgroup><optgroup label="Tim Operasional">';
  opsDivs.forEach(d => html += `<option value="${d}">${d}</option>`);
  html += '</optgroup>';
  empDivFilter.innerHTML = html;
};
window.populateDivisionDropdowns = populateDivisionDropdowns;

let branchRatingChartInstance = null;
let issueRingsChartInstance = null;
let happyDonutChartInstance = null;

const initMockupCharts = () => {
  const branchCanvas = document.getElementById('branchRatingChart');
  if (branchCanvas) {
    const ctx = branchCanvas.getContext('2d');
    branchRatingChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['(Memuat outlet...)'],
        datasets: [
          { label: 'Bulan Ini', data: [0], backgroundColor: '#701c34', borderRadius: 6, barThickness: 14 },
          { label: 'Bulan Lalu', data: [0], backgroundColor: '#e2e8f0', borderRadius: 6, barThickness: 14 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 5, ticks: { stepSize: 1, color: '#94a3b8' }, grid: { color: '#f1f5f9' } },
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { weight: '600', size: 11 } } }
        }
      }
    });
  }
  const issueCanvas = document.getElementById('issueRingsChart');
  if (issueCanvas) {
    const ctx = issueCanvas.getContext('2d');
    issueRingsChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Resolved (Selesai)', 'Pending (Hold)', 'Escalated'],
        datasets: [{ data: [0, 0, 0], backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderWidth: 3, borderColor: '#ffffff', cutout: '72%' }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }
  const happyCanvas = document.getElementById('happyDonutChart');
  if (happyCanvas) {
    const ctx = happyCanvas.getContext('2d');
    happyDonutChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Members', 'Non-Members', 'New Guest', 'Existing Guest'],
        datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#701c34', '#0284c7', '#f43f5e', '#10b981'], borderWidth: 2, borderColor: '#ffffff', cutout: '65%' }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }
};

const isDashboardAdmin = (user = AppState.currentUser) => !!user && (isSuperAdminUser(user) || user.division === 'PCD');

const updateDashboardStats = () => {
  if (!AppState.currentUser) return;
  const u = AppState.currentUser;
  const adminMode = isDashboardAdmin();
  const gf = getGlobalFilters();
  let scopeEmps = AppState.employees || [];
  if (gf.mode === 'Management') scopeEmps = scopeEmps.filter(e => MANAGEMENT_DIVISIONS.indexOf(e.division) >= 0);
  else if (gf.mode === 'Operasional') scopeEmps = scopeEmps.filter(e => MANAGEMENT_DIVISIONS.indexOf(e.division) < 0);
  if (gf.outlet !== 'all') scopeEmps = scopeEmps.filter(e => e.outlet_id === gf.outlet);
  const reportsEl = document.getElementById('stat-reports-value');
  if (reportsEl) {
    let myReports = AppState.dailyReports || [];
    if (!adminMode) {
      myReports = myReports.filter(r => r.reporter_id === u.id);
    } else {
      if (gf.mode === 'Management') myReports = myReports.filter(r => r.type === 'Management');
      else if (gf.mode === 'Operasional') myReports = myReports.filter(r => r.type !== 'Management');
      if (gf.outlet !== 'all') myReports = myReports.filter(r => r.outlet_id === gf.outlet);
      myReports = myReports.filter(r => dateInPeriod_(r.created_at, gf.cutoff, gf.todayStr));
    }
    reportsEl.textContent = myReports.length;
  }
  const ratingsEl = document.getElementById('stat-ratings-value');
  const ratingsSubEl = document.getElementById('stat-ratings-subtitle');
  if (ratingsEl) {
    if (adminMode) {
      const avgRating = scopeEmps.length > 0
        ? (scopeEmps.reduce((sum, e) => sum + (e.rating || 0), 0) / scopeEmps.length).toFixed(1)
        : '-';
      ratingsEl.innerHTML = avgRating + ' <span>/ 5</span>';
      if (ratingsSubEl) ratingsSubEl.textContent = '⭐ Rata-rata ' + scopeEmps.length + ' karyawan' + (gf.outlet !== 'all' ? ' • outlet terpilih' : '') + (gf.mode !== 'Management' ? ' • Tim Operasional' : ' • Management');
    } else {
      ratingsEl.innerHTML = (u.rating || 0) + ' <span>/ 5</span>';
      if (ratingsSubEl) ratingsSubEl.textContent = '⭐ Rating pribadi Anda';
    }
  }
  const attEl = document.getElementById('stat-attendance-value');
  const attSubEl = document.getElementById('stat-attendance-subtitle');
  if (attEl) {
    let myLogs = AppState.attendanceLogs || [];
    if (gf.mode === 'Management') myLogs = myLogs.filter(a => MANAGEMENT_DIVISIONS.indexOf(a.division) >= 0);
    else if (gf.mode === 'Operasional') myLogs = myLogs.filter(a => MANAGEMENT_DIVISIONS.indexOf(a.division) < 0);
    if (gf.outlet !== 'all') myLogs = myLogs.filter(a => a.outlet_id === gf.outlet);
    myLogs = myLogs.filter(a => dateInPeriod_(a.date, gf.cutoff, gf.todayStr));
    if (!adminMode && u.id) {
      myLogs = myLogs.filter(a => a.employee_id === u.id);
    }
    const todayLogs = myLogs.filter(a => a.date === gf.todayStr);
    if (adminMode) {
      const totalEmps = scopeEmps.length;
      const pct = totalEmps > 0 ? Math.round((todayLogs.length / totalEmps) * 100) : 0;
      attEl.textContent = pct + '%';
      if (attSubEl) attSubEl.textContent = '❤️ ' + todayLogs.length + ' dari ' + totalEmps + ' karyawan hadir hari ini';
    } else {
      attEl.textContent = myLogs.length;
      if (attSubEl) attSubEl.textContent = gf.period === 'all' ? '❤️ Total hari presensi Anda' : '❤️ Hari presensi Anda (' + gf.period + ')';
    }
  }
};

// ============ v81 FLICKER FIX: renderDashboardReportsStream ============
const renderDashboardReportsStream = (filterStatus = 'All') => {
  const container = document.getElementById('dashboard-reports-stream');
  if (!container) return;

  // v81 FIX: SKIP render saat panel Dashboard HIDDEN — cegah layout-shift
  const __dashView = document.getElementById('view-dashboard');
  if (__dashView && !__dashView.classList.contains('active')) return;

  const gf = getGlobalFilters();
  const cacheKey = JSON.stringify({
    filterStatus,
    count: (AppState.dailyReports || []).length,
    ids: (AppState.dailyReports || []).map(r => r.id + ':' + r.status).join('|'),
    mode: AppState.currentMode,
    outlet: gf.outlet, period: gf.period, search: gf.search,
    userId: AppState.currentUser ? AppState.currentUser.id : '',
    isAdmin: isDashboardAdmin()
  });
  if (container.__lastStreamCache === cacheKey) return;
  container.__lastStreamCache = cacheKey;

  let reports = AppState.dailyReports;
  if (isDashboardAdmin() && AppState.currentMode) {
    if (AppState.currentMode === 'Management') {
      reports = reports.filter(r => r.type === 'Management');
    } else if (AppState.currentMode === 'Operasional') {
      reports = reports.filter(r => r.type !== 'Management');
    }
  }
  if (!isDashboardAdmin() && AppState.currentUser) {
    reports = reports.filter(r => r.reporter_id === AppState.currentUser.id);
  }
  if (filterStatus !== 'All') {
    reports = reports.filter(r => r.status.toLowerCase() === filterStatus.toLowerCase());
  }
  if (gf.outlet !== 'all') reports = reports.filter(r => r.outlet_id === gf.outlet);
  reports = reports.filter(r => dateInPeriod_(r.created_at, gf.cutoff, gf.todayStr));
  reports = reports.filter(r => matchGlobalSearch_(gf.search, [r.title, r.description, r.reporter_name, r.outlet_name, r.division]));

  if (reports.length === 0) {
    const msg = isDashboardAdmin()
      ? 'Tidak ada aktivitas harian pada status ini.'
      : 'Anda belum memiliki laporan harian. Buat laporan pertama Anda di menu Daily Report.';
    container.innerHTML = `<p style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">${msg}</p>`;
    return;
  }

  container.innerHTML = reports.slice(0, 6).map(r => {
    let statusClass = 'status-proses';
    let statusIcon = 'loader';
    if (r.status === 'Hold') {
      statusClass = 'status-hold';
      statusIcon = 'pause-circle';
    } else if (r.status === 'Selesai') {
      statusClass = 'status-selesai';
      statusIcon = 'check-circle';
    }
    const proofBtn = r.proof_file_url ? `
      <button class="btn-proof-preview" onclick="openLightbox('${r.proof_file_url}', '${r.title} - ${r.reporter_name}')">
        <i data-feather="image" style="width:12px; height:12px;"></i> Bukti Foto
      </button>
    ` : '';
    return `
      <div class="stream-item-row">
        <img src="${r.reporter_avatar || 'https://images.unsplash.com/photo-1534528741775?w=100&auto=format&fit=crop&q=80'}" class="stream-avatar" alt="Avatar">
        <div class="stream-author-outlet">
          <h5>${r.reporter_name}</h5>
          <p>${r.outlet_name || 'Outlet'}</p>
          <span style="font-size:10px; color:#94a3b8;">${r.division}</span>
        </div>
        <div>
          <span class="status-badge-pill ${statusClass}">
            <i data-feather="${statusIcon}" style="width:12px; height:12px;"></i> ${r.status}
          </span>
        </div>
        <div class="stream-desc-content">
          <h5>${r.title}</h5>
          <p>${r.description}</p>
          ${r.hold_reason ? `<span style="font-size:10.5px; color:#b45309; font-weight:700;">⚠️ Kendala: ${r.hold_reason}</span>` : ''}
        </div>
        <div class="stream-actions">
          ${proofBtn}
          <button class="btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="openQuickStatusUpdateModal('${r.id}')">
            Ubah Status
          </button>
        </div>
      </div>
    `;
  }).join('');

  // v81 FIX: debounced feather (rAF-batch) — no synchronous global scan
  window.debouncedFeatherReplace && window.debouncedFeatherReplace();
};

const filterDashboardReports = (status, btn) => {
  document.querySelectorAll('.reviews-tabs-nav .tab-pill-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderDashboardReportsStream(status);
};

// v81: renderStaffRatingsCards uses debounced feather
const renderStaffRatingsCards = (staffList) => {
  if (!isDashboardAdmin()) {
    const container = document.getElementById('dashboard-staff-ratings-list');
    if (container) {
      container.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">Leaderboard staff hanya tersedia untuk Super Admin.</p>';
    }
    return;
  }
  const container = document.getElementById('dashboard-staff-ratings-list');
  const kpiLeader = document.getElementById('kpi-leaderboard-list');
  if (!container && !kpiLeader) return;
  const html = staffList.slice(0, 3).map(s => {
    return `
      <div class="staff-rating-card">
        <div class="staff-header-info">
          <img src="${s.avatar_url}" class="staff-avatar-thumb" alt="${s.name}">
          <div class="staff-name-role">
            <h4>${s.name}</h4>
            <p>${s.role} • ${s.outlet_name || 'Outlet Pusat'}</p>
          </div>
          <div class="staff-score-badge">
            <i data-feather="star" style="width:12px; height:12px; fill:#fff;"></i> ${s.rating}
          </div>
        </div>
        <div class="staff-sub-metrics">
          <div class="sub-metric-col"><p class="lbl">Performance</p><p class="num">+21% ↑</p></div>
          <div class="sub-metric-col"><p class="lbl">Attendance</p><p class="num">+46% ↑</p></div>
          <div class="sub-metric-col"><p class="lbl">Ratings</p><p class="num">+8% ↑</p></div>
        </div>
      </div>
    `;
  }).join('');
  if (container) container.innerHTML = html;
  if (kpiLeader) kpiLeader.innerHTML = html;
  // v81 FIX: debounced feather
  window.debouncedFeatherReplace && window.debouncedFeatherReplace();
};

// ============ v81 FLICKER FIX: renderDailyReportBoard cacheKey diperluas ============
let __dailyReportBoardCache_ = null;
const renderDailyReportBoard = () => {
  const colProses = document.getElementById('kanban-col-proses');
  const colHold = document.getElementById('kanban-col-hold');
  const colSelesai = document.getElementById('kanban-col-selesai');
  if (!colProses) return;
  const viewEl = document.getElementById('view-daily-report');
  if (viewEl && !viewEl.classList.contains('active')) return;
  const divFilter = document.getElementById('report-filter-division')?.value || 'all';
  const statusFilter = document.getElementById('report-filter-status')?.value || 'all';
  const search = document.getElementById('report-search-box')?.value?.toLowerCase() || '';
  const gf = getGlobalFilters();
  // v81 FIX: cache signature diperluas — report_number & hold_reason juga dicek
  const cacheKey = JSON.stringify({
    count: (AppState.dailyReports || []).length,
    ids: (AppState.dailyReports || []).map(r =>
      r.id + ':' + r.status + ':' + (r.report_number || '') +
      ':' + ((r.hold_reason || '').slice(0, 8))
    ).join('|'),
    divFilter, statusFilter, search,
    mode: AppState.currentMode,
    outlet: gf.outlet, period: gf.period, gfSearch: gf.search
  });
  if (__dailyReportBoardCache_ === cacheKey) {
    return;
  }
  __dailyReportBoardCache_ = cacheKey;
  let list = AppState.dailyReports;
  if (AppState.currentMode === 'Management') {
    list = list.filter(r => r.type === 'Management');
  } else if (AppState.currentMode === 'Operasional') {
    list = list.filter(r => r.type !== 'Management');
  }
  if (gf.outlet !== 'all') list = list.filter(r => r.outlet_id === gf.outlet);
  list = list.filter(r => dateInPeriod_(r.created_at, gf.cutoff, gf.todayStr));
  if (gf.search) {
    list = list.filter(r => matchGlobalSearch_(gf.search, [r.title, r.report_number, r.description, r.reporter_name, r.outlet_name]));
  }
  if (divFilter !== 'all') list = list.filter(r => r.division === divFilter);
  if (statusFilter !== 'all') list = list.filter(r => r.status === statusFilter);
  if (search) list = list.filter(r => r.title.toLowerCase().includes(search) || r.report_number.toLowerCase().includes(search) || r.description.toLowerCase().includes(search));
  const prosesItems = list.filter(r => r.status === 'Proses');
  const holdItems = list.filter(r => r.status === 'Hold');
  const selesaiItems = list.filter(r => r.status === 'Selesai');
  document.getElementById('count-col-proses').textContent = prosesItems.length;
  document.getElementById('count-col-hold').textContent = holdItems.length;
  document.getElementById('count-col-selesai').textContent = selesaiItems.length;
  document.getElementById('badge-pending-reports').textContent = holdItems.length;
  const renderCard = (r) => {
    const proofTag = r.proof_file_url ? `
      <div style="margin-top:8px;">
        <button class="btn-proof-preview" onclick="openLightbox('${r.proof_file_url}', '${r.title}')">
          <i data-feather="check" style="width:12px; height:12px;"></i> Bukti Terlampir
        </button>
      </div>
    ` : '';
    return `
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:var(--shadow-sm);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:10px; font-weight:700; color:#64748b;">${r.report_number}</span>
          <span style="font-size:10.5px; font-weight:700; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${r.division}</span>
        </div>
        <h5 style="font-size:13px; font-weight:700; margin-bottom:4px;">${r.title}</h5>
        <p style="font-size:11.5px; color:#64748b; margin-bottom:8px;">${r.description}</p>
        ${r.hold_reason ? `<div style="font-size:11px; color:#b45309; background:#fffbeb; padding:6px 8px; border-radius:6px; margin-bottom:8px;"><strong>Kendala:</strong> ${r.hold_reason}</div>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#94a3b8; border-top:1px dashed #f1f5f9; padding-top:8px;">
          <span>👤 ${r.reporter_name}</span>
          <span>📍 ${r.outlet_name.split(' ')[1] || 'Outlet'}</span>
        </div>
        ${proofTag}
        <div style="display:flex; gap:6px; margin-top:10px;">
          ${r.status !== 'Proses' ? `<button class="btn-secondary" style="font-size:10.5px; padding:3px 8px;" onclick="quickUpdateReportStatus('${r.id}', 'Proses')">Ke Proses</button>` : ''}
          ${r.status !== 'Hold' ? `<button class="btn-secondary" style="font-size:10.5px; padding:3px 8px; color:#b45309;" onclick="promptHoldWithProof('${r.id}')">Hold (Wajib Bukti)</button>` : ''}
          ${r.status !== 'Selesai' ? `<button class="btn-primary" style="font-size:10.5px; padding:3px 8px; background:#10b981;" onclick="promptSelesaiWithProof('${r.id}')">Selesai (Wajib Bukti)</button>` : ''}
        </div>
      </div>
    `;
  };
  colProses.innerHTML = prosesItems.map(renderCard).join('') || '<p style="font-size:11.5px; color:#94a3b8; text-align:center;">Tidak ada tugas aktif.</p>';
  colHold.innerHTML = holdItems.map(renderCard).join('') || '<p style="font-size:11.5px; color:#94a3b8; text-align:center;">Tidak ada kendala tertunda.</p>';
  colSelesai.innerHTML = selesaiItems.map(renderCard).join('') || '<p style="font-size:11.5px; color:#94a3b8; text-align:center;">Belum ada tugas selesai.</p>';
  window.debouncedFeatherReplace && window.debouncedFeatherReplace();
};

const filterDailyReportBoard = () => {
  renderDailyReportBoard();
};

const openCreateReportModal = () => {
  document.getElementById('modal-report-title').textContent = 'Buat Laporan Operasional Baru';
  document.getElementById('rep-form-title').value = '';
  document.getElementById('rep-form-desc').value = '';
  document.getElementById('rep-form-status').value = 'Proses';
  document.getElementById('rep-form-hold-reason').value = '';
  document.getElementById('rep-form-proof-url').value = '';
  const f1 = document.getElementById('rep-form-file'); if (f1) f1.value = '';
  const f2 = document.getElementById('rep-form-file-camera'); if (f2) f2.value = '';
  document.getElementById('proof-preview-container').style.display = 'none';
  handleReportStatusChange('Proses');
  openModal('modal-report');
};

const handleReportStatusChange = (status) => {
  const section = document.getElementById('proof-upload-section');
  const holdGroup = document.getElementById('group-hold-reason');
  const label = document.getElementById('proof-instruction-label');
  if (status === 'Hold') {
    section.style.display = 'block';
    holdGroup.style.display = 'block';
    label.textContent = 'WAJIB Sertakan Bukti Foto/Dokumen & Alasan Kendala (Hold)!';
  } else if (status === 'Selesai') {
    section.style.display = 'block';
    holdGroup.style.display = 'none';
    label.textContent = 'WAJIB Sertakan Bukti Foto Dokumentasi Hasil Pekerjaan (Selesai)!';
  } else {
    section.style.display = 'none';
    holdGroup.style.display = 'none';
  }
};

const previewReportFile = async (input) => {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast('Ukuran file melebihi 5 MB. Pilih file lebih kecil.', 'error');
    input.value = '';
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  try {
    showToast('Mengunggah bukti file...', 'info');
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok && (data.status === 'success' || data.url)) {
      const url = data.url;
      document.getElementById('rep-form-proof-url').value = url;
      if (file.type.startsWith('image/')) {
        const previewImg = document.getElementById('proof-preview-img');
        previewImg.src = url;
        document.getElementById('proof-preview-container').style.display = 'block';
      } else {
        document.getElementById('proof-preview-container').style.display = 'none';
        showToast('PDF terunggah. Preview tidak tersedia utk PDF.', 'info');
      }
      showToast('Bukti berhasil diunggah!', 'success');
    } else {
      showToast(data.detail || 'Gagal mengunggah file bukti', 'error');
    }
  } catch (err) {
    showToast('Gagal mengunggah file bukti', 'error');
  }
};
window.previewReportFile = previewReportFile;

const submitDailyReportForm = async (e) => {
  e.preventDefault();
  const status = document.getElementById('rep-form-status').value;
  const proofUrl = document.getElementById('rep-form-proof-url').value;
  const holdReason = document.getElementById('rep-form-hold-reason').value;
  if ((status === 'Hold' || status === 'Selesai') && !proofUrl) {
    alert(`Status "${status}" WAJIB menyertakan bukti file/foto dokumentasi! Harap upload foto bukti terlebih dahulu.`);
    return;
  }
  if (status === 'Hold' && !holdReason.trim()) {
    alert('Status "Hold" wajib mencantumkan alasan kendala atau penundaan!');
    return;
  }
  const payload = {
    title: document.getElementById('rep-form-title').value,
    category: document.getElementById('rep-form-category').value,
    type: AppState.currentUser.type,
    division: AppState.currentUser.division,
    outlet_id: document.getElementById('rep-form-outlet').value,
    reporter_id: AppState.currentUser.id,
    description: document.getElementById('rep-form-desc').value,
    status: status,
    proof_file_url: proofUrl || null,
    proof_notes: document.getElementById('rep-form-proof-notes').value || null,
    hold_reason: status === 'Hold' ? holdReason : null,
    priority: document.getElementById('rep-form-priority').value,
    assigned_to: AppState.currentUser.name
  };
  try {
    const res = await fetch('/api/daily-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (res.ok) {
      showToast(`Laporan ${result.report_number} berhasil disimpan dengan status ${status}!`, 'success');
      closeModal('modal-report');
      await loadDailyReports();
    } else {
      alert(result.detail || 'Gagal menyimpan laporan.');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi server', 'error');
  }
};

AppState.__quickProof = { reportId: null, status: null };

const openQuickProofModal = (reportId, status) => {
  const r = (AppState.dailyReports || []).find(x => x.id === reportId);
  if (!r) { showToast('Laporan tidak ditemukan.', 'error'); return; }
  AppState.__quickProof = { reportId: reportId, status: status };
  document.getElementById('quick-proof-url').value = '';
  document.getElementById('quick-proof-hold-reason').value = '';
  document.getElementById('quick-proof-notes').value = '';
  document.getElementById('quick-proof-file').value = '';
  document.getElementById('quick-proof-file-camera').value = '';
  document.getElementById('quick-proof-preview-container').style.display = 'none';
  document.getElementById('quick-proof-preview-img').src = '';
  document.getElementById('quick-proof-title').textContent =
    status === 'Hold' ? 'Tandai Hold (Wajib Bukti)' : 'Tandai Selesai (Wajib Bukti)';
  document.getElementById('quick-proof-info').innerHTML =
    '<strong>Laporan:</strong> ' + (r.title || '(tanpa judul)') +
    '<br><strong>No:</strong> ' + (r.report_number || r.id) +
    '<br><strong>Pelapor:</strong> ' + (r.reporter_name || '-') +
    '<br><strong>Status saat ini:</strong> ' + (r.status || '-');
  const holdGroup = document.getElementById('quick-proof-hold-group');
  const fileLabel = document.getElementById('quick-proof-file-label');
  if (status === 'Hold') {
    holdGroup.style.display = 'block';
    fileLabel.textContent = 'Bukti Foto Kendala / Dokumen Penundaan';
  } else {
    holdGroup.style.display = 'none';
    fileLabel.textContent = 'Bukti Foto Hasil Pekerjaan';
  }
  const submitBtn = document.getElementById('btn-quick-proof-submit');
  if (status === 'Hold') {
    submitBtn.style.background = '#b45309';
    submitBtn.textContent = 'Kirim & Tandai Hold';
  } else {
    submitBtn.style.background = '#10b981';
    submitBtn.textContent = 'Kirim & Tandai Selesai';
  }
  openModal('modal-quick-proof');
  if (window.feather) setTimeout(() => feather.replace(), 50);
};
window.openQuickProofModal = openQuickProofModal;

const previewQuickProofFile = async (input) => {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast('Ukuran file melebihi 5 MB. Pilih file lebih kecil.', 'error');
    input.value = '';
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  try {
    showToast('Mengunggah bukti...', 'info');
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok && (data.status === 'success' || data.url)) {
      const url = data.url;
      document.getElementById('quick-proof-url').value = url;
      if (file.type.startsWith('image/')) {
        const previewImg = document.getElementById('quick-proof-preview-img');
        previewImg.src = url;
        document.getElementById('quick-proof-preview-container').style.display = 'block';
      } else {
        document.getElementById('quick-proof-preview-container').style.display = 'none';
        showToast('PDF terunggah. Preview tidak tersedia utk PDF.', 'info');
      }
      showToast('Bukti berhasil diunggah!', 'success');
    } else {
      showToast(data.detail || 'Gagal mengunggah bukti', 'error');
    }
  } catch (err) {
    showToast('Gagal mengunggah bukti: koneksi terputus', 'error');
  }
};
window.previewQuickProofFile = previewQuickProofFile;

const submitQuickProof = async () => {
  const { reportId, status } = AppState.__quickProof;
  if (!reportId || !status) { showToast('Sesi bukti tidak valid. Tutup & coba lagi.', 'error'); return; }
  const proofUrl = document.getElementById('quick-proof-url').value;
  const holdReason = document.getElementById('quick-proof-hold-reason').value.trim();
  const notes = document.getElementById('quick-proof-notes').value.trim();
  if (!proofUrl) {
    showToast('Bukti wajib diunggah. Ambil foto atau pilih file dulu.', 'warning');
    return;
  }
  if (status === 'Hold' && !holdReason) {
    showToast('Status Hold wajib mencantumkan alasan kendala.', 'warning');
    return;
  }
  const submitBtn = document.getElementById('btn-quick-proof-submit');
  const origText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Mengirim...';
  try {
    await updateReportStatusDirect(reportId, status, proofUrl, notes || null, status === 'Hold' ? holdReason : null);
    closeModal('modal-quick-proof');
  } catch (err) {
    showToast('Gagal mengubah status: ' + (err.message || 'kesalahan server'), 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = origText;
  }
};
window.submitQuickProof = submitQuickProof;

const promptHoldWithProof = (reportId) => { openQuickProofModal(reportId, 'Hold'); };
window.promptHoldWithProof = promptHoldWithProof;

const promptSelesaiWithProof = (reportId) => { openQuickProofModal(reportId, 'Selesai'); };
window.promptSelesaiWithProof = promptSelesaiWithProof;

const quickUpdateReportStatus = (reportId, newStatus) => {
  updateReportStatusDirect(reportId, newStatus, null, null, null);
};

const updateReportStatusDirect = async (reportId, status, proofUrl, proofNotes, holdReason) => {
  try {
    const res = await fetch(`/api/daily-reports/${reportId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status, proof_file_url: proofUrl, proof_notes: proofNotes, hold_reason: holdReason })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Status tugas diubah menjadi ${status}!`, 'success');
      await loadDailyReports();
    } else {
      alert(data.detail || 'Gagal mengubah status');
    }
  } catch (err) {
    showToast('Gagal menghubungi server', 'error');
  }
};

// ================= PRESENSI GPS & SELFIE CAMERA =================
window.detectDeviceGPS = () => {
  if (!navigator.geolocation) {
    AppState.gpsOk = false;
    AppState.gpsLastError = 'Browser tidak mendukung deteksi lokasi.';
    window.checkGpsDistance();
    return;
  }
  if (AppState.gpsLoading) return;
  AppState.gpsLoading = true;
  AppState.gpsReadings = [];
  window.checkGpsDistance();
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      AppState.deviceCoordinates = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      AppState.gpsAccuracy = pos.coords.accuracy || 0;
      AppState.gpsOk = true;
      AppState.gpsLoading = false;
      AppState.gpsLastError = '';
      AppState.isMockSuspect = 0;
      if (AppState.gpsAccuracy > 0 && AppState.gpsAccuracy < 3) {
        AppState.isMockSuspect = 1;
        console.warn('⚠️ GPS accuracy mencurigakan (< 3m):', AppState.gpsAccuracy, 'm');
      }
      if (AppState.gpsAccuracy === 0) {
        AppState.isMockSuspect = 1;
        console.warn('⚠️ GPS accuracy = 0, kemungkinan mock location');
      }
      if (pos.coords.latitude === 0 && pos.coords.longitude === 0) {
        AppState.isMockSuspect = 1;
        AppState.gpsOk = false;
        AppState.gpsLastError = 'Lokasi tidak dapat dideteksi. Pastikan GPS aktif, berada di area terbuka, lalu coba lagi.';
        console.warn('⚠️ Koordinat GPS (0,0) — tidak valid');
      }
      setTimeout(() => {
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            const drift = calculateHaversine(
              pos.coords.latitude, pos.coords.longitude,
              pos2.coords.latitude, pos2.coords.longitude
            );
            if (drift === 0 && pos.coords.latitude === pos2.coords.latitude && pos.coords.longitude === pos2.coords.longitude) {
              AppState.isMockSuspect = 1;
              console.warn('⚠️ GPS drift = 0m antara 2 reading — kemungkinan mock location (koordinat tidak berubah)');
            }
            const acc2 = pos2.coords.accuracy || 0;
            if (acc2 >= 3 && acc2 <= 100) {
              if (AppState.isMockSuspect) console.warn('✅ Reading kedua sehat (akurasi ' + acc2 + 'm) — flag mencurigakan dihapus');
              AppState.isMockSuspect = 0;
            } else if (acc2 > 0 && acc2 < 3) {
              AppState.isMockSuspect = 1;
            }
            AppState.deviceCoordinates = { lat: pos2.coords.latitude, lon: pos2.coords.longitude };
            AppState.gpsAccuracy = acc2 || AppState.gpsAccuracy;
            window.checkGpsDistance();
          },
          () => { /* abaikan error reading kedua */ },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }, 2000);
      window.checkGpsDistance();
    },
    (err) => {
      AppState.gpsOk = false;
      AppState.gpsLoading = false;
      const messages = {
        1: 'Akses lokasi ditolak. Silakan izinkan lokasi di pengaturan browser, lalu muat ulang halaman.',
        2: 'Lokasi tidak tersedia. Pastikan GPS perangkat aktif dan sinyal cukup kuat.',
        3: 'Permintaan lokasi timeout. Coba lagi dalam beberapa detik.'
      };
      AppState.gpsLastError = messages[err.code] || (err.message || 'Gagal mendapatkan lokasi.');
      console.warn('GPS error:', AppState.gpsLastError);
      window.checkGpsDistance();
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
};
const detectDeviceGPS = window.detectDeviceGPS;

const updateAttendanceClock = () => {
  const clockEl = document.getElementById('camera-clock');
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('id-ID') + ' WIB';
  }
  const gpsDisplay = document.getElementById('camera-gps-display');
  if (gpsDisplay) {
    if (AppState.gpsOk) {
      let txt = AppState.deviceCoordinates.lat.toFixed(6) + ', ' + AppState.deviceCoordinates.lon.toFixed(6);
      if (AppState.gpsAccuracy > 0) txt += ' (±' + AppState.gpsAccuracy + 'm)';
      if (AppState.isMockSuspect) txt += ' ⚠️ Perlu Verifikasi';
      gpsDisplay.textContent = txt;
    } else {
      gpsDisplay.textContent = 'belum diketahui';
    }
  }
};

window.startCamera = async () => {
  const video = document.getElementById('camera-feed');
  if (!video) return;
  if (AppState.cameraLoading || AppState.cameraReady) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Browser tidak mendukung akses kamera. Gunakan tombol kamera HP saat presensi.', 'warning');
    setFaceStatus('idle', 'Kamera tidak didukung browser');
    return;
  }
  AppState.cameraLoading = true;
  setFaceStatus('loading');
  const btn = document.getElementById('btn-submit-checkin');
  try {
    AppState.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    });
    video.srcObject = AppState.cameraStream;
    await new Promise((resolve) => {
      if (video.readyState >= 2) return resolve();
      video.onloadedmetadata = () => resolve();
      setTimeout(resolve, 3000);
    });
    AppState.cameraReady = true;
    AppState.cameraLoading = false;
    try {
      if ('FaceDetector' in window) {
        AppState.faceDetection.detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        AppState.faceDetection.apiAvailable = true;
      }
    } catch (e) { /* FaceDetector tidak tersedia — pakai fallback heuristik */ }
    startFaceDetection();
  } catch (err) {
    AppState.cameraReady = false;
    AppState.cameraLoading = false;
    stopFaceDetection();
    const msg = (err && err.name === 'NotAllowedError')
      ? 'Akses kamera ditolak. Izinkan kamera di browser (ikon gembok di address bar), lalu keluar-masuk panel Presensi lagi.'
      : 'Kamera tidak tersedia. Anda bisa presensi dengan kamera HP saat klik tombol presensi.';
    console.warn('Camera error:', err && err.message);
    setFaceStatus('idle', (err && err.name === 'NotAllowedError') ? 'Kamera ditolak — izinkan akses di browser' : 'Kamera tidak tersedia');
    showToast(msg, 'warning');
  }
};
const startCamera = window.startCamera;

const stopCamera = () => {
  if (AppState.cameraStream) {
    try { AppState.cameraStream.getTracks().forEach(track => track.stop()); } catch (e) { /* ignored */ }
    AppState.cameraStream = null;
  }
  AppState.cameraReady = false;
  AppState.cameraLoading = false;
  stopFaceDetection();
  const video = document.getElementById('camera-feed');
  if (video) video.srcObject = null;
  setFaceStatus('idle');
};

AppState.faceDetection = { timer: null, detector: null, apiAvailable: false, seekingCount: 0, okCount: 0 };

const FACE_STATUS_STYLES = {
  idle:    { bg: '#f1f5f9', border: '#e2e8f0', text: '#64748b', icon: '📷', label: 'Kamera belum aktif' },
  loading: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: '⏳', label: 'Membuka kamera...' },
  seeking: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', icon: '🙂', label: 'Cari wajah — posisikan wajah di dalam ring' },
  ok:      { bg: '#ecfdf5', border: '#10b981', text: '#065f46', icon: '✅', label: 'Wajah sesuai posisi — siap presensi!' }
};

const setFaceStatus = (state, customLabel) => {
  const s = FACE_STATUS_STYLES[state] || FACE_STATUS_STYLES.idle;
  const box = document.getElementById('face-status-indicator');
  const iconEl = document.getElementById('face-status-icon');
  const textEl = document.getElementById('face-status-text');
  const ring = document.getElementById('face-ring-overlay');
  if (box) {
    box.style.background = s.bg;
    box.style.borderColor = s.border;
  }
  if (textEl) {
    textEl.textContent = customLabel || s.label;
    textEl.style.color = s.text;
  }
  if (iconEl) iconEl.textContent = s.icon;
  if (ring) {
    if (state === 'ok') {
      ring.style.borderColor = '#10b981';
      ring.style.borderStyle = 'solid';
      ring.style.boxShadow = '0 0 18px rgba(16, 185, 129, 0.65)';
    } else if (state === 'seeking') {
      ring.style.borderColor = 'rgba(252, 211, 77, 0.9)';
      ring.style.borderStyle = 'dashed';
      ring.style.boxShadow = 'none';
    } else {
      ring.style.borderColor = 'rgba(255,255,255,0.55)';
      ring.style.borderStyle = 'dashed';
      ring.style.boxShadow = 'none';
    }
  }
};

const detectFaceHeuristic_ = (video) => {
  const canvas = document.getElementById('face-detect-canvas');
  if (!canvas) return false;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(
      canvas.width * 0.2, canvas.height * 0.1,
      canvas.width * 0.6, canvas.height * 0.8
    ).data;
    let skin = 0, total = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 80 && g > 40 && b > 20 && r > g && g > b && (r - b) > 12 && (r - g) > 8) skin++;
    }
    const pct = (skin / total) * 100;
    return pct > 14;
  } catch (e) {
    return false;
  }
};

const detectFaceNative_ = async (video) => {
  if (!AppState.faceDetection.detector) return null;
  try {
    const faces = await AppState.faceDetection.detector.detect(video);
    return faces && faces.length > 0;
  } catch (e) {
    return null;
  }
};

const updateFaceIndicator = async () => {
  if (!AppState.cameraReady || !AppState.cameraStream) return;
  const video = document.getElementById('camera-feed');
  if (!video || !video.videoWidth) return;
  let hasFace = null;
  if (AppState.faceDetection.apiAvailable) {
    hasFace = await detectFaceNative_(video);
  }
  if (hasFace === null || hasFace === undefined) {
    hasFace = detectFaceHeuristic_(video);
  }
  if (hasFace) {
    AppState.faceDetection.okCount++;
    AppState.faceDetection.seekingCount = 0;
  } else {
    AppState.faceDetection.seekingCount++;
    AppState.faceDetection.okCount = 0;
  }
  if (AppState.faceDetection.okCount >= 2) {
    setFaceStatus('ok');
  } else if (AppState.faceDetection.seekingCount >= 1) {
    setFaceStatus('seeking');
  }
};

const startFaceDetection = () => {
  if (AppState.faceDetection.timer) return;
  AppState.faceDetection.okCount = 0;
  AppState.faceDetection.seekingCount = 0;
  setFaceStatus('seeking');
  AppState.faceDetection.timer = setInterval(updateFaceIndicator, 400);
};

const stopFaceDetection = () => {
  if (AppState.faceDetection.timer) {
    clearInterval(AppState.faceDetection.timer);
    AppState.faceDetection.timer = null;
  }
  AppState.faceDetection.detector = null;
  AppState.faceDetection.apiAvailable = false;
  AppState.faceDetection.okCount = 0;
  AppState.faceDetection.seekingCount = 0;
};

const calculateHaversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
};

const GEOFENCE_TOLERANCE_METERS = 5;

window.setPresensiButtonsEnabled = (enabled) => {
  const checkInBtn = document.getElementById('btn-submit-checkin');
  const checkOutBtn = document.getElementById('btn-submit-checkout');
  [checkInBtn, checkOutBtn].forEach(btn => {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '1' : '0.55';
    btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  });
};
const setPresensiButtonsEnabled = window.setPresensiButtonsEnabled;

window.getPresensiLocationState = () => {
  if (isGeofenceExemptUser_()) {
    const outletSelect = document.getElementById('presensi-outlet-select');
    const outletId = outletSelect ? outletSelect.value : '';
    const outlet = (AppState.outlets || []).find(o => String(o.id) === String(outletId));
    return { ok: true, outlet: outlet || null, dist: 0, radius: 0, effectiveLimit: 0, bypass: true };
  }
  const outletSelect = document.getElementById('presensi-outlet-select');
  const outletId = outletSelect ? outletSelect.value : '';
  const outlet = (AppState.outlets || []).find(o => String(o.id) === String(outletId));
  if (!outlet) return { ok: false, reason: 'no_outlet' };
  if (!AppState.gpsOk) return { ok: false, reason: 'gps_not_ready' };
  const oLat = parseFloat(outlet.lat), oLon = parseFloat(outlet.lon);
  if (isNaN(oLat) || isNaN(oLon)) return { ok: false, reason: 'outlet_no_coords', outlet };
  const radius = Number(outlet.radius_meters) || 100;
  const effectiveLimit = radius + GEOFENCE_TOLERANCE_METERS;
  const dist = calculateHaversine(AppState.deviceCoordinates.lat, AppState.deviceCoordinates.lon, oLat, oLon);
  let nearestOutlet = null, nearestDist = Infinity;
  (AppState.outlets || []).forEach(function (o) {
    const nLat = parseFloat(o.lat), nLon = parseFloat(o.lon);
    if (isNaN(nLat) || isNaN(nLon)) return;
    const d = calculateHaversine(AppState.deviceCoordinates.lat, AppState.deviceCoordinates.lon, nLat, nLon);
    if (d < nearestDist) { nearestDist = d; nearestOutlet = o; }
  });
  if (dist <= effectiveLimit) {
    return { ok: true, outlet, dist, radius, effectiveLimit };
  }
  return { ok: false, reason: 'out_of_radius', outlet, dist, radius, effectiveLimit, nearestOutlet, nearestDist };
};
const getPresensiLocationState = window.getPresensiLocationState;

window.checkGpsDistance = () => {
  const outletSelect = document.getElementById('presensi-outlet-select');
  const banner = document.getElementById('geofence-status-banner');
  const text = document.getElementById('geofence-text');
  const icon = document.getElementById('geofence-icon');
  if (!outletSelect || !banner || !text) return;
  setPresensiButtonsEnabled(false);
  if (isGeofenceExemptUser_()) {
    banner.className = 'geofence-alert geofence-valid';
    const u = AppState.currentUser || {};
    const reason = MANAGEMENT_DIVISIONS.indexOf(u.division) >= 0
      ? 'Akun Management — bebas presensi dari kantor/outlet manapun'
      : 'Akun dikecualikan (presensi fleksibel)';
    text.innerHTML = `<strong>✅ Mode Presensi Fleksibel</strong>
      <br><span style="font-size:12px; opacity:0.9;">${reason}. Jam presensi mengikuti shift terpilih.
      <br>Pilih outlet terdekat dgn lokasi Anda (opsional — hanya utk informasi record).</span>`;
    setPresensiButtonsEnabled(true);
    if (window.feather) feather.replace();
    return;
  }
  if (AppState.outletsLoadError) {
    banner.className = 'geofence-alert geofence-invalid';
    text.innerHTML = `<strong>Gagal memuat daftar outlet:</strong> ${AppState.outletsLoadError}
      <br><button type="button" class="btn-secondary" style="margin-top:6px; padding:5px 10px; font-size:11px; margin-right:4px;" onclick="window.retryLoadOutlets && window.retryLoadOutlets()">
        <i data-feather="refresh-cw" style="width:11px; height:11px;"></i> Coba Muat Ulang
      </button>
      <button type="button" class="btn-secondary" style="margin-top:6px; padding:5px 10px; font-size:11px; background:#eff6ff; color:#1e40af; border-color:#bfdbfe;" onclick="window.diagnosePresensi && window.diagnosePresensi()">
        <i data-feather="activity" style="width:11px; height:11px;"></i> Diagnosa Masalah
      </button>`;
    if (window.feather) feather.replace();
    return;
  }
  if (!AppState.outlets || AppState.outlets.length === 0) {
    banner.className = 'geofence-alert geofence-warning';
    text.innerHTML = '<strong>Memuat daftar outlet...</strong> Mohon tunggu sebentar.';
    return;
  }
  const outlet = AppState.outlets.find(o => o.id === outletSelect.value) || AppState.outlets[0];
  if (!outlet) {
    banner.className = 'geofence-alert geofence-invalid';
    text.innerHTML = '<strong>Tidak ada outlet.</strong> Hubungi admin untuk menambahkan outlet.';
    return;
  }
  if (AppState.gpsLoading) {
    banner.className = 'geofence-alert geofence-warning';
    text.innerHTML = '<strong>Mendeteksi lokasi GPS...</strong> Pastikan GPS perangkat aktif.';
    return;
  }
  if (!AppState.gpsOk) {
    banner.className = 'geofence-alert geofence-invalid';
    text.innerHTML = `<strong>GPS belum aktif:</strong> ${AppState.gpsLastError || 'Izinkan akses lokasi pada browser, lalu tekan tombol "Deteksi Lokasi GPS".'}
      <br><button type="button" class="btn-secondary" style="margin-top:6px; padding:5px 10px; font-size:11px;" onclick="window.detectDeviceGPS()">
        <i data-feather="map-pin" style="width:11px; height:11px;"></i> Deteksi Ulang Lokasi GPS
      </button>`;
    if (window.feather) feather.replace();
    return;
  }
  if (AppState.isMockSuspect) {
    banner.className = 'geofence-alert geofence-invalid';
    text.innerHTML = `<strong>📍 Lokasi Anda Tidak Sesuai</strong>
      <br>Sistem tidak dapat memverifikasi bahwa Anda sedang berada di outlet.
      <br><span style="font-size:11px; color:#991b1b;">Pastikan Anda berada di outlet, aktifkan GPS, dan matikan aplikasi lokasi palsu (jika ada), lalu tekan tombol di bawah.</span>
      <br><button type="button" class="btn-secondary" style="margin-top:6px; padding:5px 10px; font-size:11px;" onclick="window.detectDeviceGPS()">
        <i data-feather="map-pin" style="width:11px; height:11px;"></i> Deteksi Ulang Lokasi
      </button>`;
    if (window.feather) feather.replace();
    return;
  }
  const accuracyInfo = AppState.gpsAccuracy > 0 ? ` <span style="font-size:10px; color:#94a3b8;">(Akurasi: ±${AppState.gpsAccuracy}m)</span>` : '';
  const parseLat = parseFloat(outlet.lat);
  const parseLon = parseFloat(outlet.lon);
  if (isNaN(parseLat) || isNaN(parseLon)) {
    banner.className = 'geofence-alert geofence-warning';
    text.innerHTML = `<strong>${outlet.name}</strong> dipilih. Koordinat GPS outlet belum lengkap. Hubungi admin untuk mengisi latitude/longitude outlet. Presensi tidak dapat dilakukan sampai koordinat outlet diatur.`;
    return;
  }
  outlet.lat = parseLat;
  outlet.lon = parseLon;
  let nearestOutlet = null;
  let nearestDist = Infinity;
  let nearestValid = false;
  AppState.outlets.forEach(function (o) {
    const oLat = parseFloat(o.lat);
    const oLon = parseFloat(o.lon);
    if (isNaN(oLat) || isNaN(oLon)) return;
    o.lat = oLat; o.lon = oLon;
    const d = calculateHaversine(AppState.deviceCoordinates.lat, AppState.deviceCoordinates.lon, oLat, oLon);
    if (d < nearestDist) {
      nearestDist = d;
      nearestOutlet = o;
      nearestValid = d <= ((o.radius_meters || 100) + GEOFENCE_TOLERANCE_METERS);
    }
  });
  if (nearestOutlet && nearestValid && nearestOutlet.id !== outletSelect.value) {
    outletSelect.value = nearestOutlet.id;
    const autoOutlet = nearestOutlet;
    banner.className = 'geofence-alert geofence-valid';
    text.innerHTML = `<strong>📍 Auto-Terdeteksi di Lokasi:</strong> ${autoOutlet.name} (${nearestDist} meter)
      <br><span style="font-size:11px; opacity:0.8;">Outlet terdekat terpilih otomatis berdasarkan GPS Anda. Tombol presensi diaktifkan.</span>`;
    setPresensiButtonsEnabled(true);
    if (window.feather) feather.replace();
    return;
  }
  const dist = calculateHaversine(AppState.deviceCoordinates.lat, AppState.deviceCoordinates.lon, outlet.lat, outlet.lon);
  const radiusLimit = outlet.radius_meters || 100;
  const isValid = dist <= (radiusLimit + GEOFENCE_TOLERANCE_METERS);
  if (isValid) {
    let closerOutlet = null;
    let closerDist = dist;
    AppState.outlets.forEach(function (o) {
      if (typeof o.lat !== 'number' || typeof o.lon !== 'number') return;
      if (o.id === outlet.id) return;
      const d = calculateHaversine(AppState.deviceCoordinates.lat, AppState.deviceCoordinates.lon, o.lat, o.lon);
      if (d < closerDist && d <= ((o.radius_meters || 100) + GEOFENCE_TOLERANCE_METERS)) {
        closerDist = d;
        closerOutlet = o;
      }
    });
    if (closerOutlet) {
      banner.className = 'geofence-alert geofence-valid';
      text.innerHTML = `<strong>Tervalidasi di ${outlet.name}:</strong> ${dist} meter (Radius: ${radiusLimit}m).
        <br><span style="font-size:11px; opacity:0.8;">💡 Anda juga dekat dengan <strong>${closerOutlet.name}</strong> (${closerDist}m). <a href="javascript:void(0)" style="color:inherit; text-decoration:underline;" onclick="document.getElementById('presensi-outlet-select').value='${closerOutlet.id}'; window.checkGpsDistance();">Pilih ${closerOutlet.name}</a></span>`;
    } else {
      banner.className = 'geofence-alert geofence-valid';
      text.innerHTML = `<strong>Tervalidasi di Lokasi:</strong> ${dist} meter dari ${outlet.name} (Batas Radius: ${radiusLimit}m)${accuracyInfo} — <strong>Valid Untuk Presensi</strong>`;
    }
    setPresensiButtonsEnabled(true);
  } else {
    if (nearestOutlet && nearestValid) {
      banner.className = 'geofence-alert geofence-warning';
      text.innerHTML = `<strong>Anda berada di ${nearestOutlet.name}:</strong> ${nearestDist} meter (Radius: ${nearestOutlet.radius_meters}m).
        <br>Outlet yang dipilih (${outlet.name}) berjarak ${dist} meter — <strong>di luar radius. Presensi DITOLAK untuk outlet ini.</strong>
        <br><a href="javascript:void(0)" style="color:inherit; text-decoration:underline; font-weight:700;" onclick="document.getElementById('presensi-outlet-select').value='${nearestOutlet.id}'; window.checkGpsDistance();">📍 Pilih ${nearestOutlet.name} secara otomatis</a>`;
    } else {
      banner.className = 'geofence-alert geofence-invalid';
      text.innerHTML = `<strong>🚫 Di Luar Radius — Presensi DITOLAK:</strong> Anda berada ${dist} meter dari ${outlet.name} (Batas Radius: ${radiusLimit}m).
        <br><span style="font-size:11px; opacity:0.8;">Outlet terdekat: ${nearestOutlet ? nearestOutlet.name + ' (' + nearestDist + 'm)' : 'tidak ditemukan'}.</span>
        <br><em>Mendekatlah ke lokasi outlet untuk melakukan presensi.</em>`;
    }
    setPresensiButtonsEnabled(false);
  }
};
const checkGpsDistance = window.checkGpsDistance;

window.retryLoadOutlets = async () => {
  AppState.outletsLoadError = '';
  window.checkGpsDistance && window.checkGpsDistance();
  await loadOutlets();
};

const captureSelfieSnapshot = () => {
  const video = document.getElementById('camera-feed');
  const canvas = document.getElementById('camera-snapshot-canvas');
  if (!video || !canvas) return null;
  if (!AppState.cameraReady || !AppState.cameraStream || !video.videoWidth) return null;
  canvas.width = video.videoWidth || 480;
  canvas.height = video.videoHeight || 360;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(10, canvas.height - 40, canvas.width - 20, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText(`GPS: ${AppState.deviceCoordinates.lat.toFixed(4)}, ${AppState.deviceCoordinates.lon.toFixed(4)} | ${new Date().toLocaleString('id-ID')}`, 20, canvas.height - 20);
  return canvas.toDataURL('image/jpeg', 0.85);
};

const captureSelfieViaNativeCamera = () => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture', 'user');
  let done = false;
  const finish = (v) => { if (!done) { done = true; resolve(v); } };
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (!f) return finish(null);
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc);
      c.height = Math.round(img.height * sc);
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, c.width, c.height);
      x.fillStyle = 'rgba(0, 0, 0, 0.65)';
      x.fillRect(10, c.height - 40, c.width - 20, 30);
      x.fillStyle = '#ffffff';
      x.font = '12px sans-serif';
      x.fillText(`GPS: ${AppState.deviceCoordinates.lat.toFixed(4)}, ${AppState.deviceCoordinates.lon.toFixed(4)} | ${new Date().toLocaleString('id-ID')}`, 20, c.height - 20);
      finish(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => finish(null);
    img.src = URL.createObjectURL(f);
  };
  input.addEventListener('cancel', () => finish(null));
  input.click();
});

window.submitAttendanceCheckIn = async () => {
  const outletSelect = document.getElementById('presensi-outlet-select');
  const shiftSelect = document.getElementById('presensi-shift-select');
  const submitBtn = document.getElementById('btn-submit-checkin');
  if (!outletSelect || !shiftSelect) {
    showToast('Form presensi tidak ditemukan. Muat ulang halaman.', 'error');
    return;
  }
  const outletId = outletSelect.value;
  const shiftName = shiftSelect.value;
  if (!outletId) {
    showToast('Pilih outlet terlebih dahulu.', 'warning');
    return;
  }
  if (!AppState.currentUser || !AppState.currentUser.id) {
    showToast('Sesi login tidak ditemukan. Silakan login kembali.', 'error');
    return;
  }
  if (!AppState.gpsOk) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mendeteksi GPS...'; }
    window.detectDeviceGPS();
    let waited = 0;
    while (AppState.gpsLoading && waited < 8000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
    }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="check-circle"></i> AMBIL SELFIE & PRESENSI MASUK'; if (window.feather) feather.replace(); }
    if (!AppState.gpsOk) {
      showToast('Lokasi GPS belum tersedia. Pastikan GPS aktif dan izin lokasi diberikan, lalu coba lagi.', 'warning');
      return;
    }
  }
  const locState = getPresensiLocationState();
  if (locState.reason === 'no_outlet') {
    showToast('Pilih outlet presensi terlebih dahulu.', 'warning');
    return;
  }
  if (locState.reason === 'gps_not_ready') {
    showToast('GPS belum siap. Tekan tombol "Deteksi Lokasi GPS" lalu coba lagi.', 'warning');
    return;
  }
  if (locState.reason === 'outlet_no_coords') {
    showToast('Koordinat GPS outlet belum diatur. Hubungi admin.', 'error');
    return;
  }
  if (locState.reason === 'out_of_radius' || !locState.ok) {
    const msg = locState.outlet
      ? `Presensi DITOLAK. Anda berada ${locState.dist}m dari ${locState.outlet.name} (batas radius: ${locState.radius}m). Mendekatlah ke outlet lalu coba lagi.`
      : 'Presensi DITOLAK. Anda berada di luar radius outlet. Mendekatlah ke lokasi outlet lalu coba lagi.';
    showToast(msg, 'error');
    window.checkGpsDistance && window.checkGpsDistance();
    return;
  }
  if (!AppState.cameraReady) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Memulai kamera...'; }
    await window.startCamera();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="check-circle"></i> AMBIL SELFIE & PRESENSI MASUK'; if (window.feather) feather.replace(); }
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengambil foto...'; }
  let selfieBase64 = captureSelfieSnapshot();
  if (!selfieBase64) {
    showToast('Kamera halaman tidak siap. Buka kamera HP untuk ambil selfie.', 'info');
    selfieBase64 = await captureSelfieViaNativeCamera();
  }
  if (!selfieBase64) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="check-circle"></i> AMBIL SELFIE & PRESENSI MASUK'; if (window.feather) feather.replace(); }
    showToast('Foto selfie wajib diambil. Coba lagi, atau izinkan akses kamera di pengaturan browser.', 'warning');
    return;
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengirim presensi...'; }
  showToast('Memverifikasi GPS & wajah selfie...', 'info');
  try {
    const res = await fetch('/api/attendance/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: AppState.currentUser.id,
        outlet_id: outletId,
        lat: AppState.deviceCoordinates.lat,
        lon: AppState.deviceCoordinates.lon,
        gps_accuracy: AppState.gpsAccuracy || 0,
        is_mock_suspect: AppState.isMockSuspect || 0,
        selfie_base64: selfieBase64,
        shift_name: shiftName,
        notes: 'Presensi Selfie Mandiri'
      })
    });
    const data = await res.json();
    if (res.ok && data.status !== 'error') {
      showToast(`Presensi berhasil! Status: ${data.attendance_status}${data.late_minutes ? ' (Terlambat ' + data.late_minutes + ' menit)' : ' (Tepat Waktu)'}`, 'success');
      await loadAttendanceLogs();
    } else {
      showToast(data.detail || data.message || 'Gagal check-in. Coba beberapa saat lagi.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi saat check-in. Periksa internet Anda.', 'error');
    console.error('Check-in error:', err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-feather="check-circle"></i> AMBIL SELFIE & PRESENSI MASUK';
      if (window.feather) feather.replace();
    }
  }
};
const submitAttendanceCheckIn = window.submitAttendanceCheckIn;

window.submitAttendanceCheckOut = async () => {
  const submitBtn = document.getElementById('btn-submit-checkout');
  if (!AppState.currentUser || !AppState.currentUser.id) {
    showToast('Sesi login tidak ditemukan. Silakan login kembali.', 'error');
    return;
  }
  if (!AppState.attendanceLogs || AppState.attendanceLogs.length === 0) {
    await loadAttendanceLogs();
  }
  const today = new Date().toISOString().split('T')[0];
  const myCheckInToday = (AppState.attendanceLogs || []).find(l =>
    l.employee_id === AppState.currentUser.id && l.date === today && l.check_in_time
  );
  if (!myCheckInToday) {
    showToast('Anda belum presensi masuk hari ini. Lakukan presensi masuk terlebih dahulu sebelum pulang.', 'warning');
    return;
  }
  if (myCheckInToday.check_out_time) {
    showToast(`Anda sudah presensi pulang hari ini pada ${myCheckInToday.check_out_time.split(' ')[1] || myCheckInToday.check_out_time}.`, 'info');
    return;
  }
  if (!AppState.gpsOk) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mendeteksi GPS...'; }
    window.detectDeviceGPS();
    let waited = 0;
    while (AppState.gpsLoading && waited < 8000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
    }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="log-out" style="width:16px; height:16px;"></i> AMBIL SELFIE & PRESENSI PULANG'; if (window.feather) feather.replace(); }
    if (!AppState.gpsOk) {
      showToast('Lokasi GPS belum tersedia. Pastikan GPS aktif dan izin lokasi diberikan, lalu coba lagi.', 'warning');
      return;
    }
  }
  if (!isGeofenceExemptUser_()) {
    const checkInOutlet = (AppState.outlets || []).find(o => String(o.id) === String(myCheckInToday.outlet_id));
    if (checkInOutlet) {
      const coLat = parseFloat(checkInOutlet.lat), coLon = parseFloat(checkInOutlet.lon);
      const coRadius = Number(checkInOutlet.radius_meters) || 100;
      if (!isNaN(coLat) && !isNaN(coLon)) {
        const coDist = calculateHaversine(AppState.deviceCoordinates.lat, AppState.deviceCoordinates.lon, coLat, coLon);
        if (coDist > (coRadius + GEOFENCE_TOLERANCE_METERS)) {
          showToast(`Presensi pulang DITOLAK. Anda berada ${coDist}m dari ${checkInOutlet.name} (batas radius: ${coRadius}m). Mendekatlah ke outlet tempat Anda presensi masuk lalu coba lagi.`, 'error');
          return;
        }
      }
    }
  }
  if (!AppState.cameraReady) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Memulai kamera...'; }
    await window.startCamera();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="log-out" style="width:16px; height:16px;"></i> AMBIL SELFIE & PRESENSI PULANG'; if (window.feather) feather.replace(); }
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengambil foto...'; }
  let selfieBase64 = captureSelfieSnapshot();
  if (!selfieBase64) {
    showToast('Kamera halaman tidak siap. Buka kamera HP untuk ambil selfie pulang.', 'info');
    selfieBase64 = await captureSelfieViaNativeCamera();
  }
  if (!selfieBase64) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="log-out" style="width:16px; height:16px;"></i> AMBIL SELFIE & PRESENSI PULANG'; if (window.feather) feather.replace(); }
    showToast('Foto selfie wajib diambil untuk presensi pulang.', 'warning');
    return;
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengirim presensi pulang...'; }
  showToast('Memverifikasi GPS & menyimpan presensi pulang...', 'info');
  try {
    const res = await fetch('/api/attendance/check-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attendance_id: myCheckInToday.id,
        employee_id: AppState.currentUser.id,
        lat: AppState.deviceCoordinates.lat,
        lon: AppState.deviceCoordinates.lon,
        selfie_base64: selfieBase64,
        notes: 'Presensi Pulang (Check-out) Mandiri'
      })
    });
    const data = await res.json();
    if (res.ok && data.status !== 'error') {
      const otMsg = data.overtime_hours > 0 ? ` (+${data.overtime_hours} jam lembur)` : '';
      showToast(`Presensi pulang berhasil! Jam pulang: ${data.check_out_time ? data.check_out_time.split(' ')[1] || data.check_out_time : '-'}${otMsg}`, 'success');
      await loadAttendanceLogs();
    } else {
      showToast(data.detail || data.message || 'Gagal check-out. Coba beberapa saat lagi.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi saat check-out. Periksa internet Anda.', 'error');
    console.error('Check-out error:', err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-feather="log-out" style="width:16px; height:16px;"></i> AMBIL SELFIE & PRESENSI PULANG';
      if (window.feather) feather.replace();
    }
  }
};
const submitAttendanceCheckOut = window.submitAttendanceCheckOut;

const renderAttendanceTable = (logs) => {
  const tbody = document.getElementById('attendance-tbody');
  if (!tbody) return;
  logs = logs || AppState.attendanceLogs || [];
  const gf = getGlobalFilters();
  let filtered = logs;
  if (gf.mode === 'Management') {
    filtered = filtered.filter(l => MANAGEMENT_DIVISIONS.indexOf(l.division) >= 0);
  } else if (gf.mode === 'Operasional') {
    filtered = filtered.filter(l => MANAGEMENT_DIVISIONS.indexOf(l.division) < 0);
  }
  if (gf.outlet !== 'all') filtered = filtered.filter(l => l.outlet_id === gf.outlet);
  filtered = filtered.filter(l => dateInPeriod_(l.date, gf.cutoff, gf.todayStr));
  filtered = filtered.filter(l => matchGlobalSearch_(gf.search, [l.employee_name, l.division, l.outlet_name, l.shift_name]));
  if (!filtered || filtered.length === 0) {
    const emptyMsg = (gf.outlet !== 'all' || gf.period !== 'all' || gf.search)
      ? 'Tidak ada data presensi yang cocok dengan filter (outlet/periode/pencarian).'
      : 'Belum ada data presensi hari ini.';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8;">${emptyMsg}</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(l => {
    const isLate = l.late_minutes > 0;
    const lateBadge = isLate ? `<span style="color:#ef4444; font-weight:700;">+${l.late_minutes} Menit (Denda: ${formatRupiah(l.late_deduction)})</span>` : '<span style="color:#10b981; font-weight:700;">Tepat Waktu</span>';
    const checkInTime = l.check_in_time ? l.check_in_time.split(' ')[1] : '-';
    const checkOutTime = l.check_out_time
      ? (l.check_out_time.split(' ')[1] || l.check_out_time)
      : '<span style="color:#94a3b8; font-style:italic;">belum pulang</span>';
    const checkOutDisplay = l.check_out_time
      ? `<strong style="color:#92400e;">${checkOutTime}</strong>${(l.overtime_hours > 0) ? `<div style="font-size:10.5px; color:#92400e; font-weight:700;">+${l.overtime_hours} jam lembur</div>` : ''}`
      : checkOutTime;
    return `
      <tr>
        <td>
          <img src="${l.selfie_url}" style="width:40px; height:40px; border-radius:10px; object-fit:cover; cursor:pointer;" onclick="openLightbox('${l.selfie_url}', 'Selfie Presensi: ${l.employee_name}')">
        </td>
        <td>
          <strong>${l.employee_name}</strong>
          <div style="font-size:11px; color:#64748b;">${l.division}</div>
        </td>
        <td>
          <div>${l.outlet_name}</div>
          <div style="font-size:10.5px; color:${l.in_radius ? '#10b981' : '#ef4444'}; font-weight:700;">
            ${l.in_radius ? '🟢 Dalam Radius' : '🔴 Luar Radius'} (${l.distance_meters}m)
          </div>
        </td>
        <td>
          <div>${l.shift_name}</div>
          <div style="font-size:11px; color:#64748b;">${checkInTime}</div>
        </td>
        <td>${checkOutDisplay}</td>
        <td>${lateBadge}</td>
        <td>
          <span class="status-badge-pill ${l.status === 'Hadir Tepat Waktu' ? 'status-selesai' : 'status-hold'}">
            ${l.status}
          </span>
        </td>
      </tr>
    `;
  }).join('');
};

const renderEmployeesTable = (list) => {
  const tbody = document.getElementById('employees-tbody');
  if (!tbody) return;
  const typeFilter = document.getElementById('emp-filter-type')?.value || 'all';
  const divFilter = document.getElementById('emp-filter-division')?.value || 'all';
  const outletFilter = document.getElementById('emp-filter-outlet')?.value || 'all';
  const search = document.getElementById('emp-search-input')?.value?.toLowerCase() || '';
  const gf = getGlobalFilters();
  let filtered = list;
  if (typeFilter !== 'all') filtered = filtered.filter(e => e.type === typeFilter);
  if (divFilter !== 'all') filtered = filtered.filter(e => e.division === divFilter);
  if (outletFilter !== 'all') filtered = filtered.filter(e => e.outlet_id === outletFilter);
  if (search) filtered = filtered.filter(e => e.name.toLowerCase().includes(search) || e.nip.toLowerCase().includes(search) || e.role.toLowerCase().includes(search));
  filtered = filtered.filter(e => matchGlobalMode_(e.type, e.division));
  if (gf.outlet !== 'all') filtered = filtered.filter(e => e.outlet_id === gf.outlet);
  if (gf.search) filtered = filtered.filter(e => matchGlobalSearch_(gf.search, [e.name, e.nip, e.role, e.division, e.outlet_name]));
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:24px;">Tidak ada karyawan untuk Mode ${activeModeLabel_()}${gf.outlet !== 'all' || gf.search ? ' / filter aktif' : ''}.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.slice(0, 100).map(e => {
    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${e.avatar_url}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
            <div>
              <strong>${e.name}</strong>
              <div style="font-size:10.5px; color:#64748b;">${e.nip} • ${e.email}</div>
            </div>
          </div>
        </td>
        <td>
          <span style="font-size:11px; font-weight:700; color:${e.type === 'Management' ? 'var(--burgundy-primary)' : '#0284c7'};">${e.type}</span>
          <div style="font-size:11px; font-weight:600;">${e.division}</div>
        </td>
        <td>
          <div>${e.role}</div>
          <span class="card-badge-tag" style="padding:2px 8px; font-size:10px;">${e.grade}</span>
        </td>
        <td>${e.outlet_name}</td>
        <td>
          <span style="font-weight:700; color:#10b981;">${e.employment_status}</span>
          <div style="font-size:10px; color:#94a3b8;">Join: ${e.join_date}</div>
        </td>
        <td>
          <div style="font-weight:700;">${formatRupiah(e.base_salary)}</div>
          <div style="font-size:10.5px; color:#64748b;">Makan: ${formatRupiah(e.daily_allowance)}/hari</div>
        </td>
        <td>
          <button class="btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="openEmployeePayslipDirect('${e.id}')">
            Slip Gaji
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

const loadEmployeesList = () => { renderEmployeesTable(AppState.employees); };

const openWageScaleModal = () => {
  const tbody = document.getElementById('wage-scale-tbody');
  const scales = [
    { grade: 'Grade 1', range: 'Rp 4.500.000 - Rp 5.200.000', daily: 'Rp 40.000 / hari', pos: 'Kitchen, Bar, Server, PA, CS (Crew Entry)' },
    { grade: 'Grade 2', range: 'Rp 5.200.000 - Rp 6.000.000', daily: 'Rp 45.000 / hari', pos: 'Driver, Security, Logistik' },
    { grade: 'Grade 3', range: 'Rp 6.000.000 - Rp 7.200.000', daily: 'Rp 50.000 / hari', pos: 'Kasir, Produksi, Creative' },
    { grade: 'Grade 4', range: 'Rp 7.200.000 - Rp 9.000.000', daily: 'Rp 60.000 / hari', pos: 'SPV, Head Kitchen, Head Bar, QC, HRGA' },
    { grade: 'Grade 5', range: 'Rp 9.000.000 - Rp 12.000.000', daily: 'Rp 75.000 / hari', pos: 'HRD, Finance, DOS (Middle Management)' },
    { grade: 'Grade 6', range: 'Rp 12.000.000 - Rp 16.000.000', daily: 'Rp 90.000 / hari', pos: 'BM (Branch Manager)' },
    { grade: 'Grade 7', range: 'Rp 16.000.000 - Rp 25.000.000', daily: 'Rp 120.000 / hari', pos: 'OM (Operations Manager)' }
  ];
  tbody.innerHTML = scales.map(s => `
    <tr>
      <td><strong>${s.grade}</strong></td>
      <td style="font-weight:700; color:var(--burgundy-primary);">${s.range}</td>
      <td>${s.daily}</td>
      <td>${s.pos}</td>
    </tr>
  `).join('');
  openModal('modal-wage-scale');
};

const openOrgTreeModal = () => {
  alert("Hierarki Multilevel Approval Organisasi:\n1. Level 1: Crew & Staff ➔ Approval oleh SPV / Head Kitchen / Head Bar\n2. Level 2: Supervisor ➔ Approval oleh Branch Manager (BM) & HRD\n3. Level 3: BM & Middle Management ➔ Approval oleh Operations Manager (OM)");
};

// v81: renderPayslipsTable uses debounced feather
const renderPayslipsTable = (slips) => {
  const tbody = document.getElementById('payslips-tbody');
  if (!tbody) return;
  if (slips) AppState.payslips = slips;
  const u = AppState.currentUser;
  let allSlips = (slips || AppState.payslips || []);
  if (u && !isSuperAdminUser(u)) {
    allSlips = allSlips.filter(s => s.employee_id === u.id);
  }
  const gf = getGlobalFilters();
  const list = allSlips.filter(s => matchGlobalMode_(s.type, s.division));
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:#94a3b8; padding:24px;">Tidak ada slip gaji untuk Anda pada Mode ${activeModeLabel_()}.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.slice(0, 100).map(s => {
    const m = !!s.masked;
    const hide = (v) => (m ? '••••••' : v);
    return `
      <tr>
        <td><strong>${s.slip_number}</strong></td>
        <td>
          <strong>${s.employee_name}</strong>
          <div style="font-size:10px; color:#64748b;">${s.role}</div>
        </td>
        <td>
          <div>${s.division}</div>
          <span class="card-badge-tag" style="padding:2px 6px; font-size:10px;">${s.grade}</span>
        </td>
        <td>${s.period_label}</td>
        <td>${hide(formatRupiah(s.base_salary))}</td>
        <td>${hide(formatRupiah(s.daily_allowance_total + s.overtime_pay))}</td>
        <td style="color:#ef4444; font-weight:700;">${m ? '••••••' : '-' + formatRupiah(s.total_deductions)}</td>
        <td style="font-weight:800; color:#065f46;">${hide(formatRupiah(s.net_salary))}</td>
        <td>
          ${s.is_emailed ? '<span style="color:#10b981; font-weight:700; font-size:11px;">✉️ Terkirim</span>' : '<span style="color:#94a3b8; font-size:11px;">Belum Dikirim</span>'}
        </td>
        <td>
          <button class="btn-primary" style="padding:4px 8px; font-size:11px;" onclick="promptPinForPayslip('${s.id}', '${s.employee_id}')">
            <i data-feather="lock" style="width:11px; height:11px;"></i> Buka Slip
          </button>
        </td>
      </tr>
    `;
  }).join('');
  // v81 FIX: debounced feather
  window.debouncedFeatherReplace && window.debouncedFeatherReplace();
};

const promptPinForPayslip = (slipId, empId) => {
  AppState.selectedPayslipForPin = { slipId, empId };
  document.getElementById('input-pin-auth').value = '';
  openModal('modal-pin');
};

const openEmployeePayslipDirect = (empId) => {
  const slip = AppState.payslips.find(s => s.employee_id === empId);
  if (slip) {
    promptPinForPayslip(slip.id, empId);
  } else {
    alert('Slip gaji untuk karyawan ini belum dibuat pada periode berjalan.');
  }
};

const confirmPinAndOpenSlip = async () => {
  const pin = document.getElementById('input-pin-auth').value;
  if (!pin) { alert('Masukkan PIN 6 Digit!'); return; }
  try {
    const res = await fetch('/api/payroll/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: AppState.selectedPayslipForPin.empId, pin: pin })
    });
    const result = await res.json();
    if (res.ok) {
      closeModal('modal-pin');
      await loadPayslips();
      showPayslipContent(AppState.selectedPayslipForPin.slipId);
    } else {
      alert(result.detail || 'PIN Salah! Akses ditolak.');
    }
  } catch (err) {
    showToast('Gagal memverifikasi PIN', 'error');
  }
};

const showPayslipContent = (slipId) => {
  const slip = AppState.payslips.find(s => s.id === slipId);
  if (!slip) return;
  const container = document.getElementById('payslip-modal-content');
  container.innerHTML = `
    <div class="payslip-sheet">
      <div class="payslip-header-brand">
        <div class="payslip-company-info">
          <h2>TERTIB DISIPLIN</h2>
          <p>Multi-Outlet Management & F&B Operations</p>
          <p style="font-size:10px; color:#94a3b8;">Jl. Jend. Sudirman Kav 52-53, Jakarta Selatan</p>
        </div>
        <div style="text-align:right;">
          <h4 style="color:#701c34; font-size:16px;">SLIP GAJI ELEKTRONIK</h4>
          <p style="font-size:11px; font-weight:700;">${slip.slip_number}</p>
          <span style="font-size:10px; background:#ecfdf5; color:#065f46; padding:2px 8px; border-radius:10px; font-weight:700;">CONFIDENTIAL / RAHASIA</span>
        </div>
      </div>
      <div class="payslip-meta-grid">
        <div class="meta-field"><span class="lbl">Nama Karyawan</span><span class="val">${slip.employee_name}</span></div>
        <div class="meta-field"><span class="lbl">Periode Gaji</span><span class="val">${slip.period_label}</span></div>
        <div class="meta-field"><span class="lbl">Divisi & Jabatan</span><span class="val">${slip.division} - ${slip.role}</span></div>
        <div class="meta-field"><span class="lbl">Struktur Grading</span><span class="val">${slip.grade} (Permenaker 1/2017)</span></div>
      </div>
      <table class="payslip-table">
        <thead><tr><th>KOMPONEN PENERIMAAN (EARNINGS)</th><th style="text-align:right;">JUMLAH (IDR)</th></tr></thead>
        <tbody>
          <tr><td>Gaji Pokok</td><td class="amount">${formatRupiah(slip.base_salary)}</td></tr>
          <tr><td>Uang Makan (${slip.attendance_days || 0} Hari)</td><td class="amount">${formatRupiah(slip.meal_allowance_total || 0)}</td></tr>
          <tr><td>Uang Transport (${slip.attendance_days || 0} Hari)</td><td class="amount">${formatRupiah(slip.transport_allowance_total || 0)}</td></tr>
          <tr><td>Tunjangan Jabatan</td><td class="amount">${formatRupiah(slip.position_allowance)}</td></tr>
          <tr><td>Tunjangan Bonus (KPI ${(slip.bonus_kpi / 10000) || 0}%)</td><td class="amount">${formatRupiah(slip.bonus_kpi)}</td></tr>
          ${(slip.tunjangan_bonus && slip.tunjangan_bonus > 0) ? `<tr><td>Tunjangan Bonus Tambahan</td><td class="amount">${formatRupiah(slip.tunjangan_bonus)}</td></tr>` : ''}
          <tr><td>Tunjangan Kehadiran (${slip.attendance_days || 0} Hari Hadir)</td><td class="amount">${formatRupiah(slip.daily_allowance_total)}</td></tr>
          <tr><td>Lembur (${slip.overtime_hours || 0} Jam)</td><td class="amount">${formatRupiah(slip.overtime_pay)}</td></tr>
          <tr style="background:#f8fafc; font-weight:700;"><td>TOTAL PENGHASILAN BRUTO</td><td class="amount" style="color:var(--burgundy-primary);">${formatRupiah(slip.gross_salary)}</td></tr>
        </tbody>
      </table>
      <table class="payslip-table">
        <thead><tr><th>KOMPONEN POTONGAN (DEDUCTIONS)</th><th style="text-align:right;">JUMLAH (IDR)</th></tr></thead>
        <tbody>
          <tr><td>Telat (Potongan Keterlambatan Presensi)</td><td class="amount">-${formatRupiah(slip.late_deduction)}</td></tr>
          <tr><td>BPJS Ketenagakerjaan (3%)</td><td class="amount">-${formatRupiah(slip.bpjs_tk_deduction)}</td></tr>
          <tr><td>BPJS Kesehatan (1%)</td><td class="amount">-${formatRupiah(slip.bpjs_kes_deduction)}</td></tr>
          <tr><td>PPh 21 Skema TER</td><td class="amount">-${formatRupiah(slip.pph21_ter_deduction)}</td></tr>
          <tr><td>Potongan Pinjaman / Kasbon</td><td class="amount">-${formatRupiah(slip.kasbon_deduction)}</td></tr>
          <tr style="background:#fef2f2; font-weight:700; color:#ef4444;"><td>TOTAL PENGURANG GAJI</td><td class="amount">-${formatRupiah(slip.total_deductions)}</td></tr>
        </tbody>
      </table>
      <div style="background:#f8fafc; border:2px solid var(--burgundy-primary); border-radius:12px; padding:16px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="font-size:14px; color:var(--burgundy-primary);">GAJI BERSIH DITERIMA (TAKE HOME PAY)</strong>
          <div style="font-size:11px; color:#64748b;">Ditransfer langsung ke Rekening Bank Karyawan</div>
        </div>
        <div style="font-size:22px; font-weight:800; color:#065f46;">${formatRupiah(slip.net_salary)}</div>
      </div>
    </div>
  `;
  AppState.activeViewingSlipId = slipId;
  openModal('modal-payslip');
  if (window.feather) feather.replace();
};

const sendPayslipToEmail = async () => {
  if (!AppState.activeViewingSlipId) return;
  showToast('Mengirimkan slip gaji rahasia ke email karyawan...', 'info');
  try {
    const res = await fetch(`/api/payroll/slips/${AppState.activeViewingSlipId}/send-email`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      await loadPayslips();
    }
  } catch (err) {
    showToast('Gagal mengirimkan email', 'error');
  }
};

const runAutopilotPayroll = async () => {
  if (!isPayrollAdmin()) {
    showToast('Fitur ini hanya untuk tim payroll (OM, HRD, Finance).', 'warning');
    return;
  }
  if (!confirm('Jalankan proses Autopilot Payroll bulan ini untuk seluruh karyawan?')) return;
  showToast('Memproses kalkulasi otomatis upah harian, lembur, BPJS, dan PPh 21...', 'info');
  try {
    const res = await fetch('/api/payroll/run-autopilot', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(`Sukses! ${data.processed_slips} slip gaji berhasil digenerate otomatis!`, 'success');
      await loadPayslips();
    }
  } catch (err) {
    showToast('Gagal memproses autopilot payroll', 'error');
  }
};

const renderKpiTable = (stats) => {
  const tbody = document.getElementById('kpi-division-tbody');
  if (!tbody) return;
  const gf = getGlobalFilters();
  const list = (stats || []).filter(s => matchGlobalMode_(s.type, s.division));
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:24px;">Tidak ada data KPI divisi untuk Mode ${activeModeLabel_()}.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(s => {
    let badgeClass = 'status-selesai';
    let statusText = 'Sangat Memuaskan';
    if (s.avg_kpi < 85) {
      badgeClass = 'status-hold';
      statusText = 'Perlu Evaluasi';
    }
    return `
      <tr>
        <td><strong>${s.division}</strong></td>
        <td><span style="font-size:11px; color:${s.type === 'Management' ? 'var(--burgundy-primary)' : '#0284c7'}; font-weight:700;">${s.type}</span></td>
        <td>${s.staff_count} Orang</td>
        <td>⭐ ${s.avg_rating} / 5.0</td>
        <td><strong style="color:var(--burgundy-primary); font-size:14px;">${s.avg_kpi}%</strong></td>
        <td><span class="status-badge-pill ${badgeClass}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
};

// ================= CHAT ROOM INTERNAL =================
window.switchChatChannel = (channel, el) => {
  if (!canAccessChannel(channel)) {
    showToast('Anda tidak memiliki akses ke saluran ini.', 'warning');
    return;
  }
  AppState.activeChatChannel = channel;
  document.querySelectorAll('.chat-channel-item').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  const nameEl = document.getElementById('active-chat-channel-name');
  if (nameEl) nameEl.textContent = channel;
  const sel = document.getElementById('chat-channel-select');
  if (sel) sel.value = channel;
  ChatState.lastSig = '';
  ChatState.lastCount = 0;
  loadChatMessages(channel, { showLoading: true });
};
const switchChatChannel = window.switchChatChannel;

const ChatState = {
  pollingTimer: null,
  pollInterval: 4000,
  isActive: false,
  isLoading: false,
  lastSig: '',
  lastCount: 0,
  pendingMessages: [],
  networkErrorStreak: 0,
};
window.ChatState = ChatState;

const formatChatTime = (raw) => {
  if (!raw) return '';
  const s = String(raw).trim();
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m1) {
    const dt = new Date(+m1[1], +m1[2] - 1, +m1[3], +m1[4], +m1[5], m1[6] ? +m1[6] : 0);
    const now = new Date();
    const isToday = dt.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const isYesterday = dt.toDateString() === yest.toDateString();
    const hh = ('0' + dt.getHours()).slice(-2);
    const mm = ('0' + dt.getMinutes()).slice(-2);
    if (isToday) return hh + ':' + mm;
    if (isYesterday) return 'Kemarin ' + hh + ':' + mm;
    return ('0' + dt.getDate()).slice(-2) + '/' + ('0' + (dt.getMonth() + 1)).slice(-2) + ' ' + hh + ':' + mm;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return m2[3] + '/' + m2[2] + '/' + m2[1];
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  if (s.indexOf('1899-12-30') === 0) {
    const t = s.split(' ')[1];
    return t ? t.slice(0, 5) : '';
  }
  const m3 = s.match(/(\d{1,2}:\d{2})(?::\d{2})?$/);
  return m3 ? m3[1] : s;
};

const isChatNearBottom = () => {
  const c = document.getElementById('chat-messages-stream');
  if (!c) return true;
  return (c.scrollHeight - c.scrollTop - c.clientHeight) < 80;
};

window.sizeChatWrapper = () => {
  const panel = document.getElementById('view-chat');
  const wrap = document.querySelector('#view-chat .chat-window-wrapper');
  if (!panel || !wrap || !panel.classList.contains('active')) return;
  const contentBody = wrap.closest('.content-body');
  if (!contentBody) return;
  const cs = window.getComputedStyle(contentBody);
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const top = wrap.getBoundingClientRect().top;
  const avail = window.innerHeight - top - padBottom - 4;
  if (avail > 220) {
    wrap.style.height = avail + 'px';
    wrap.style.maxHeight = avail + 'px';
  }
};

window.addEventListener('resize', () => { window.sizeChatWrapper && window.sizeChatWrapper(); });
window.addEventListener('orientationchange', () => {
  setTimeout(() => { window.sizeChatWrapper && window.sizeChatWrapper(); }, 250);
});
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => { window.sizeChatWrapper && window.sizeChatWrapper(); });
}

const loadChatMessages = async (channel, opts) => {
  const ch = channel || AppState.activeChatChannel || '#general';
  const options = opts || {};
  const container = document.getElementById('chat-messages-stream');
  if (ChatState.isLoading) return;
  ChatState.isLoading = true;
  const statusEl = document.getElementById('chat-conn-status');
  if (statusEl && !options.silent) statusEl.textContent = 'Memuat…';
  if (container && options.showLoading) {
    container.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:20px; font-size:12px;">Memuat pesan…</div>';
  }
  try {
    const res = await fetch('/api/chat/messages?channel=' + encodeURIComponent(ch));
    if (!res.ok) {
      let errMsg = 'Gagal memuat pesan (HTTP ' + res.status + ')';
      try {
        const errData = await res.json();
        if (errData.detail) errMsg = errData.detail;
      } catch (e) { /* ignore */ }
      ChatState.networkErrorStreak++;
      if (container && !options.silent) {
        container.innerHTML = '<div style="text-align:center; color:#ef4444; padding:20px; font-size:12px;">⚠️ ' + errMsg + '<br><button type="button" class="btn-secondary" style="margin-top:8px; padding:5px 10px; font-size:11px;" onclick="window.loadChatMessages && window.loadChatMessages(\'' + ch + '\', {showLoading:true})">Coba Lagi</button></div>';
      }
      if (statusEl) statusEl.textContent = 'Error';
      return;
    }
    const data = await res.json();
    ChatState.networkErrorStreak = 0;
    const merged = (ChatState.pendingMessages.filter(p => p.channel === ch)).concat(data || []);
    const lastMsg = (data && data.length) ? data[data.length - 1] : null;
    const sig = (lastMsg ? (lastMsg.id || lastMsg.timestamp || '') : '') + '|' + data.length + '|' + (ChatState.pendingMessages.length);
    if (sig === ChatState.lastSig && !options.force) {
      if (statusEl) statusEl.textContent = 'Online';
      return;
    }
    ChatState.lastSig = sig;
    ChatState.lastCount = data.length;
    ChatState.pendingMessages = ChatState.pendingMessages.filter(p => {
      return !data.some(s => s.sender_id === p.sender_id && s.message === p.message);
    });
    renderChatMessages(merged);
    if (statusEl) {
      statusEl.textContent = 'Online';
      statusEl.style.color = '#10b981';
    }
  } catch (err) {
    console.error('Failed loading chat:', err);
    ChatState.networkErrorStreak++;
    if (container && !options.silent) {
      container.innerHTML = '<div style="text-align:center; color:#ef4444; padding:20px; font-size:12px;">⚠️ Kesalahan koneksi. <button type="button" class="btn-secondary" style="margin-top:8px; padding:5px 10px; font-size:11px;" onclick="window.loadChatMessages && window.loadChatMessages(\'' + ch + '\', {showLoading:true})">Coba Lagi</button></div>';
    }
    if (statusEl) {
      statusEl.textContent = 'Offline';
      statusEl.style.color = '#ef4444';
    }
  } finally {
    ChatState.isLoading = false;
  }
};
window.loadChatMessages = loadChatMessages;

const renderChatMessages = (messages) => {
  const container = document.getElementById('chat-messages-stream');
  if (!container) return;
  if (!messages || messages.length === 0) {
    container.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:40px 20px; font-size:13px;">💬 Belum ada pesan di saluran ini.<br>Mulai percakapan dengan menulis pesan di bawah.</div>';
    return;
  }
  const myId = AppState.currentUser ? AppState.currentUser.id : '';
  const wasNearBottom = isChatNearBottom();
  container.innerHTML = messages.map(m => {
    const isMe = m.sender_id === myId;
    const isPending = !!m.__pending;
    const time = formatChatTime(m.timestamp);
    const senderName = escapeHtml(m.sender_name || 'Anon');
    const senderDiv = escapeHtml(m.sender_division || '-');
    const msgHtml = escapeHtml(m.message || '').replace(/\n/g, '<br>');
    return '<div class="chat-message-bubble' + (isMe ? ' me' : '') + (isPending ? ' pending' : '') + '" data-msg-id="' + escapeHtml(m.id || '') + '">' +
      '<div class="chat-bubble-content">' +
        '<div class="chat-sender-info">' + senderName + ' (' + senderDiv + ')</div>' +
        '<div class="chat-msg-text">' + msgHtml + '</div>' +
        '<div class="chat-timestamp">' + escapeHtml(time) + (isPending ? ' • Mengirim…' : '') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  if (wasNearBottom) {
    requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
  }
};
window.renderChatMessages = renderChatMessages;
window.formatChatTime = formatChatTime;

window.startChatPolling = () => {
  if (ChatState.pollingTimer) return;
  ChatState.isActive = true;
  ChatState.pollingTimer = setInterval(() => {
    if (!ChatState.isActive) return;
    if (document.visibilityState === 'hidden') return;
    const chatView = document.getElementById('view-chat');
    if (!chatView || !chatView.classList.contains('active')) return;
    loadChatMessages(AppState.activeChatChannel, { silent: true });
  }, ChatState.pollInterval);
};
window.stopChatPolling = () => {
  ChatState.isActive = false;
  if (ChatState.pollingTimer) {
    clearInterval(ChatState.pollingTimer);
    ChatState.pollingTimer = null;
  }
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const chatView = document.getElementById('view-chat');
    if (chatView && chatView.classList.contains('active')) {
      loadChatMessages(AppState.activeChatChannel, { silent: true });
    }
  }
});

window.sendChatMessage = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('chat-text-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  if (!AppState.currentUser) {
    showToast('Sesi login tidak ditemukan. Silakan login kembali.', 'error');
    return;
  }
  const sendBtn = document.getElementById('chat-send-btn');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.setAttribute('data-busy', '1'); }
  const tempId = 'pending-' + Date.now();
  const optimisticMsg = {
    id: tempId,
    channel: AppState.activeChatChannel,
    sender_id: AppState.currentUser.id,
    sender_name: AppState.currentUser.name,
    sender_division: AppState.currentUser.division,
    message: text,
    timestamp: '',
    __pending: true,
  };
  const now = new Date();
  optimisticMsg.timestamp = now.getFullYear() + '-' +
    ('0' + (now.getMonth() + 1)).slice(-2) + '-' +
    ('0' + now.getDate()).slice(-2) + ' ' +
    ('0' + now.getHours()).slice(-2) + ':' +
    ('0' + now.getMinutes()).slice(-2) + ':' +
    ('0' + now.getSeconds()).slice(-2);
  ChatState.pendingMessages.push(optimisticMsg);
  const allExisting = (Array.from(document.querySelectorAll('#chat-messages-stream .chat-message-bubble'))
    .map(el => el.dataset.msgId).filter(Boolean));
  const container = document.getElementById('chat-messages-stream');
  if (container) {
    if (container.innerHTML.indexOf('Belum ada pesan') >= 0) container.innerHTML = '';
    const wasNearBottom = isChatNearBottom();
    const myId = AppState.currentUser.id;
    const time = formatChatTime(optimisticMsg.timestamp);
    const bubble = document.createElement('div');
    bubble.className = 'chat-message-bubble me pending';
    bubble.dataset.msgId = tempId;
    bubble.innerHTML = '<div class="chat-bubble-content">' +
      '<div class="chat-sender-info">' + escapeHtml(optimisticMsg.sender_name) + ' (' + escapeHtml(optimisticMsg.sender_division) + ')</div>' +
      '<div class="chat-msg-text">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>' +
      '<div class="chat-timestamp">' + escapeHtml(time) + ' • Mengirim…</div>' +
    '</div>';
    container.appendChild(bubble);
    if (wasNearBottom) container.scrollTop = container.scrollHeight;
  }
  input.value = '';
  try {
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: AppState.activeChatChannel,
        sender_id: AppState.currentUser.id,
        sender_name: AppState.currentUser.name,
        sender_role: AppState.currentUser.role,
        sender_division: AppState.currentUser.division,
        message: text
      })
    });
    const data = await res.json();
    if (res.ok) {
      ChatState.pendingMessages = ChatState.pendingMessages.filter(p => p.id !== tempId);
      const pendingEl = container && container.querySelector('[data-msg-id="' + tempId + '"]');
      if (pendingEl) pendingEl.remove();
      ChatState.lastSig = '';
      await loadChatMessages(AppState.activeChatChannel, { silent: true, force: true });
    } else {
      const pendingEl = container && container.querySelector('[data-msg-id="' + tempId + '"]');
      if (pendingEl) {
        pendingEl.classList.remove('pending');
        pendingEl.classList.add('failed');
        const tsEl = pendingEl.querySelector('.chat-timestamp');
        if (tsEl) tsEl.innerHTML = '⚠️ Gagal kirim — ' + escapeHtml(data.detail || data.message || 'coba lagi');
      }
      showToast(data.detail || data.message || 'Gagal mengirim pesan.', 'error');
    }
  } catch (err) {
    const pendingEl = container && container.querySelector('[data-msg-id="' + tempId + '"]');
    if (pendingEl) {
      pendingEl.classList.remove('pending');
      pendingEl.classList.add('failed');
      const tsEl = pendingEl.querySelector('.chat-timestamp');
      if (tsEl) tsEl.innerHTML = '⚠️ Gagal kirim — periksa koneksi';
    }
    showToast('Gagal mengirim pesan. Periksa koneksi internet.', 'error');
    console.error('Chat send error:', err);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.removeAttribute('data-busy');
      sendBtn.innerHTML = '<i data-feather="send" style="width:14px; height:14px;"></i>';
      if (window.feather) feather.replace();
    }
    input.focus();
  }
};
const sendChatMessage = window.sendChatMessage;

window.switchChatChannelMobile = (selectEl) => {
  if (!selectEl) return;
  const channel = selectEl.value;
  document.querySelectorAll('.chat-channel-item').forEach(c => {
    if (c.getAttribute('onclick') && c.getAttribute('onclick').indexOf("'" + channel + "'") >= 0) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
  switchChatChannel(channel, null);
};
window.switchChatChannelMobile = window.switchChatChannelMobile;

const loadCalendarEvents = async () => {
  try {
    const res = await fetch('/api/calendar/events');
    if (!res.ok) return;
    const data = await res.json();
    let events = Array.isArray(data) ? data : [];
    const u = AppState.currentUser;
    if (u && !isSuperAdminUser(u)) {
      const myName = String(u.name || '').trim().toLowerCase();
      const myDiv = String(u.division || '').trim();
      events = events.filter(ev => {
        const org = String(ev.organizer_name || '').trim().toLowerCase();
        if (org && org === myName) return true;
        const ad = String(ev.attendees_division || '').trim();
        if (!ad) return true;
        const adLow = ad.toLowerCase();
        if (adLow === 'semua' || adLow === 'all' || adLow === 'umum' ||
            adLow.indexOf('semua outlet') >= 0 || adLow.indexOf('semua divisi') >= 0 ||
            adLow.indexOf('manajemen & operasional') >= 0 || adLow.indexOf('management & operasional') >= 0) {
          return true;
        }
        if (ad.split(/[,/&\s]+/).some(d => d.trim() === myDiv)) return true;
        return false;
      });
    }
    renderCalendarEvents(events);
  } catch (err) {
    console.error('Failed loading calendar:', err);
  }
};

const renderCalendarEvents = (events) => {
  const container = document.getElementById('calendar-events-list');
  if (!container) return;
  container.innerHTML = events.map(ev => {
    return `
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:16px; box-shadow:var(--shadow-sm); display:flex; gap:16px; align-items:center;">
        <div style="background:var(--burgundy-soft); color:var(--burgundy-primary); padding:12px; border-radius:12px; text-align:center; min-width:65px;">
          <div style="font-size:18px; font-weight:800;">${ev.date.split('-')[2]}</div>
          <div style="font-size:10px; font-weight:700; text-transform:uppercase;">${ev.date.split('-')[1]}</div>
        </div>
        <div style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <span class="card-badge-tag" style="font-size:10px; padding:2px 8px;">${ev.category}</span>
            <span style="font-size:11px; color:#64748b;">⏰ ${ev.start_time} - ${ev.end_time} WIB</span>
          </div>
          <h4 style="font-size:14px; font-weight:800; color:var(--text-dark);">${ev.title}</h4>
          <p style="font-size:12px; color:#64748b; margin-top:2px;">📍 ${ev.location} (${ev.outlet_name}) • Peserta: <strong>${ev.attendees_division}</strong></p>
        </div>
        <button class="btn-secondary" style="font-size:11px; padding:6px 10px;" onclick="showToast('Notifikasi reminder telah dijadwalkan ke email peserta.', 'success')">
          <i data-feather="bell" style="width:12px; height:12px;"></i> Ingatkan
        </button>
      </div>
    `;
  }).join('');
  if (window.feather) feather.replace();
};

const openCreateEventModal = () => {
  const title = prompt('Judul Agenda / Meeting:');
  if (!title) return;
  const time = prompt('Waktu Mulai (contoh: 10:00):', '10:00');
  const cat = prompt('Kategori (Meeting / Briefing / Audit / Training):', 'Meeting');
  fetch('/api/calendar/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: title,
      category: cat || 'Meeting',
      date: new Date().toISOString().split('T')[0],
      start_time: time || '10:00',
      end_time: '11:30',
      location: 'Ruang Rapat Utama & Zoom',
      outlet_name: 'Semua Outlet',
      organizer_name: AppState.currentUser.name,
      attendees_division: 'Management & SPV',
      description: 'Agenda rutin operasional'
    })
  }).then(() => {
    showToast('Agenda berhasil didaftarkan!', 'success');
    loadCalendarEvents();
  });
};

const isLeaveApprover = (user = AppState.currentUser) => !!user && (isSuperAdminUser(user) || LEAVE_APPROVER_DIVISIONS.includes(user.division));

AppState.leaveRequests = [];
AppState.leaveBalance = null;

const loadLeaveBalance = async () => {
  try {
    const res = await fetch('/api/leaves/balance');
    if (!res.ok) return;
    const data = await res.json();
    AppState.leaveBalance = data;
    renderLeaveBalance(data);
    const kpiBalance = document.getElementById('kpi-leave-balance');
    if (kpiBalance) {
      kpiBalance.textContent = (data.remaining || 0) + ' hari';
    }
  } catch (err) {
    console.error('Failed loading leave balance:', err);
  }
};

const loadLeaveRequests = async () => {
  try {
    const res = await fetch('/api/leaves');
    if (!res.ok) return;
    const data = await res.json();
    AppState.leaveRequests = Array.isArray(data) ? data : [];
    renderLeaveRequestsList(AppState.leaveRequests);
  } catch (err) {
    console.error('Failed loading leave requests:', err);
  }
};

const renderLeaveBalance = (b) => {
  const card = document.getElementById('leave-balance-card');
  if (!card || !b) return;
  const remainingColor = (b.remaining || 0) >= 6 ? '#10b981' : ((b.remaining || 0) >= 3 ? '#f59e0b' : '#ef4444');
  const usedPct = b.entitlement > 0 ? Math.min(100, Math.round((b.used / b.entitlement) * 100)) : 0;
  const adj = Number(b.adjustment) || 0;
  const subtitle = adj !== 0
    ? `Hak dasar <b>${b.base_entitlement || 0}</b> hari + penyesuaian <b style="color:${adj > 0 ? '#059669' : '#dc2626'};">${adj > 0 ? '+' : ''}${adj}</b> hari (diatur SUPER ADMIN)`
    : `Jatah tahunan <b>${b.entitlement || 0}</b> hari (diatur lewat Panel Super Admin)`;
  const adjChip = adj !== 0 ? `
      <div style="background:#fefce8; padding:10px 12px; border-radius:10px; border:1px solid #fde68a;">
        <p style="font-size:10px; color:#92400e; margin:0; text-transform:uppercase; font-weight:700;">Penyesuaian</p>
        <p style="font-size:18px; font-weight:800; color:${adj > 0 ? '#059669' : '#dc2626'}; margin:2px 0 0 0;">${adj > 0 ? '+' : ''}${adj}</p>
      </div>` : '';
  card.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
      <div>
        <h3 style="margin:0; font-size:16px;">Sisa Cuti Tahunan ${b.year || ''}</h3>
        <p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">${subtitle}</p>
      </div>
      <div style="text-align:right;">
        <div style="font-size:32px; font-weight:800; color:${remainingColor}; line-height:1;">${b.remaining || 0}</div>
        <div style="font-size:11px; color:#64748b; font-weight:700; text-transform:uppercase;">hari tersisa</div>
      </div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:10px; margin-bottom:14px;">
      <div style="background:#f8fafc; padding:10px 12px; border-radius:10px; border:1px solid #e2e8f0;">
        <p style="font-size:10px; color:#64748b; margin:0; text-transform:uppercase; font-weight:700;">Hak Cuti</p>
        <p style="font-size:18px; font-weight:800; color:var(--burgundy-primary); margin:2px 0 0 0;">${b.entitlement || 0}</p>
      </div>
      <div style="background:#f8fafc; padding:10px 12px; border-radius:10px; border:1px solid #e2e8f0;">
        <p style="font-size:10px; color:#64748b; margin:0; text-transform:uppercase; font-weight:700;">Terpakai</p>
        <p style="font-size:18px; font-weight:800; color:#ef4444; margin:2px 0 0 0;">${b.used || 0}</p>
      </div>
      <div style="background:#f8fafc; padding:10px 12px; border-radius:10px; border:1px solid #e2e8f0;">
        <p style="font-size:10px; color:#64748b; margin:0; text-transform:uppercase; font-weight:700;">Pending</p>
        <p style="font-size:18px; font-weight:800; color:#f59e0b; margin:2px 0 0 0;">${b.pending || 0}</p>
      </div>
      ${adjChip}
    </div>
    <div style="background:#e2e8f0; border-radius:8px; height:8px; overflow:hidden;">
      <div style="background:linear-gradient(90deg, var(--burgundy-primary), var(--burgundy-light)); height:100%; width:${usedPct}%; transition:width 0.3s;"></div>
    </div>
    <p style="font-size:11px; color:#94a3b8; margin:6px 0 0 0;">${usedPct}% dari hak cuti telah terpakai</p>
  `;
};

// v81: renderLeaveRequestsList uses debounced feather
const renderLeaveRequestsList = (requests) => {
  const tbody = document.getElementById('leaves-tbody');
  if (!tbody) return;
  if (requests) AppState.leaveRequests = requests;
  const gf = getGlobalFilters();
  let list = requests || AppState.leaveRequests || [];
  list = list.filter(l => matchGlobalMode_(l.employee_type, l.division));
  if (gf.outlet !== 'all') list = list.filter(l => l.outlet_id === gf.outlet);
  list = list.filter(l => dateInPeriod_(l.start_date, gf.cutoff, gf.todayStr));
  list = list.filter(l => matchGlobalSearch_(gf.search, [l.employee_name, l.division, l.type, l.reason]));
  if (list.length === 0) {
    const filtered = gf.outlet !== 'all' || gf.period !== 'all' || gf.search ||
      gf.mode === 'Management' || gf.mode === 'Operasional';
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:24px;">${filtered
      ? `Tidak ada pengajuan cuti/ijin untuk filter aktif (Mode: ${activeModeLabel_()}).`
      : 'Belum ada pengajuan cuti/ijin.'}</td></tr>`;
    return;
  }
  const isApprover = isLeaveApprover();
  const me = AppState.currentUser;
  tbody.innerHTML = list.map(l => {
    let statusBadge = '';
    if (l.status === 'Pending') statusBadge = '<span class="status-badge-pill status-proses" style="background:#fef3c7; color:#92400e;">Menunggu Approval</span>';
    else if (l.status === 'Approved') statusBadge = '<span class="status-badge-pill status-selesai" style="background:#d1fae5; color:#065f46;">Disetujui</span>';
    else if (l.status === 'Rejected') statusBadge = '<span class="status-badge-pill status-hold" style="background:#fee2e2; color:#991b1b;">Ditolak</span>';
    else if (l.status === 'Canceled') statusBadge = '<span class="status-badge-pill" style="background:#f1f5f9; color:#475569;">Dibatalkan</span>';
    let actions = '';
    if (isApprover && l.status === 'Pending' && l.employee_id !== me.id) {
      actions = `
        <button class="btn-primary" style="padding:5px 10px; font-size:11px; margin-right:4px;" onclick="window.approveLeaveRequest('${l.id}')"><i data-feather="check" style="width:11px; height:11px;"></i> Setujui</button>
        <button class="btn-secondary" style="padding:5px 10px; font-size:11px; color:#dc2626; border-color:#fca5a5;" onclick="window.rejectLeaveRequest('${l.id}')"><i data-feather="x" style="width:11px; height:11px;"></i> Tolak</button>
      `;
    } else if (l.status === 'Pending' && l.employee_id === me.id) {
      actions = `<button class="btn-secondary" style="padding:5px 10px; font-size:11px; color:#dc2626; border-color:#fca5a5;" onclick="window.cancelLeaveRequest('${l.id}')"><i data-feather="x-circle" style="width:11px; height:11px;"></i> Batalkan</button>`;
    } else if (l.approver_note) {
      actions = `<span style="font-size:10.5px; color:#64748b; font-style:italic;">"${l.approver_note}"</span>`;
    }
    const attachmentLink = l.attachment_url
      ? `<a href="${l.attachment_url}" target="_blank" style="color:var(--burgundy-primary); font-size:11px; font-weight:600;">📎 Lampir</a>`
      : '<span style="font-size:10px; color:#94a3b8;">-</span>';
    return `
      <tr>
        <td>
          <strong>${l.employee_name}</strong>
          <div style="font-size:11px; color:#64748b;">${l.division}</div>
        </td>
        <td><span class="card-badge-tag" style="font-size:10px;">${l.type}</span></td>
        <td style="font-size:12px;">${l.start_date}${l.start_date !== l.end_date ? ' s/d ' + l.end_date : ''}</td>
        <td style="text-align:center; font-weight:700;">${l.days}</td>
        <td style="font-size:11.5px; max-width:220px;">${l.reason || '-'}</td>
        <td style="text-align:center;">${attachmentLink}</td>
        <td>${statusBadge}</td>
        <td style="font-size:11px;">${actions || '<span style="color:#cbd5e1;">—</span>'}</td>
      </tr>
    `;
  }).join('');
  // v81 FIX: debounced feather
  window.debouncedFeatherReplace && window.debouncedFeatherReplace();
};

const submitLeaveRequest = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const typeEl = document.getElementById('leave-form-type');
  const startEl = document.getElementById('leave-form-start');
  const endEl = document.getElementById('leave-form-end');
  const reasonEl = document.getElementById('leave-form-reason');
  const attachmentEl = document.getElementById('leave-form-attachment');
  const submitBtn = document.getElementById('btn-submit-leave');
  if (!typeEl || !startEl || !endEl || !reasonEl) {
    showToast('Form pengajuan cuti tidak ditemukan.', 'error');
    return;
  }
  const type = typeEl.value;
  const start = startEl.value;
  const end = endEl.value;
  const reason = reasonEl.value.trim();
  if (!type || !start || !end || !reason) {
    showToast('Mohon lengkapi semua kolom wajib (Tipe, Tanggal Mulai, Tanggal Selesai, Alasan).', 'warning');
    return;
  }
  if (start > end) {
    showToast('Tanggal mulai tidak boleh setelah tanggal selesai.', 'warning');
    return;
  }
  if (reason.length < 3) {
    showToast('Alasan terlalu singkat (minimal 3 karakter).', 'warning');
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Mengirim pengajuan...';
  try {
    const res = await fetch('/api/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: type,
        start_date: start,
        end_date: end,
        reason: reason,
        attachment_url: attachmentEl ? attachmentEl.value.trim() : ''
      })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || `Pengajuan ${type} berhasil dikirim. Menunggu approval.`, 'success');
      typeEl.value = 'Cuti Tahunan';
      startEl.value = '';
      endEl.value = '';
      reasonEl.value = '';
      if (attachmentEl) attachmentEl.value = '';
      await loadLeaveRequests();
      await loadLeaveBalance();
      const modal = document.getElementById('modal-leave-create');
      if (modal) modal.classList.remove('active');
    } else {
      showToast(data.detail || data.message || 'Gagal mengajukan cuti. Coba lagi.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi saat mengajukan cuti.', 'error');
    console.error('Leave request error:', err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-feather="send" style="width:13px; height:13px;"></i> Kirim Pengajuan';
    if (window.feather) feather.replace();
  }
};

window.approveLeaveRequest = async (id) => {
  const note = prompt('Catatan approver (opsional):', 'Disetujui.');
  if (note === null) return;
  try {
    const res = await fetch(`/api/leaves/${id}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note || '' })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Pengajuan disetujui.', 'success');
      await loadLeaveRequests();
      await loadLeaveBalance();
    } else {
      showToast(data.detail || data.message || 'Gagal approve.', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat approve.', 'error');
  }
};

window.rejectLeaveRequest = async (id) => {
  const note = prompt('Alasan menolak (wajib):', '');
  if (note === null) return;
  if (!note || note.trim().length < 3) {
    showToast('Alasan menolak wajib diisi (minimal 3 karakter).', 'warning');
    return;
  }
  try {
    const res = await fetch(`/api/leaves/${id}/reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note.trim() })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Pengajuan ditolak.', 'success');
      await loadLeaveRequests();
    } else {
      showToast(data.detail || data.message || 'Gagal reject.', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat reject.', 'error');
  }
};

window.cancelLeaveRequest = async (id) => {
  if (!confirm('Batalkan pengajuan cuti ini? Tindakan tidak bisa dibatalkan.')) return;
  try {
    const res = await fetch(`/api/leaves/${id}/cancel`, { method: 'PUT', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Pengajuan dibatalkan.', 'success');
      await loadLeaveRequests();
      await loadLeaveBalance();
    } else {
      showToast(data.detail || data.message || 'Gagal membatalkan.', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat cancel.', 'error');
  }
};

window.submitLeaveRequest = submitLeaveRequest;

const loadDataCenterOutlets = () => {
  const select = document.getElementById('dc-edit-outlet');
  if (!select) return;
  if (!AppState.outlets || AppState.outlets.length === 0) return;
  select.innerHTML = AppState.outlets.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
};

const renderDataCenterEmployeeList = (filterText = '') => {
  const tbody = document.getElementById('dc-employees-tbody');
  if (!tbody) return;
  const allEmps = AppState.employees || [];
  const gf = getGlobalFilters();
  let modeFiltered = allEmps;
  if (AppState.currentMode === 'Management') {
    modeFiltered = allEmps.filter(e => e.type === 'Management');
  } else if (AppState.currentMode === 'Operasional') {
    modeFiltered = allEmps.filter(e => e.type === 'Operasional');
  }
  if (gf.outlet !== 'all') modeFiltered = modeFiltered.filter(e => e.outlet_id === gf.outlet);
  const badge = document.getElementById('dc-emp-count-badge');
  if (badge) badge.textContent = modeFiltered.length + ' karyawan (' + (AppState.currentMode || 'Semua') + (gf.outlet !== 'all' ? ' • outlet terpilih' : '') + ')';
  if (modeFiltered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:24px;">Tidak ada karyawan pada tipe ini.</td></tr>';
    return;
  }
  let filtered = modeFiltered;
  const q = (filterText || '').toLowerCase().trim();
  if (q) {
    filtered = modeFiltered.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.nip || '').toLowerCase().includes(q) ||
      (e.role || '').toLowerCase().includes(q) ||
      (e.division || '').toLowerCase().includes(q)
    );
  }
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:24px;">Tidak ada karyawan yang cocok.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(e => {
    return `
      <tr>
        <td>
          <strong>${e.name}</strong>
          <div style="font-size:11px; color:#64748b;">${e.nip} • ${e.email || ''}</div>
        </td>
        <td>
          <span class="card-badge-tag" style="font-size:10px; color:${e.type === 'Management' ? 'var(--burgundy-primary)' : '#0284c7'};">${e.type}</span>
          <div style="font-size:11px; color:#64748b; margin-top:2px;">${e.division}</div>
        </td>
        <td>${e.role}<div style="font-size:11px; color:#64748b;">${e.outlet_name || '-'}</div></td>
        <td><strong>${formatRupiah(e.base_salary)}</strong><div style="font-size:11px; color:#64748b;">+ ${formatRupiah(e.daily_allowance)}/hari</div></td>
        <td>
          <span style="color:#f59e0b; font-weight:700;">⭐ ${e.rating || 0}</span>
          <span style="color:#cbd5e1; margin:0 4px;">|</span>
          <span style="color:var(--burgundy-primary); font-weight:700;">${e.kpi_score || 0}%</span>
        </td>
        <td>${e.employment_status || 'Tetap'}</td>
        <td>
          <button class="btn-primary" style="padding:5px 10px; font-size:11px;" onclick="window.openEditEmployeeModal('${e.id}')">
            <i data-feather="edit-2" style="width:11px; height:11px;"></i> Edit
          </button>
        </td>
      </tr>
    `;
  }).join('');
  if (window.feather) feather.replace();
};

window.dcSearchEmployees = (input) => {
  const text = (input && input.value) || '';
  renderDataCenterEmployeeList(text);
};

window.openEditEmployeeModal = (employeeId) => {
  const emp = (AppState.employees || []).find(e => e.id === employeeId);
  if (!emp) {
    showToast('Data karyawan tidak ditemukan.', 'error');
    return;
  }
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val !== undefined && val !== null ? val : ''; };
  setVal('dc-edit-id', emp.id);
  setVal('dc-edit-name', emp.name);
  setVal('dc-edit-nip-display', emp.nip);
  setVal('dc-edit-phone', emp.phone);
  setVal('dc-edit-type', emp.type);
  window.dcSyncDivisions && window.dcSyncDivisions();
  setVal('dc-edit-division', emp.division);
  const divSelect = document.getElementById('dc-edit-division');
  if (divSelect && emp.division) {
    let exists = false;
    for (let i = 0; i < divSelect.options.length; i++) {
      if (divSelect.options[i].value === emp.division) { exists = true; break; }
    }
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = emp.division;
      opt.textContent = emp.division;
      divSelect.appendChild(opt);
    }
    divSelect.value = emp.division;
  }
  setVal('dc-edit-role', emp.role);
  setVal('dc-edit-outlet', emp.outlet_id);
  setVal('dc-edit-status', emp.employment_status || 'Tetap');
  setVal('dc-edit-base-salary', emp.base_salary);
  setVal('dc-edit-daily-allowance', emp.daily_allowance);
  setVal('dc-edit-meal-allowance', emp.meal_allowance || 0);
  setVal('dc-edit-transport-allowance', emp.transport_allowance || 0);
  setVal('dc-edit-rating', emp.rating);
  setVal('dc-edit-kpi-score', emp.kpi_score);
  const titleEl = document.getElementById('dc-modal-emp-name');
  if (titleEl) titleEl.textContent = emp.name + ' (' + emp.nip + ')';
  const modal = document.getElementById('modal-dc-edit-employee');
  if (modal) {
    modal.classList.add('active');
    if (window.feather) feather.replace();
  }
};

window.submitEditEmployee = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const empId = getVal('dc-edit-id');
  if (!empId) {
    showToast('ID karyawan tidak ditemukan.', 'error');
    return;
  }
  const submitBtn = document.getElementById('btn-dc-save');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Menyimpan...'; }
  const body = {
    name: getVal('dc-edit-name'),
    phone: getVal('dc-edit-phone'),
    type: getVal('dc-edit-type'),
    division: getVal('dc-edit-division'),
    role: getVal('dc-edit-role'),
    outlet_id: getVal('dc-edit-outlet'),
    employment_status: getVal('dc-edit-status'),
    base_salary: Number(getVal('dc-edit-base-salary')) || 0,
    daily_allowance: Number(getVal('dc-edit-daily-allowance')) || 0,
    meal_allowance: Number(getVal('dc-edit-meal-allowance')) || 0,
    transport_allowance: Number(getVal('dc-edit-transport-allowance')) || 0,
    rating: Number(getVal('dc-edit-rating')) || 0,
    kpi_score: Number(getVal('dc-edit-kpi-score')) || 0
  };
  try {
    const res = await fetch(`/api/employees/${empId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || `Data karyawan berhasil diupdate.`, 'success');
      const modal = document.getElementById('modal-dc-edit-employee');
      if (modal) modal.classList.remove('active');
      await loadEmployees();
      renderDataCenterEmployeeList(document.getElementById('dc-search-input')?.value || '');
    } else {
      showToast(data.detail || data.message || 'Gagal update data karyawan.', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat update karyawan.', 'error');
    console.error('Update employee error:', err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-feather="save" style="width:13px; height:13px;"></i> Simpan Perubahan';
      if (window.feather) feather.replace();
    }
  }
};

const DC_DIVISIONS_MGMT = ["HRD", "BM", "Finance", "QC", "Creative", "DOS", "Logistik", "Produksi", "Driver", "HRGA", "Security", "OM", "PCD"];
const DC_DIVISIONS_OPS = ["SPV", "Head Kitchen", "Head Bar", "Kasir", "Server", "Kitchen", "Bar", "PA", "CS"];

window.dcSyncDivisions = () => {
  const typeSel = document.getElementById('dc-edit-type');
  const divSel = document.getElementById('dc-edit-division');
  if (!typeSel || !divSel) return;
  const currentVal = divSel.value;
  const list = typeSel.value === 'Management' ? DC_DIVISIONS_MGMT : DC_DIVISIONS_OPS;
  divSel.innerHTML = list.map(d => `<option value="${d}">${d}</option>`).join('');
  if (list.indexOf(currentVal) >= 0) divSel.value = currentVal;
};

const LOGO_URI_PROFILE = './icons/logo.png';

const renderProfileView = () => {
  const u = AppState.currentUser;
  if (!u) {
    showToast('Sesi login tidak ditemukan. Silakan login kembali.', 'error');
    return;
  }
  const avatarImg = document.getElementById('profile-avatar-preview');
  if (avatarImg) {
    avatarImg.src = u.avatar_url || LOGO_URI_PROFILE;
    avatarImg.onerror = function() { this.onerror = null; this.src = LOGO_URI_PROFILE; };
  }
  const nipEl = document.getElementById('profile-nip');
  if (nipEl) nipEl.textContent = u.nip || '-';
  const emailEl = document.getElementById('profile-email');
  if (emailEl) emailEl.textContent = u.email || '-';
  const divisionEl = document.getElementById('profile-division');
  if (divisionEl) divisionEl.textContent = u.division || '-';
  const roleEl = document.getElementById('profile-role');
  if (roleEl) roleEl.textContent = u.role || '-';
  const outletEl = document.getElementById('profile-outlet');
  if (outletEl) outletEl.textContent = u.outlet_name || '-';
  const gradeEl = document.getElementById('profile-grade');
  if (gradeEl) gradeEl.textContent = u.grade || '-';
  const typeEl = document.getElementById('profile-type');
  if (typeEl) typeEl.textContent = u.type || '-';
  const joinEl = document.getElementById('profile-join-date');
  if (joinEl) joinEl.textContent = u.join_date || '-';
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val !== undefined && val !== null ? val : ''; };
  setVal('profile-name', u.name);
  setVal('profile-email-input', u.email);
  setVal('profile-phone', u.phone);
  setVal('profile-bank-name', u.bank_name || '');
  setVal('profile-bank-account', u.bank_account || '');
  const nipDisp = document.getElementById('profile-nip-display');
  if (nipDisp) nipDisp.textContent = u.nip || '-';
  const contractEmpty = document.getElementById('profile-contract-empty');
  const contractLinkWrap = document.getElementById('profile-contract-link-wrap');
  const contractLink = document.getElementById('profile-contract-link');
  if (contractEmpty && contractLinkWrap && contractLink) {
    if (u.contract_url) {
      contractEmpty.style.display = 'none';
      contractLinkWrap.style.display = 'block';
      contractLink.href = u.contract_url;
    } else {
      contractEmpty.style.display = 'block';
      contractLinkWrap.style.display = 'none';
      contractLink.href = '#';
    }
  }
  const topAvatar = document.getElementById('current-user-avatar');
  if (topAvatar) {
    topAvatar.src = u.avatar_url || LOGO_URI_PROFILE;
    topAvatar.onerror = function() { this.onerror = null; this.src = LOGO_URI_PROFILE; };
  }
  const sidebarAvatar = document.getElementById('sidebar-user-avatar');
  if (sidebarAvatar) {
    sidebarAvatar.src = u.avatar_url || LOGO_URI_PROFILE;
    sidebarAvatar.onerror = function() { this.onerror = null; this.src = LOGO_URI_PROFILE; };
  }
  const displayName = document.getElementById('profile-display-name');
  if (displayName) displayName.textContent = u.name || '-';
};
window.renderProfileView = renderProfileView;

window.uploadProfileAvatar = async (inputEl) => {
  if (!inputEl || !inputEl.files || inputEl.files.length === 0) return;
  const file = inputEl.files[0];
  if (!file.type.startsWith('image/')) {
    showToast('File harus berupa gambar (JPG, PNG, atau WEBP).', 'warning');
    inputEl.value = '';
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    showToast('Ukuran foto maksimal 3MB.', 'warning');
    inputEl.value = '';
    return;
  }
  const submitBtn = document.getElementById('btn-upload-avatar');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengupload...'; }
  const previewImg = document.getElementById('profile-avatar-preview');
  try {
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.substring(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsDataURL(file);
    });
    if (previewImg) previewImg.src = URL.createObjectURL(file);
    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64Data })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Foto profil berhasil diupload.', 'success');
      if (AppState.currentUser) {
        AppState.currentUser.avatar_url = data.url;
        try { localStorage.setItem('tertib_disiplin_auth_user', JSON.stringify(AppState.currentUser)); } catch (e) { /* ignore */ }
      }
      const topAvatar = document.getElementById('current-user-avatar');
      if (topAvatar) topAvatar.src = data.url;
      const sidebarAvatar = document.getElementById('sidebar-user-avatar');
      if (sidebarAvatar) sidebarAvatar.src = data.url;
      if (previewImg) previewImg.src = data.url;
    } else {
      showToast(data.detail || data.message || 'Gagal upload foto profil.', 'error');
      if (previewImg && AppState.currentUser) {
        previewImg.src = AppState.currentUser.avatar_url || LOGO_URI_PROFILE;
      }
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat upload foto.', 'error');
    console.error('Avatar upload error:', err);
    if (previewImg && AppState.currentUser) {
      previewImg.src = AppState.currentUser.avatar_url || LOGO_URI_PROFILE;
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-feather="camera" style="width:13px; height:13px;"></i> Ganti Foto';
      if (window.feather) feather.replace();
    }
    inputEl.value = '';
  }
};

window.uploadProfileContract = async (inputEl) => {
  if (!inputEl || !inputEl.files || !inputEl.files[0]) return;
  const file = inputEl.files[0];
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    showToast('File kontrak harus berupa PDF.', 'warning');
    inputEl.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Ukuran file kontrak maksimal 5MB.', 'warning');
    inputEl.value = '';
    return;
  }
  const submitBtn = document.getElementById('btn-upload-contract');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengupload...'; }
  try {
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.substring(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsDataURL(file);
    });
    const res = await fetch('/api/profile/contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64Data })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Kontrak kerja berhasil diupload.', 'success');
      if (AppState.currentUser) {
        AppState.currentUser.contract_url = data.url;
        try { localStorage.setItem('tertib_disiplin_auth_user', JSON.stringify(AppState.currentUser)); } catch (e) { /* ignore */ }
      }
      try { renderProfileView && renderProfileView(); } catch (e) { /* ignore */ }
      if (window.feather) feather.replace();
    } else {
      showToast(data.detail || data.message || 'Gagal upload kontrak kerja.', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat upload kontrak.', 'error');
    console.error('Contract upload error:', err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-feather="upload" style="width:13px; height:13px;"></i> Upload Kontrak (PDF)';
      if (window.feather) feather.replace();
    }
    inputEl.value = '';
  }
};

window.submitProfileUpdate = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const name = getVal('profile-name');
  const email = getVal('profile-email-input');
  const phone = getVal('profile-phone');
  const bankName = getVal('profile-bank-name');
  const bankAccount = getVal('profile-bank-account');
  if (!name || name.length < 2) { showToast('Nama minimal 2 karakter.', 'warning'); return; }
  if (!email || email.length < 5) { showToast('Email wajib diisi.', 'warning'); return; }
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    showToast('Format email tidak valid. Contoh: nama@perusahaan.com', 'warning');
    return;
  }
  if (!phone || phone.length < 5) { showToast('No. HP minimal 5 karakter.', 'warning'); return; }
  const submitBtn = document.getElementById('btn-save-profile');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Menyimpan...'; }
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, bank_name: bankName, bank_account: bankAccount })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Profil berhasil diupdate.', 'success');
      if (data.user) {
        const currentAvatar = AppState.currentUser ? AppState.currentUser.avatar_url : '';
        AppState.currentUser = Object.assign({}, AppState.currentUser, data.user, { avatar_url: data.user.avatar_url || currentAvatar });
        try { localStorage.setItem('tertib_disiplin_auth_user', JSON.stringify(AppState.currentUser)); } catch (e) { /* ignore */ }
        const nameEl = document.getElementById('current-user-name');
        if (nameEl) nameEl.textContent = AppState.currentUser.name;
        const roleEl = document.getElementById('current-user-role');
        if (roleEl) roleEl.textContent = `${AppState.currentUser.role} (${AppState.currentUser.division})`;
        const sName = document.getElementById('sidebar-user-name');
        if (sName) sName.textContent = AppState.currentUser.name;
        const sRole = document.getElementById('sidebar-user-role');
        if (sRole) sRole.textContent = `${AppState.currentUser.role} (${AppState.currentUser.division})`;
        try { renderProfileView && renderProfileView(); } catch (err) { /* ignore */ }
      }
    } else {
      showToast(data.detail || data.message || 'Gagal update profil.', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat update profil.', 'error');
    console.error('Profile update error:', err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-feather="save" style="width:13px; height:13px;"></i> Simpan Profil';
      if (window.feather) feather.replace();
    }
  }
};

window.submitChangePassword = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const cur = getVal('profile-current-password');
  const np = getVal('profile-new-password');
  const cf = getVal('profile-confirm-password');
  if (!cur) { showToast('Password saat ini wajib diisi.', 'warning'); return; }
  if (np.length < 8) { showToast('Password baru minimal 8 karakter.', 'warning'); return; }
  if (np !== cf) { showToast('Konfirmasi password tidak cocok.', 'warning'); return; }
  const submitBtn = document.getElementById('btn-change-password');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengubah...'; }
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: cur, new_password: np })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Password berhasil diganti.', 'success');
      document.getElementById('profile-current-password').value = '';
      document.getElementById('profile-new-password').value = '';
      document.getElementById('profile-confirm-password').value = '';
    } else {
      showToast(data.detail || data.message || 'Gagal ganti password.', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat ganti password.', 'error');
    console.error('Change password error:', err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-feather="key" style="width:13px; height:13px;"></i> Ganti Password';
      if (window.feather) feather.replace();
    }
  }
};

window.submitChangePin = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const cur = getVal('profile-current-pin');
  const np = getVal('profile-new-pin');
  const cf = getVal('profile-confirm-pin');
  if (!cur) { showToast('PIN saat ini wajib diisi.', 'warning'); return; }
  if (!/^\d{6}$/.test(np)) { showToast('PIN baru harus 6 digit angka.', 'warning'); return; }
  if (np !== cf) { showToast('Konfirmasi PIN tidak cocok.', 'warning'); return; }
  const submitBtn = document.getElementById('btn-change-pin');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengubah...'; }
  try {
    const res = await fetch('/api/auth/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_pin: cur, new_pin: np })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'PIN berhasil diganti.', 'success');
      document.getElementById('profile-current-pin').value = '';
      document.getElementById('profile-new-pin').value = '';
      document.getElementById('profile-confirm-pin').value = '';
    } else {
      showToast(data.detail || data.message || 'Gagal ganti PIN.', 'error');
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat ganti PIN.', 'error');
    console.error('Change PIN error:', err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i data-feather="lock" style="width:13px; height:13px;"></i> Ganti PIN';
      if (window.feather) feather.replace();
    }
  }
};

window.toggleProfileFieldVisibility = (fieldId, btn) => {
  const field = document.getElementById(fieldId);
  if (!field) return;
  if (field.type === 'password') {
    field.type = 'text';
    if (btn) btn.innerHTML = '<i data-feather="eye-off" style="width:14px; height:14px;"></i>';
  } else {
    field.type = 'password';
    if (btn) btn.innerHTML = '<i data-feather="eye" style="width:14px; height:14px;"></i>';
  }
  if (window.feather) feather.replace();
};

window.requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    showToast('Browser tidak mendukung notifikasi.', 'warning');
    return;
  }
  if (Notification.permission === 'granted') {
    showToast('Notifikasi sudah aktif.', 'success');
    return;
  }
  if (Notification.permission !== 'denied') {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      showToast('Notifikasi PWA berhasil diaktifkan!', 'success');
      new Notification('TERTIB DISIPLIN', {
        body: 'Notifikasi aktif. Anda akan mendapat reminder presensi & pesan chat.',
        icon: './icons/icon-192.png'
      });
    } else {
      showToast('Notifikasi ditolak. Aktifkan di pengaturan browser jika diperlukan.', 'warning');
    }
  } else {
    showToast('Notifikasi diblokir. Buka pengaturan browser untuk mengizinkan.', 'warning');
  }
};

const sendNotification = (title, body) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body: body, icon: './icons/icon-192.png', badge: './icons/favicon.png' });
  } catch (e) { /* abaikan */ }
};

const checkPresensiReminder = () => {
  if (!AppState.currentUser) return;
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 9 && hour < 12) {
    const today = now.toISOString().split('T')[0];
    const alreadyCheckedIn = (AppState.attendanceLogs || []).some(a =>
      a.employee_id === AppState.currentUser.id && a.date === today
    );
    if (!alreadyCheckedIn) {
      sendNotification('⏰ Reminder Presensi', 'Anda belum presensi masuk hari ini. Klik untuk presensi.');
    }
  }
};

let lastChatCount = 0;
const checkNewChatMessages = () => {
  if (!AppState.currentUser) return;
  if (AppState.currentView === 'chat') return;
  const badge = document.getElementById('badge-unread-chat');
  if (badge) {
    const count = parseInt(badge.textContent) || 0;
    if (count > lastChatCount && lastChatCount > 0) {
      sendNotification('💬 Pesan Baru', 'Ada pesan baru di Chat Room. Klik untuk membaca.');
    }
    lastChatCount = count;
  }
};

setInterval(() => {
  checkPresensiReminder();
  checkNewChatMessages();
}, 60000);

// v81: renderOutletsTable uses debounced feather
const renderOutletsTable = () => {
  const tbody = document.getElementById('outlets-table-tbody');
  if (!tbody) return;
  tbody.innerHTML = AppState.outlets.map(o => {
    return `
      <tr>
        <td>
          <strong>${o.name}</strong>
          <div style="font-size:11px; color:#64748b;">Kode: ${o.code}</div>
        </td>
        <td>${o.address}</td>
        <td>
          <span style="font-family:monospace; font-weight:700;">${o.lat.toFixed(5)}, ${o.lon.toFixed(5)}</span>
        </td>
        <td>
          <span class="card-badge-tag" style="background:#ecfdf5; color:#065f46;">${o.radius_meters} Meter</span>
        </td>
        <td>${o.manager || '-'}</td>
        <td>${o.phone || '-'}</td>
        <td>
          <button class="btn-secondary" style="font-size:11px; padding:4px 8px;" onclick="promptEditOutletRadius('${o.id}', ${o.radius_meters})">
            Edit Radius
          </button>
        </td>
      </tr>
    `;
  }).join('');
  // v81 FIX: debounced feather
  window.debouncedFeatherReplace && window.debouncedFeatherReplace();
};

const promptEditOutletRadius = async (outletId, currentRadius) => {
  const newRadius = prompt('Masukkan toleransi radius geofence baru (meter):', currentRadius);
  if (!newRadius || isNaN(newRadius)) return;
  const outlet = AppState.outlets.find(o => o.id === outletId);
  if (!outlet) return;
  try {
    await fetch(`/api/outlets/${outletId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...outlet, radius_meters: parseInt(newRadius) })
    });
    showToast('Radius geofence berhasil diperbarui!', 'success');
    await loadOutlets();
  } catch (err) {
    showToast('Gagal mengubah radius', 'error');
  }
};

const openAddOutletModal = () => { openModal('modal-add-outlet'); };

const fetchDeviceLocationForNewOutlet = () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      document.getElementById('new-out-lat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('new-out-lon').value = pos.coords.longitude.toFixed(6);
      showToast('Koordinat perangkat berhasil diisikan otomatis!', 'success');
    });
  }
};

const submitNewOutletForm = async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById('new-out-name').value,
    code: document.getElementById('new-out-code').value,
    radius_meters: parseInt(document.getElementById('new-out-radius').value),
    address: document.getElementById('new-out-address').value,
    lat: parseFloat(document.getElementById('new-out-lat').value),
    lon: parseFloat(document.getElementById('new-out-lon').value),
    phone: '+62 21 0000 0000',
    manager: AppState.currentUser.name
  };
  try {
    const res = await fetch('/api/outlets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('Titik outlet baru berhasil ditambahkan!', 'success');
      closeModal('modal-add-outlet');
      await loadOutlets();
    }
  } catch (err) {
    showToast('Gagal menyimpan outlet', 'error');
  }
};

const toggleUserSwitchModal = () => {
  showToast('Untuk berganti akun, tekan tombol Keluar lalu login dengan akun lain.', 'info');
};

const renderUserSwitchItems = (employees) => {
  const list = document.getElementById('switch-user-list');
  if (!list) return;
  list.innerHTML = employees.slice(0, 40).map(e => `
    <div style="display:flex; align-items:center; gap:12px; padding:8px 12px; border-radius:10px; background:#f8fafc; cursor:pointer;" onclick="selectSwitchUser('${e.id}')">
      <img src="${e.avatar_url}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
      <div style="flex:1;">
        <strong>${e.name}</strong>
        <div style="font-size:11px; color:#64748b;">${e.role} • <strong>${e.division}</strong> (${e.type})</div>
      </div>
      <button class="btn-secondary" style="font-size:10.5px; padding:3px 8px;">Ganti</button>
    </div>
  `).join('');
};

const filterUserSwitchList = (query) => {
  const filtered = AppState.employees.filter(e => e.name.toLowerCase().includes(query.toLowerCase()) || e.role.toLowerCase().includes(query.toLowerCase()) || e.division.toLowerCase().includes(query.toLowerCase()));
  renderUserSwitchItems(filtered);
};

const selectSwitchUser = (empId) => {
  return;
};

const openModal = (id) => {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
};

const closeModal = (id) => {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
};

window.openCreateLeaveModal = () => {
  const modal = document.getElementById('modal-leave-create');
  if (!modal) {
    showToast('Form pengajuan cuti tidak ditemukan.', 'error');
    return;
  }
  const typeEl = document.getElementById('leave-form-type');
  const startEl = document.getElementById('leave-form-start');
  const endEl = document.getElementById('leave-form-end');
  const reasonEl = document.getElementById('leave-form-reason');
  const attachmentEl = document.getElementById('leave-form-attachment');
  if (typeEl) typeEl.value = 'Cuti Tahunan';
  if (startEl) startEl.value = '';
  if (endEl) endEl.value = '';
  if (reasonEl) reasonEl.value = '';
  if (attachmentEl) attachmentEl.value = '';
  const today = new Date().toISOString().split('T')[0];
  if (startEl) startEl.min = today;
  if (endEl) endEl.min = today;
  if (startEl && endEl) {
    startEl.onchange = () => { endEl.min = startEl.value || today; if (endEl.value && endEl.value < startEl.value) endEl.value = startEl.value; };
  }
  modal.classList.add('active');
  if (window.feather) feather.replace();
};
const openCreateLeaveModal = window.openCreateLeaveModal;

const openLightbox = (imgUrl, caption) => {
  document.getElementById('lightbox-image').src = imgUrl;
  document.getElementById('lightbox-caption').textContent = caption || '';
  openModal('modal-lightbox');
};

window.showNotificationCenter = () => {
  const u = AppState.currentUser;
  if (!u) return;
  const notifications = [];
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const holdReports = (AppState.dailyReports || []).filter(r => r.status === 'Hold');
  if (holdReports.length > 0) {
    const myHold = isDashboardAdmin() ? holdReports : holdReports.filter(r => r.reporter_id === u.id);
    if (myHold.length > 0) {
      notifications.push({
        icon: '⚠️',
        title: myHold.length + ' Laporan Berstatus Hold',
        desc: myHold.slice(0, 3).map(r => '• ' + r.title).join('\n') + (myHold.length > 3 ? '\n• ... dan ' + (myHold.length - 3) + ' lainnya' : ''),
        time: 'Baru saja',
        color: '#f59e0b',
        action: 'daily-report'
      });
    }
  }
  const todayLogs = (AppState.attendanceLogs || []).filter(a => a.date === today);
  const myTodayLog = todayLogs.find(a => a.employee_id === u.id);
  if (!myTodayLog) {
    const hour = now.getHours();
    if (hour >= 7 && hour <= 23) {
      notifications.push({
        icon: '⏰',
        title: 'Anda Belum Presensi Masuk Hari Ini',
        desc: 'Klik untuk melakukan presensi GPS & selfie.',
        time: 'Sekarang',
        color: '#ef4444',
        action: 'presensi'
      });
    }
  } else if (!myTodayLog.check_out_time) {
    const checkInTime = myTodayLog.check_in_time ? myTodayLog.check_in_time.split(' ')[1] : '';
    notifications.push({
      icon: '📍',
      title: 'Sudah Presensi Masuk',
      desc: 'Jam masuk: ' + checkInTime + '. Jangan lupa presensi pulang sebelum pulang.',
      time: checkInTime,
      color: '#10b981',
      action: 'presensi'
    });
  }
  if (LEAVE_APPROVER_DIVISIONS.includes(u.division)) {
    const pendingLeaves = (AppState.leaveRequests || []).filter(l => l.status === 'Pending' && l.employee_id !== u.id);
    if (pendingLeaves.length > 0) {
      notifications.push({
        icon: '📋',
        title: pendingLeaves.length + ' Pengajuan Cuti Menunggu Approval',
        desc: pendingLeaves.slice(0, 3).map(l => '• ' + l.employee_name + ' — ' + l.type + ' (' + l.days + ' hari)').join('\n') + (pendingLeaves.length > 3 ? '\n• ... dan ' + (pendingLeaves.length - 3) + ' lainnya' : ''),
        time: 'Baru saja',
        color: '#8b5cf6',
        action: 'leaves'
      });
    }
  }
  const myLeaves = (AppState.leaveRequests || []).filter(l => l.employee_id === u.id && (l.status === 'Approved' || l.status === 'Rejected'));
  const recentLeaves = myLeaves.filter(l => {
    if (!l.updated_at) return false;
    const updated = new Date(l.updated_at);
    const diff = (now - updated) / (1000 * 60 * 60 * 24);
    return diff < 3;
  });
  recentLeaves.slice(0, 3).forEach(l => {
    notifications.push({
      icon: l.status === 'Approved' ? '✅' : '❌',
      title: 'Pengajuan Cuti ' + (l.status === 'Approved' ? 'Disetujui' : 'Ditolak'),
      desc: l.type + ' (' + l.start_date + ' s/d ' + l.end_date + ')' + (l.approver_note ? '\nCatatan: ' + l.approver_note : ''),
      time: l.updated_at ? l.updated_at.split('T')[0] : '',
      color: l.status === 'Approved' ? '#10b981' : '#ef4444',
      action: 'leaves'
    });
  });
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const newSlips = (AppState.payslips || []).filter(s =>
    s.employee_id === u.id && s.period_month === currentMonth && s.period_year === currentYear
  );
  if (newSlips.length > 0) {
    notifications.push({
      icon: '💰',
      title: 'Slip Gaji ' + newSlips[0].period_label + ' Tersedia',
      desc: 'Slip gaji Anda untuk periode ' + newSlips[0].period_label + ' sudah dapat dilihat. Buka dengan PIN 6-digit.',
      time: newSlips[0].paid_date || '',
      color: '#0ea5e9',
      action: 'payroll'
    });
  }
  if (AppState.leaveBalance && AppState.leaveBalance.remaining !== undefined) {
    if (AppState.leaveBalance.remaining <= 3 && AppState.leaveBalance.remaining > 0) {
      notifications.push({
        icon: '🔔',
        title: 'Sisa Cuti Tahunan Menipis',
        desc: 'Sisa cuti Anda tinggal ' + AppState.leaveBalance.remaining + ' hari dari ' + AppState.leaveBalance.entitlement + ' hari/tahun.',
        time: '',
        color: '#f59e0b',
        action: 'leaves'
      });
    }
  }
  renderNotificationPanel(notifications);
};

const renderNotificationPanel = (notifications) => {
  const oldPanel = document.getElementById('notification-panel');
  if (oldPanel) oldPanel.remove();
  const panel = document.createElement('div');
  panel.id = 'notification-panel';
  panel.style.cssText = 'position:fixed; top:70px; right:20px; width:380px; max-width:90vw; max-height:70vh; overflow-y:auto; background:#fff; border-radius:18px; box-shadow:0 16px 40px rgba(0,0,0,0.15); z-index:9999; animation:fadeInUp 0.3s ease; border:1px solid #e2e8f0;';
  if (notifications.length === 0) {
    panel.innerHTML = `
      <div style="padding:20px; text-align:center;">
        <div style="font-size:36px; margin-bottom:8px;">✅</div>
        <p style="font-size:14px; font-weight:700; color:var(--text-dark); margin:0 0 4px 0;">Tidak Ada Notifikasi</p>
        <p style="font-size:12px; color:#94a3b8; margin:0;">Semua caught up. Kerja bagus!</p>
      </div>
    `;
  } else {
    let html = '<div style="padding:14px 16px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">';
    html += '<strong style="font-size:14px; color:var(--burgundy-dark);">🔔 Notifikasi (' + notifications.length + ')</strong>';
    html += '<button onclick="document.getElementById(\'notification-panel\').remove()" style="background:none; border:none; font-size:18px; cursor:pointer; color:#94a3b8;">&times;</button>';
    html += '</div>';
    html += '<div style="padding:4px 0;">';
    notifications.forEach(n => {
      html += `
        <div onclick="document.getElementById('notification-panel').remove(); switchView('${n.action}');" style="padding:12px 16px; border-bottom:1px solid #f1f5f9; cursor:pointer; transition:background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
          <div style="display:flex; gap:10px; align-items:flex-start;">
            <div style="font-size:20px; flex-shrink:0;">${n.icon}</div>
            <div style="flex:1; min-width:0;">
              <p style="font-size:12.5px; font-weight:700; color:var(--text-dark); margin:0 0 2px 0;">${n.title}</p>
              <p style="font-size:11px; color:#64748b; margin:0; white-space:pre-line; line-height:1.4;">${n.desc}</p>
              ${n.time ? '<p style="font-size:10px; color:#94a3b8; margin:4px 0 0 0;">' + n.time + '</p>' : ''}
            </div>
            <div style="width:8px; height:8px; border-radius:50%; background:${n.color}; flex-shrink:0; margin-top:4px;"></div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    panel.innerHTML = html;
  }
  document.body.appendChild(panel);
  setTimeout(() => {
    document.addEventListener('click', function closeNotif(e) {
      const p = document.getElementById('notification-panel');
      if (p && !p.contains(e.target) && e.target.id !== 'btn-notification-trigger' && !e.target.closest('#btn-notification-trigger')) {
        p.remove();
        document.removeEventListener('click', closeNotif);
      }
    });
  }, 100);
};
const showNotificationCenter = window.showNotificationCenter;

const openSplModal = () => {
  const hours = prompt('Jumlah Jam Lembur yang diajukan:', '2');
  if (!hours) return;
  const reason = prompt('Alasan Pekerjaan Lembur (Surat Perintah Lembur):', 'Persiapan event VIP weekend & restock chiller bar');
  if (reason) {
    showToast(`Pengajuan SPL ${hours} Jam telah diteruskan ke SPV & OM untuk di-approval!`, 'success');
  }
};

const fmtLocalDate_ = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

const periodCutoffDate_ = (period) => {
  const today = new Date();
  if (period === 'today') return fmtLocalDate_(today);
  if (period === 'week') { const d = new Date(); d.setDate(d.getDate() - 6); return fmtLocalDate_(d); }
  if (period === 'month') { const d = new Date(); d.setDate(d.getDate() - 29); return fmtLocalDate_(d); }
  return null;
};

const getGlobalFilters = () => {
  const period = document.getElementById('filter-period-select')?.value || 'all';
  const cutoff = periodCutoffDate_(period);
  const todayStr = fmtLocalDate_(new Date());
  return {
    outlet: document.getElementById('filter-outlet-select')?.value || 'all',
    period: period,
    cutoff: cutoff,
    todayStr: todayStr,
    search: (document.getElementById('global-search-input')?.value || '').toLowerCase().trim(),
    mode: AppState.currentMode || 'Management'
  };
};

const dateInPeriod_ = (dateStr, cutoff, todayStr) => {
  if (!cutoff) return true;
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  return d >= cutoff && d <= todayStr;
};

const matchGlobalSearch_ = (search, fields) => {
  if (!search) return true;
  return fields.join('|').toLowerCase().includes(search);
};

const matchGlobalMode_ = (type, division) => {
  const mode = AppState.currentMode || '';
  if (mode !== 'Management' && mode !== 'Operasional') return true;
  if (type) return String(type) === mode;
  const isMgmt = MANAGEMENT_DIVISIONS.indexOf(division) >= 0;
  return mode === 'Management' ? isMgmt : !isMgmt;
};

const activeModeLabel_ = () => {
  const mode = AppState.currentMode || '';
  return (mode === 'Management' || mode === 'Operasional') ? mode : 'Semua';
};

const currentStreamStatus_ = () => {
  const active = document.querySelector('.reviews-tabs-nav .tab-pill-btn.active');
  if (!active) return 'All';
  const m = /filterDashboardReports\('([^']+)'/ .exec(active.getAttribute('onclick') || '');
  return m ? m[1] : 'All';
};

const populateGlobalOutletFilter = () => {
  const sel = document.getElementById('filter-outlet-select');
  if (!sel) return;
  const cur = sel.value || 'all';
  const list = AppState.outlets || [];
  if (list.length === 0) {
    sel.innerHTML = '<option value="all">Semua Outlet</option>';
    return;
  }
  sel.innerHTML = '<option value="all">Semua Outlet</option>' +
    list.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join('');
  if (Array.from(sel.options).some(op => op.value === cur)) sel.value = cur;
};

const populateGlobalPeriodFilter = () => {
  const sel = document.getElementById('filter-period-select');
  if (!sel || sel.options.length > 0) return;
  sel.innerHTML = '<option value="all">Semua Periode</option>' +
    '<option value="today">Hari Ini</option>' +
    '<option value="week">7 Hari Terakhir</option>' +
    '<option value="month">30 Hari Terakhir</option>';
};
window.populateGlobalOutletFilter = populateGlobalOutletFilter;
window.populateGlobalPeriodFilter = populateGlobalPeriodFilter;

const rerenderAllPanels_ = () => {
  const safe = (label, fn) => {
    try { fn(); } catch (err) { console.error(`rerenderAllPanels_ [${label}]:`, err); }
  };
  safe('stream', () => renderDashboardReportsStream(currentStreamStatus_()));
  safe('daily-report', () => renderDailyReportBoard());
  safe('attendance', () => renderAttendanceTable(AppState.attendanceLogs || []));
  safe('data-center', () => renderDataCenterEmployeeList(document.getElementById('dc-search-input')?.value || ''));
  safe('employees', () => renderEmployeesTable(AppState.employees || []));
  safe('sa-users', () => renderSaUsers(document.getElementById('sa-search-input')?.value || ''));
  safe('sa-overview', () => renderSaOverviewDivisions());
  safe('leaves', () => renderLeaveRequestsList(AppState.leaveRequests || []));
  safe('payslips', () => renderPayslipsTable(AppState.payslips || []));
  safe('kpi', () => renderKpiTable(AppState.kpiDivisionStats || []));
  safe('stats', () => updateDashboardStats && updateDashboardStats());
};

const applyGlobalFilters = () => {
  rerenderAllPanels_();
};
window.applyGlobalFilters = applyGlobalFilters;

const initGlobalSearch = () => {
  const input = document.getElementById('global-search-input');
  if (!input) return;
  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(applyGlobalFilters, 250);
  });
};

AppState.dbState = {
  currentTable: 'employees',
  page: 1,
  pageSize: 15,
  search: '',
  totalPages: 1,
  searchTimeout: null
};

const loadDatabaseOverview = async () => {
  try {
    const res = await fetch('/api/database/overview');
    if (!res.ok) throw new Error('Gagal mengambil overview database');
    const data = await res.json();
    const pathEl = document.getElementById('db-path-display');
    if (pathEl) {
      pathEl.innerHTML = `Lokasi File Fisik: <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-weight:600; color:var(--burgundy-primary);">${data.db_path}</code>`;
    }
    const sizeEl = document.getElementById('db-file-size');
    if (sizeEl) sizeEl.textContent = data.file_size_formatted;
    const tableEl = document.getElementById('db-table-count');
    if (tableEl) tableEl.textContent = `${data.tables.length} Tabel Aktif`;
    const totalRecords = data.tables.reduce((acc, t) => acc + t.rows, 0);
    const recEl = document.getElementById('db-record-count');
    if (recEl) recEl.textContent = `${totalRecords.toLocaleString('id-ID')} Baris`;
    const modEl = document.getElementById('db-last-modified');
    if (modEl) modEl.textContent = data.last_modified;
  } catch (err) {
    console.error('Error loadDatabaseOverview:', err);
  }
};

const loadDatabaseTableData = async () => {
  const { currentTable, page, pageSize, search } = AppState.dbState;
  const thead = document.getElementById('db-inspector-thead');
  const tbody = document.getElementById('db-inspector-tbody');
  const countLabel = document.getElementById('db-inspector-count-label');
  const prevBtn = document.getElementById('db-btn-prev');
  const nextBtn = document.getElementById('db-btn-next');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:24px; color:#64748b;">⏳ Memuat data tabel <code>${currentTable}</code>...</td></tr>`;
  try {
    const url = `/api/database/table-data?table=${encodeURIComponent(currentTable)}&page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Gagal mengambil data tabel');
    const data = await res.json();
    AppState.dbState.totalPages = data.total_pages;
    if (thead) {
      thead.innerHTML = `<tr>` + data.columns.map(c => `<th style="white-space:nowrap; background:#f8fafc; color:#475569; padding:10px 14px;">${c}</th>`).join('') + `</tr>`;
    }
    if (data.rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${data.columns.length}" style="text-align:center; padding:24px; color:#94a3b8;">Tidak ada data yang cocok dengan kriteria pencarian.</td></tr>`;
    } else {
      tbody.innerHTML = data.rows.map(row => {
        return `<tr>` + data.columns.map(c => {
          let val = row[c];
          if (val === null || val === undefined) val = '<span style="color:#cbd5e1; font-style:italic;">null</span>';
          else if (typeof val === 'string' && val.length > 50) val = `<span title="${escapeHtml(val)}">${escapeHtml(val.substring(0, 48))}...</span>`;
          else if (typeof val === 'string') val = escapeHtml(val);
          return `<td style="white-space:nowrap; max-width:260px; overflow:hidden; text-overflow:ellipsis; padding:8px 14px;">${val}</td>`;
        }).join('') + `</tr>`;
      }).join('');
    }
    const startIdx = data.total_records === 0 ? 0 : (page - 1) * pageSize + 1;
    const endIdx = Math.min(page * pageSize, data.total_records);
    if (countLabel) {
      countLabel.textContent = `Menampilkan ${startIdx} - ${endIdx} dari ${data.total_records.toLocaleString('id-ID')} data (Halaman ${data.page} dari ${data.total_pages})`;
    }
    if (prevBtn && nextBtn) {
      prevBtn.disabled = (page <= 1);
      nextBtn.disabled = (page >= data.total_pages);
      prevBtn.style.opacity = (page <= 1) ? '0.5' : '1';
      nextBtn.style.opacity = (page >= data.total_pages) ? '0.5' : '1';
    }
  } catch (err) {
    console.error('Error loadDatabaseTableData:', err);
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:24px; color:#ef4444;">❌ Terjadi kesalahan: ${err.message}</td></tr>`;
  }
};

const changeDatabaseTable = (table) => {
  AppState.dbState.currentTable = table;
  AppState.dbState.page = 1;
  const searchInput = document.getElementById('db-table-search');
  if (searchInput) searchInput.value = '';
  AppState.dbState.search = '';
  loadDatabaseTableData();
};

const debounceDatabaseSearch = () => {
  clearTimeout(AppState.dbState.searchTimeout);
  AppState.dbState.searchTimeout = setTimeout(() => {
    const searchInput = document.getElementById('db-table-search');
    AppState.dbState.search = searchInput ? searchInput.value : '';
    AppState.dbState.page = 1;
    loadDatabaseTableData();
  }, 300);
};

const prevDatabasePage = () => {
  if (AppState.dbState.page > 1) {
    AppState.dbState.page--;
    loadDatabaseTableData();
  }
};

const nextDatabasePage = () => {
  if (AppState.dbState.page < AppState.dbState.totalPages) {
    AppState.dbState.page++;
    loadDatabaseTableData();
  }
};

const exportCurrentTableCsv = async () => {
  const table = AppState.dbState.currentTable || 'employees';
  showToast(`Mengekspor tabel ${table} ke file CSV / Excel...`, 'info');
  try {
    const res = await fetch(`/api/database/export-csv/${table}`);
    if (!res.ok) {
      const d = await res.json();
      showToast(d.detail || 'Gagal mengekspor CSV', 'error');
      return;
    }
    const text = await res.text();
    tdDownloadText(text, res.headers.get('X-Filename') || `${table}.csv`, 'text/csv;charset=utf-8');
  } catch (err) {
    showToast('Gagal mengekspor CSV', 'error');
  }
};

const openDatabaseSheet = async (ev) => {
  if (ev) ev.preventDefault();
  const w = window.open('', '_blank');
  try {
    const res = await fetch('/api/database/overview');
    const d = await res.json();
    if (res.ok && d.db_url && w) { w.location = d.db_url; return; }
    if (w) w.close();
    showToast(d.detail || 'Gagal membuka Spreadsheet', 'error');
  } catch (err) {
    if (w) w.close();
    showToast('Gagal membuka Spreadsheet', 'error');
  }
};

const confirmResetDatabase = async () => {
  const confirmMsg = "⚠️ PERINGATAN:\nReset akan MENGHAPUS SEMUA data (karyawan, presensi, laporan, slip gaji) dan membuat akun admin baru.\nLanjutkan?";
  if (!confirm(confirmMsg)) return;
  try {
    const typed = prompt('Ketik RESET (huruf besar) untuk benar-benar menghapus semua data:');
    if (typed !== 'RESET') { showToast('Reset dibatalkan.', 'info'); return; }
    showToast('Sedang mereset database...', 'info');
    const res = await fetch('/api/database/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'RESET' })
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message || 'Database berhasil direset.');
      await loadDatabaseOverview();
      await loadDatabaseTableData();
      await loadEmployees();
      await loadDailyReports();
      await loadAttendanceLogs();
      await loadPayslips();
    } else {
      showToast(data.detail || 'Gagal mereset database', 'error');
    }
  } catch (err) {
    showToast('Koneksi terputus saat mereset database', 'error');
  }
};

const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

AppState.saUsers = [];
AppState.saSettingsLoaded = false;

window.openSaUsersPanel = () => {
  if (!isFullAccess()) {
    showToast('Hanya Super Admin (OM/PCD) yang dapat mengatur Penyesuaian Cuti karyawan.', 'error');
    return;
  }
  if (typeof switchView === 'function') switchView('superadmin');
  setTimeout(() => {
    if (typeof window.saSwitchTab === 'function') window.saSwitchTab('users');
    const tbl = document.getElementById('sa-tab-users');
    if (tbl) tbl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Buka karyawan lalu klik "Edit" untuk mengatur Penyesuaian Cuti (±hari).', 'info');
  }, 250);
};

AppState.__joinDate = { employees: [], selectedId: null };

window.openJoinDateModal = async () => {
  const u = AppState.currentUser;
  if (!u || (!isSuperAdminUser(u) && u.division !== 'PCD')) {
    showToast('Hanya Super Admin atau PCD yang dapat mengatur Tanggal Bergabung.', 'error');
    return;
  }
  const sel = document.getElementById('join-date-emp-select');
  const inpGroup = document.getElementById('join-date-input-group');
  const inp = document.getElementById('join-date-input');
  const info = document.getElementById('join-date-info');
  if (sel) sel.value = '';
  if (inp) inp.value = '';
  if (inpGroup) inpGroup.style.display = 'none';
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }
  AppState.__joinDate.selectedId = null;
  if (sel) {
    sel.innerHTML = '<option value="">— Memuat daftar karyawan... —</option>';
    try {
      const res = await fetch('/api/employees?limit=500');
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data && data.body && Array.isArray(data.body) ? data.body : []);
      AppState.__joinDate.employees = list;
      if (list.length === 0) {
        sel.innerHTML = '<option value="">— Tidak ada karyawan —</option>';
      } else {
        sel.innerHTML = '<option value="">— Pilih karyawan —</option>' +
          list.map(e => `<option value="${e.id}">${e.name} (${e.nip || '-'}) — ${e.division || '-'}/${e.role || '-'}</option>`).join('');
      }
    } catch (err) {
      sel.innerHTML = '<option value="">— Gagal memuat daftar karyawan —</option>';
      showToast('Gagal memuat daftar karyawan: ' + (err.message || 'kesalahan'), 'error');
    }
  }
  openModal('modal-join-date');
  if (window.feather) setTimeout(() => feather.replace(), 50);
};

window.onJoinDateEmpChange = (empId) => {
  const inpGroup = document.getElementById('join-date-input-group');
  const inp = document.getElementById('join-date-input');
  const info = document.getElementById('join-date-info');
  const emp = AppState.__joinDate.employees.find(e => e.id === empId);
  if (!emp) {
    if (inpGroup) inpGroup.style.display = 'none';
    if (info) { info.style.display = 'none'; info.innerHTML = ''; }
    AppState.__joinDate.selectedId = null;
    return;
  }
  AppState.__joinDate.selectedId = empId;
  if (inpGroup) inpGroup.style.display = 'block';
  if (inp) inp.value = emp.join_date || '';
  if (info) {
    info.style.display = 'block';
    info.innerHTML = `
      <div><strong>Nama:</strong> ${emp.name || '-'}</div>
      <div><strong>NIP:</strong> ${emp.nip || '-'}</div>
      <div><strong>Divisi / Jabatan:</strong> ${emp.division || '-'} / ${emp.role || '-'}</div>
      <div><strong>Outlet:</strong> ${emp.outlet_name || '-'}</div>
      <div><strong>Tanggal Bergabung Saat Ini:</strong> ${emp.join_date || '<span style="color:#dc2626;">(belum diatur)</span>'}</div>
    `;
  }
};

window.saveJoinDate = async () => {
  const empId = AppState.__joinDate.selectedId;
  if (!empId) {
    showToast('Pilih karyawan dulu.', 'warning');
    return;
  }
  const inp = document.getElementById('join-date-input');
  const jd = inp ? String(inp.value || '').trim() : '';
  if (jd && !/^\d{4}-\d{2}-\d{2}$/.test(jd)) {
    showToast('Format tanggal tidak valid. Gunakan YYYY-MM-DD.', 'error');
    return;
  }
  const btn = document.getElementById('btn-save-join-date');
  const origText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
  try {
    const res = await fetch(`/api/employees/${empId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ join_date: jd })
    });
    const data = await res.json();
    if (res.ok && (data.status === 'success' || data.employee)) {
      showToast('Tanggal bergabung berhasil disimpan.', 'success');
      const emp = AppState.__joinDate.employees.find(e => e.id === empId);
      if (emp) emp.join_date = jd;
      closeModal('modal-join-date');
    } else {
      showToast(data.detail || data.message || 'Gagal menyimpan tanggal bergabung.', 'error');
    }
  } catch (err) {
    showToast('Gagal menyimpan: koneksi terputus.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
  }
};

window.saSwitchTab = (tab) => {
  ['overview', 'users', 'settings'].forEach(t => {
    const panel = document.getElementById('sa-tab-' + t);
    const btn = document.getElementById('sa-tab-btn-' + t);
    if (panel) panel.style.display = (t === tab) ? '' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  if (tab === 'overview') window.loadSaOverview && window.loadSaOverview();
  if (tab === 'users') window.loadSaUsers && window.loadSaUsers();
  if (tab === 'settings') window.loadSaSettings && window.loadSaSettings();
};

window.loadSaOverview = async () => {
  const wrap = document.getElementById('sa-overview-stats');
  if (!wrap) return;
  try {
    const res = await fetch('/api/admin/overview');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) {
        wrap.innerHTML = `<div class="modern-card" style="padding:20px; text-align:left; color:#991b1b; grid-column:1/-1; background:#fef2f2; border:1px solid #fecaca;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
            <i data-feather="alert-triangle" style="width:20px; height:20px; color:#dc2626;"></i>
            <strong style="font-size:14px;">Backend Apps Script belum diperbarui (HTTP 404)</strong>
          </div>
          <p style="font-size:12px; color:#7f1d1d; margin:0 0 10px 0; line-height:1.5;">
            Endpoint <code style="background:#fee2e2; padding:1px 6px; border-radius:4px;">/api/admin/overview</code> tidak ditemukan di server.
            Backend Code.gs versi lama masih dipakai di Apps Script. Anda WAJIB deploy ulang Code.gs supaya fitur Panel SUPER ADMIN berfungsi.
          </p>
          <ol style="font-size:12px; color:#7f1d1d; margin:8px 0 12px 18px; line-height:1.7;">
            <li>Buka <a href="https://script.google.com" target="_blank" style="color:#dc2626; font-weight:700;">script.google.com</a> &rarr; pilih project TERTIB DISIPLIN</li>
            <li>Buka file <code style="background:#fee2e2; padding:1px 6px; border-radius:4px;">Code.gs</code> di sidebar kiri</li>
            <li>Hapus seluruh isi, lalu paste isi <code style="background:#fee2e2; padding:1px 6px; border-radius:4px;">Code.gs</code> baru dari paket update</li>
            <li>Klik <strong>Deploy &rarr; Manage deployments</strong></li>
            <li>Pilih deployment aktif &rarr; klik <strong>Edit</strong> (ikon pensil)</li>
            <li>Set <strong>"Version"</strong> ke <strong>New version</strong> &rarr; klik <strong>Deploy</strong></li>
            <li>Tunggu 30 detik, lalu refresh PWA. Cek versi harus <code style="background:#fee2e2; padding:1px 6px; border-radius:4px;">v45-leave-fix</code> atau lebih baru.</li>
          </ol>
        </div>`;
        if (window.feather) feather.replace();
        return;
      }
      wrap.innerHTML = `<div class="modern-card" style="padding:18px; text-align:center; color:#ef4444; grid-column:1/-1;">${escapeHtml(data.detail || ('Gagal memuat ringkasan sistem (HTTP ' + res.status + ').'))}</div>`;
      return;
    }
    const stats = [
      { label: 'Total Pengguna', val: data.total_users, color: '#701c34', icon: '👥' },
      { label: 'Akun Aktif', val: data.active_users, color: '#059669', icon: '✅' },
      { label: 'Akun Nonaktif', val: data.inactive_users, color: '#dc2626', icon: '🚫' },
      { label: 'Super Admin', val: data.super_admins, color: '#d97706', icon: '🛡️' },
      { label: 'Outlet Terdaftar', val: data.total_outlets, color: '#0284c7', icon: '📍' },
      { label: 'Presensi Hari Ini', val: data.attendance_today, color: '#701c34', icon: '🕐' },
      { label: 'Terlambat Hari Ini', val: data.late_today, color: '#ea580c', icon: '⏰' },
      { label: 'Cuti Menunggu OK', val: data.pending_leaves, color: '#7c3aed', icon: '🌴' }
    ];
    wrap.innerHTML = stats.map(s => `
      <div class="modern-card" style="padding:16px; text-align:center;">
        <div style="font-size:22px; margin-bottom:4px;">${s.icon}</div>
        <div style="font-size:26px; font-weight:800; color:${s.color}; line-height:1.1;">${Number(s.val || 0).toLocaleString('id-ID')}</div>
        <div style="font-size:11px; color:#64748b; font-weight:600; margin-top:4px; text-transform:uppercase;">${s.label}</div>
      </div>
    `).join('');
    const attBox = document.getElementById('sa-overview-attendance');
    if (attBox) {
      attBox.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; padding:10px 14px; background:#f8fafc; border-radius:10px;"><span>Total presensi hari ini</span><strong>${data.attendance_today}</strong></div>
          <div style="display:flex; justify-content:space-between; padding:10px 14px; background:#fff7ed; border-radius:10px;"><span>Terlambat</span><strong style="color:#ea580c;">${data.late_today}</strong></div>
          <div style="display:flex; justify-content:space-between; padding:10px 14px; background:#fef2f2; border-radius:10px;"><span>Laporan status Proses</span><strong style="color:#dc2626;">${data.pending_reports}</strong></div>
          <div style="display:flex; justify-content:space-between; padding:10px 14px; background:#fefce8; border-radius:10px;"><span>Laporan status Hold</span><strong style="color:#a16207;">${data.hold_reports}</strong></div>
        </div>`;
    }
    AppState.saOverview = data;
    renderSaOverviewDivisions();
  } catch (err) {
    console.error('loadSaOverview error:', err);
    if (wrap) wrap.innerHTML = '<div class="modern-card" style="padding:18px; text-align:center; color:#ef4444; grid-column:1/-1;">Kesalahan koneksi saat memuat ringkasan.</div>';
  }
};

const renderSaOverviewDivisions = () => {
  const divBox = document.getElementById('sa-overview-divisions');
  if (!divBox || !AppState.saOverview) return;
  const counts = AppState.saOverview.division_counts || {};
  let keys = Object.keys(counts);
  const gf = getGlobalFilters();
  if (gf.mode === 'Management') keys = keys.filter(k => MANAGEMENT_DIVISIONS.indexOf(k) >= 0);
  else if (gf.mode === 'Operasional') keys = keys.filter(k => MANAGEMENT_DIVISIONS.indexOf(k) < 0);
  keys.sort((a, b) => counts[b] - counts[a]);
  divBox.innerHTML = keys.length === 0
    ? `<span style="color:#94a3b8;">Tidak ada data divisi untuk Mode ${activeModeLabel_()}.</span>`
    : keys.map(k => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 14px; border-bottom:1px solid #f1f5f9;">
            <span style="font-weight:600;">${escapeHtml(k)}</span>
            <span class="card-badge-tag" style="background:#f1f5f9; color:#475569;">${counts[k]} orang</span>
          </div>`).join('');
};

window.loadSaUsers = async () => {
  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) {
        const tbody = document.getElementById('sa-users-tbody');
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="8" style="padding:24px; text-align:left; background:#fef2f2; color:#991b1b;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
              <i data-feather="alert-triangle" style="width:18px; height:18px; color:#dc2626;"></i>
              <strong>Backend Apps Script belum diperbarui (HTTP 404)</strong>
            </div>
            <p style="font-size:12px; margin:0 0 10px 0; line-height:1.5;">
              Endpoint <code style="background:#fee2e2; padding:1px 6px; border-radius:4px;">/api/admin/users</code> tidak ditemukan.
              Deploy ulang Code.gs (versi v45-leave-fix atau lebih baru) supaya Panel SUPER ADMIN berfungsi.
              Lihat panduan lengkap di tab <strong>Ringkasan</strong>.
            </p>
          </td></tr>`;
          if (window.feather) feather.replace();
        }
        return;
      }
      showToast(data.detail || 'Gagal memuat daftar pengguna.', 'error');
      return;
    }
    AppState.saUsers = Array.isArray(data) ? data : [];
    renderSaUsers((document.getElementById('sa-search-input') || {}).value || '');
  } catch (err) {
    console.error('loadSaUsers error:', err);
    showToast('Kesalahan koneksi saat memuat pengguna.', 'error');
  }
};

// v81: renderSaUsers uses debounced feather
const renderSaUsers = (filterText = '') => {
  const tbody = document.getElementById('sa-users-tbody');
  if (!tbody) return;
  const me = AppState.currentUser;
  let list = AppState.saUsers || [];
  const gf = getGlobalFilters();
  if (gf.mode === 'Management' || gf.mode === 'Operasional') {
    list = list.filter(e => (e.type || '') === gf.mode);
  }
  const q = (filterText || '').toLowerCase().trim();
  if (q) {
    list = list.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.nip || '').toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q) ||
      (e.division || '').toLowerCase().includes(q) ||
      (e.role || '').toLowerCase().includes(q)
    );
  }
  const note = document.getElementById('sa-users-filter-note');
  if (note) {
    const parts = [];
    parts.push(`Mode: <b>${activeModeLabel_()}</b>`);
    if (gf.outlet !== 'all') {
      const o = (AppState.outlets || []).find(x => x.id === gf.outlet);
      parts.push(`Outlet: <b>${escapeHtml(o ? o.name : gf.outlet)}</b>`);
    }
    if (gf.search) parts.push(`Pencarian: "<b>${escapeHtml(gf.search)}</b>"`);
    note.innerHTML = `🔍 Menampilkan <b>${list.length}</b> pengguna • ${parts.join(' • ')}`;
  }
  if (list.length === 0) {
    const modeFiltered = gf.mode === 'Management' || gf.mode === 'Operasional';
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:24px;">Tidak ada pengguna${modeFiltered ? ` untuk Mode ${activeModeLabel_()}` : ' yang cocok'}.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(e => {
    const isSA = e.is_super_admin;
    const isMe = me && e.id === me.id;
    const inactive = e.account_status === 'Nonaktif';
    const roleBadge = isSA
      ? '<span class="card-badge-tag" style="background:linear-gradient(135deg,#fef3c7,#fde68a); color:#92400e; font-weight:800;">🛡️ SUPER ADMIN</span>'
      : `<span style="font-size:12px;">${escapeHtml(e.role || '-')}</span>`;
    return `
      <tr style="${inactive ? 'opacity:.6;' : ''}">
        <td>
          <strong>${escapeHtml(e.name)}${isMe ? ' <span style="font-size:10px; color:#94a3b8;">(Anda)</span>' : ''}</strong>
          <div style="font-size:11px; color:#64748b;">${escapeHtml(e.nip)} • ${escapeHtml(e.email || '-')}</div>
        </td>
        <td>
          <span class="card-badge-tag" style="font-size:10px; color:${e.type === 'Management' ? 'var(--burgundy-primary)' : '#0284c7'};">${escapeHtml(e.type || '-')}</span>
          <div style="font-size:11px; color:#64748b; margin-top:2px;">${escapeHtml(e.division || '-')}</div>
        </td>
        <td>${roleBadge}</td>
        <td style="font-size:12px;">${escapeHtml(e.outlet_name || '-')}</td>
        <td style="font-size:12px; white-space:nowrap;">
          ${(e.leave_balance && e.leave_balance.entitlement !== undefined) ? (() => {
            const lb = e.leave_balance;
            const a = Number(lb.adjustment) || 0;
            const col = (lb.remaining || 0) >= 6 ? '#059669' : ((lb.remaining || 0) >= 3 ? '#d97706' : '#dc2626');
            return `<strong style="color:${col};">${lb.remaining}</strong><span style="color:#94a3b8;"> / ${lb.entitlement} hari</span>` +
              (a !== 0 ? `<div style="font-size:10px; font-weight:700; color:${a > 0 ? '#059669' : '#dc2626'};">penyesuaian ${a > 0 ? '+' : ''}${a}</div>` : '') +
              ((lb.used || 0) > 0 ? `<div style="font-size:10px; color:#94a3b8;">terpakai ${lb.used}</div>` : '');
          })() : '<span style="color:#cbd5e1;">-</span>'}
        </td>
        <td>
          <span class="card-badge-tag" style="font-size:10px; background:${inactive ? '#fef2f2; color:#991b1b' : '#ecfdf5; color:#065f46'};">${inactive ? '🚫 Nonaktif' : '✅ Aktif'}</span>
          <div style="font-size:10px; color:#94a3b8; margin-top:2px;">${escapeHtml(e.employment_status || '-')}</div>
        </td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn-primary" style="padding:5px 10px; font-size:11px;" onclick="window.openSaEditUser('${e.id}')">
              <i data-feather="edit-2" style="width:11px; height:11px;"></i> Edit
            </button>
            <button class="btn-secondary" style="padding:5px 8px; font-size:11px;" title="Reset password login" onclick="window.saResetPassword('${e.id}')">🔑</button>
            <button class="btn-secondary" style="padding:5px 8px; font-size:11px;" title="Reset PIN slip gaji" onclick="window.saResetPin('${e.id}')">🔒</button>
            ${isMe ? '' : `<button class="btn-secondary" style="padding:5px 8px; font-size:11px; ${inactive ? 'color:#059669; border-color:#a7f3d0;' : 'color:#dc2626; border-color:#fca5a5;'}" title="${inactive ? 'Aktifkan akun' : 'Nonaktifkan akun'}" onclick="window.saToggleStatus('${e.id}')">${inactive ? '▶' : '⏸'}</button>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');
  // v81 FIX: debounced feather
  window.debouncedFeatherReplace && window.debouncedFeatherReplace();
};
window.saSearchUsers = (input) => renderSaUsers((input && input.value) || '');

const SA_DIVISIONS_MGMT = ["HRD", "BM", "Finance", "QC", "Creative", "DOS", "Logistik", "Produksi", "Driver", "HRGA", "Security", "OM", "PCD"];
const SA_DIVISIONS_OPS = ["SPV", "Head Kitchen", "Head Bar", "Kasir", "Server", "Kitchen", "Bar", "PA", "CS"];
window.saSyncDivisions = () => {
  const typeSel = document.getElementById('sa-user-type');
  const divSel = document.getElementById('sa-user-division');
  if (!typeSel || !divSel) return;
  const currentVal = divSel.value;
  const list = typeSel.value === 'Management' ? SA_DIVISIONS_MGMT : SA_DIVISIONS_OPS;
  divSel.innerHTML = list.map(d => `<option value="${d}">${d}</option>`).join('');
  if (list.indexOf(currentVal) >= 0) divSel.value = currentVal;
};
window.saSyncRoleField = () => {
  const superSel = document.getElementById('sa-user-superrole');
  const roleInput = document.getElementById('sa-user-role');
  if (!superSel || !roleInput) return;
  if (superSel.value === SUPER_ADMIN_ROLE) {
    roleInput.value = SUPER_ADMIN_ROLE;
    roleInput.readOnly = true;
    roleInput.style.background = '#fef3c7';
  } else {
    roleInput.readOnly = false;
    roleInput.style.background = '';
  }
};
const populateSaOutlets = (selectedId) => {
  const sel = document.getElementById('sa-user-outlet');
  if (!sel) return;
  const outlets = AppState.outlets || [];
  if (outlets.length === 0) {
    sel.innerHTML = '<option value="">— Outlet belum termuat —</option>';
    return;
  }
  sel.innerHTML = outlets.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join('');
  if (selectedId) sel.value = selectedId;
};

window.saLoadLeaveInfo = async (userId) => {
  const box = document.getElementById('sa-user-leave-info');
  if (!box || !userId) return;
  box.style.display = 'block';
  box.innerHTML = '<span style="color:#94a3b8;">⏳ Memuat sisa cuti...</span>';
  try {
    const res = await fetch(`/api/leaves/balance?employee_id=${encodeURIComponent(userId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.remaining !== 'number') { box.style.display = 'none'; return; }
    const a = Number(data.adjustment) || 0;
    box.innerHTML = `📊 <b>Sisa cuti saat ini: ${data.remaining} hari</b> dari hak ${data.entitlement} hari` +
      (a !== 0 ? ` (termasuk penyesuaian <b>${a > 0 ? '+' : ''}${a}</b>)` : '') +
      ` • terpakai ${data.used || 0}${(data.pending || 0) > 0 ? `, pending ${data.pending}` : ''}.` +
      ' Ubah nilai di atas lalu Simpan untuk menyesuaikan.';
  } catch (err) { box.style.display = 'none'; }
};

window.openSaEditUser = (userId) => {
  const emp = (AppState.saUsers || []).find(e => e.id === userId);
  if (!emp) { showToast('Data pengguna tidak ditemukan.', 'error'); return; }
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val !== undefined && val !== null) ? val : ''; };
  document.getElementById('sa-user-mode').value = 'edit';
  document.getElementById('sa-user-id').value = emp.id;
  const titleEl = document.getElementById('sa-user-modal-title');
  if (titleEl) titleEl.textContent = 'Edit Pengguna: ' + emp.name;
  setVal('sa-user-name', emp.name);
  setVal('sa-user-nip', emp.nip);
  setVal('sa-user-email', emp.email);
  setVal('sa-user-phone', emp.phone);
  setVal('sa-user-type', emp.type);
  window.saSyncDivisions && window.saSyncDivisions();
  setVal('sa-user-division', emp.division);
  const divSel = document.getElementById('sa-user-division');
  if (divSel && emp.division) {
    let exists = false;
    for (let i = 0; i < divSel.options.length; i++) if (divSel.options[i].value === emp.division) { exists = true; break; }
    if (!exists) { const opt = document.createElement('option'); opt.value = emp.division; opt.textContent = emp.division; divSel.appendChild(opt); }
    divSel.value = emp.division;
  }
  const superSel = document.getElementById('sa-user-superrole');
  if (superSel) superSel.value = emp.is_super_admin ? SUPER_ADMIN_ROLE : '';
  setVal('sa-user-role', emp.role);
  window.saSyncRoleField && window.saSyncRoleField();
  populateSaOutlets(emp.outlet_id);
  setVal('sa-user-account-status', emp.account_status || 'Aktif');
  setVal('sa-user-employment-status', emp.employment_status || 'Tetap');
  setVal('sa-user-base-salary', emp.base_salary);
  setVal('sa-user-daily-allowance', emp.daily_allowance);
  setVal('sa-user-meal-allowance', emp.meal_allowance || 0);
  setVal('sa-user-transport-allowance', emp.transport_allowance || 0);
  setVal('sa-user-rating', emp.rating);
  setVal('sa-user-kpi-score', emp.kpi_score);
  setVal('sa-user-leave-adjustment', Number(emp.leave_adjustment) || 0);
  setVal('sa-user-join-date', emp.join_date || '');
  setVal('sa-user-tunjangan-jabatan', Number(emp.tunjangan_jabatan) || 0);
  setVal('sa-user-tunjangan-bonus', Number(emp.tunjangan_bonus) || 0);
  const saContractLink = document.getElementById('sa-user-contract-link');
  const saContractStatus = document.getElementById('sa-user-contract-status');
  if (saContractLink && saContractStatus) {
    if (emp.contract_url) {
      saContractLink.href = emp.contract_url;
      saContractLink.style.display = 'inline-flex';
      saContractStatus.textContent = 'Kontrak sudah di-upload. Klik link untuk lihat.';
    } else {
      saContractLink.href = '#';
      saContractLink.style.display = 'none';
      saContractStatus.textContent = 'Belum ada file kontrak';
    }
  }
  const geoExemptChk = document.getElementById('sa-user-geofence-exempt');
  if (geoExemptChk) {
    geoExemptChk.checked = Number(emp.geofence_exempt) === 1;
    const isMgmt = MANAGEMENT_DIVISIONS.indexOf(emp.division) >= 0;
    if (isMgmt) {
      geoExemptChk.checked = true;
      geoExemptChk.disabled = true;
    } else {
      geoExemptChk.disabled = false;
    }
  }
  AppState.__saEditingUserId = emp.id;
  const pwGroup = document.getElementById('sa-user-password-group');
  const pinGroup = document.getElementById('sa-user-pin-group');
  if (pwGroup) pwGroup.style.display = 'none';
  if (pinGroup) pinGroup.style.display = 'none';
  const pwInput = document.getElementById('sa-user-password'); if (pwInput) pwInput.value = '';
  const pinInput = document.getElementById('sa-user-pin'); if (pinInput) pinInput.value = '';
  const me = AppState.currentUser;
  const isSelf = me && emp.id === me.id;
  if (superSel) superSel.disabled = isSelf;
  const statusSel = document.getElementById('sa-user-account-status');
  if (statusSel) statusSel.disabled = isSelf;
  openModal('modal-sa-user');
  if (window.feather) feather.replace();
  window.saLoadLeaveInfo(userId);
};

window.openSaAddUser = () => {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val !== undefined && val !== null) ? val : ''; };
  document.getElementById('sa-user-mode').value = 'create';
  document.getElementById('sa-user-id').value = '';
  const titleEl = document.getElementById('sa-user-modal-title');
  if (titleEl) titleEl.textContent = 'Tambah Pengguna Baru';
  ['sa-user-name', 'sa-user-nip', 'sa-user-email', 'sa-user-phone', 'sa-user-password', 'sa-user-pin',
   'sa-user-base-salary', 'sa-user-daily-allowance', 'sa-user-meal-allowance', 'sa-user-transport-allowance',
   'sa-user-rating', 'sa-user-kpi-score', 'sa-user-leave-adjustment', 'sa-user-join-date',
   'sa-user-tunjangan-jabatan', 'sa-user-tunjangan-bonus'].forEach(id => setVal(id, ''));
  const saContractLink = document.getElementById('sa-user-contract-link');
  const saContractStatus = document.getElementById('sa-user-contract-status');
  if (saContractLink) { saContractLink.href = '#'; saContractLink.style.display = 'none'; }
  if (saContractStatus) saContractStatus.textContent = 'Belum ada file kontrak (akun baru)';
  const geoExemptChk = document.getElementById('sa-user-geofence-exempt');
  if (geoExemptChk) { geoExemptChk.checked = false; geoExemptChk.disabled = false; }
  AppState.__saEditingUserId = null;
  const leaveInfo = document.getElementById('sa-user-leave-info');
  if (leaveInfo) { leaveInfo.style.display = 'none'; leaveInfo.innerHTML = ''; }
  setVal('sa-user-type', 'Operasional');
  window.saSyncDivisions && window.saSyncDivisions();
  setVal('sa-user-division', 'Server');
  const superSel = document.getElementById('sa-user-superrole');
  if (superSel) { superSel.value = ''; superSel.disabled = false; }
  setVal('sa-user-role', '');
  window.saSyncRoleField && window.saSyncRoleField();
  populateSaOutlets('');
  setVal('sa-user-account-status', 'Aktif');
  setVal('sa-user-employment-status', 'Tetap');
  const statusSel = document.getElementById('sa-user-account-status');
  if (statusSel) statusSel.disabled = false;
  const pwGroup = document.getElementById('sa-user-password-group');
  const pinGroup = document.getElementById('sa-user-pin-group');
  if (pwGroup) pwGroup.style.display = '';
  if (pinGroup) pinGroup.style.display = '';
  openModal('modal-sa-user');
  if (window.feather) feather.replace();
};

window.submitSaUser = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const mode = getVal('sa-user-mode');
  const userId = getVal('sa-user-id');
  const btn = document.getElementById('btn-sa-user-save');
  const roleVal = getVal('sa-user-superrole') === SUPER_ADMIN_ROLE ? SUPER_ADMIN_ROLE : getVal('sa-user-role');
  const body = {
    name: getVal('sa-user-name'),
    nip: getVal('sa-user-nip'),
    email: getVal('sa-user-email'),
    phone: getVal('sa-user-phone'),
    type: getVal('sa-user-type'),
    division: getVal('sa-user-division'),
    role: roleVal,
    outlet_id: getVal('sa-user-outlet'),
    employment_status: getVal('sa-user-employment-status'),
    account_status: getVal('sa-user-account-status'),
    base_salary: getVal('sa-user-base-salary') === '' ? undefined : Number(getVal('sa-user-base-salary')),
    daily_allowance: getVal('sa-user-daily-allowance') === '' ? undefined : Number(getVal('sa-user-daily-allowance')),
    meal_allowance: getVal('sa-user-meal-allowance') === '' ? 0 : Number(getVal('sa-user-meal-allowance')),
    transport_allowance: getVal('sa-user-transport-allowance') === '' ? 0 : Number(getVal('sa-user-transport-allowance')),
    rating: getVal('sa-user-rating') === '' ? undefined : Number(getVal('sa-user-rating')),
    kpi_score: getVal('sa-user-kpi-score') === '' ? undefined : Number(getVal('sa-user-kpi-score')),
    leave_adjustment: getVal('sa-user-leave-adjustment') === '' ? 0 : Number(getVal('sa-user-leave-adjustment')),
    join_date: getVal('sa-user-join-date') || '',
    tunjangan_jabatan: getVal('sa-user-tunjangan-jabatan') === '' ? 0 : Number(getVal('sa-user-tunjangan-jabatan')),
    tunjangan_bonus: getVal('sa-user-tunjangan-bonus') === '' ? 0 : Number(getVal('sa-user-tunjangan-bonus')),
    geofence_exempt: (() => {
      const chk = document.getElementById('sa-user-geofence-exempt');
      return chk && chk.checked ? 1 : 0;
    })()
  };
  if (mode === 'create') {
    body.password = getVal('sa-user-password') || '';
    body.pin_code = getVal('sa-user-pin') || '';
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
  try {
    const res = await fetch(mode === 'create' ? '/api/admin/users' : `/api/admin/users/${userId}`, {
      method: mode === 'create' ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === 'success') {
      let extraMsg = '';
      if (mode !== 'create' && userId) {
        try {
          const br = await fetch(`/api/leaves/balance?employee_id=${encodeURIComponent(userId)}`);
          if (br.ok) {
            const bal = await br.json();
            if (typeof bal.remaining === 'number') {
              const a = Number(bal.adjustment) || 0;
              extraMsg = ` Sisa cuti ${data.user && data.user.name ? data.user.name : 'karyawan'}: ${bal.remaining} hari (hak ${bal.entitlement}${a !== 0 ? `, penyesuaian ${a > 0 ? '+' : ''}${a}` : ''}).`;
            }
          }
        } catch (e) { /* abaikan */ }
      }
      showToast((data.message || 'Pengguna berhasil disimpan.') + extraMsg, 'success');
      closeModal('modal-sa-user');
      if (mode === 'create' && data.credentials) {
        showSaCredential('Akun Berhasil Dibuat', [
          ['Nama', body.name],
          ['NIP (login)', data.credentials.nip],
          ['Email', data.credentials.email],
          ['Password', data.credentials.password],
          ['PIN Slip Gaji', data.credentials.pin]
        ], 'Bagikan kredensial di atas ke pengguna, lalu minta dia ganti password via menu Profil Saya.');
      }
      await window.loadSaUsers();
    } else {
      showToast(data.detail || data.message || 'Gagal menyimpan pengguna.', 'error');
    }
  } catch (err) {
    console.error('submitSaUser error:', err);
    showToast('Kesalahan koneksi saat menyimpan pengguna.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-feather="save" style="width:13px; height:13px;"></i> Simpan Pengguna';
      if (window.feather) feather.replace();
    }
  }
};

window.uploadSaUserContract = async (inputEl) => {
  if (!inputEl || !inputEl.files || !inputEl.files[0]) return;
  const userId = AppState.__saEditingUserId;
  if (!userId) {
    showToast('Pilih karyawan dulu (mode Edit). Upload kontrak tidak tersedia saat tambah akun baru.', 'warning');
    inputEl.value = '';
    return;
  }
  const file = inputEl.files[0];
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    showToast('File kontrak harus berupa PDF.', 'warning');
    inputEl.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Ukuran file kontrak maksimal 5MB.', 'warning');
    inputEl.value = '';
    return;
  }
  const statusEl = document.getElementById('sa-user-contract-status');
  if (statusEl) statusEl.textContent = 'Mengupload...';
  try {
    const base64Data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.substring(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsDataURL(file);
    });
    const res = await fetch(`/api/employees/${userId}/contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64Data })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Kontrak kerja berhasil diupload.', 'success');
      const linkEl = document.getElementById('sa-user-contract-link');
      if (linkEl) {
        linkEl.href = data.url;
        linkEl.style.display = 'inline-flex';
      }
      if (statusEl) statusEl.textContent = 'Kontrak berhasil di-upload. Klik link untuk lihat.';
      if (window.feather) feather.replace();
    } else {
      showToast(data.detail || data.message || 'Gagal upload kontrak.', 'error');
      if (statusEl) statusEl.textContent = 'Gagal upload. Coba lagi.';
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat upload kontrak.', 'error');
    console.error('SA contract upload error:', err);
    if (statusEl) statusEl.textContent = 'Gagal upload. Cek koneksi.';
  } finally {
    inputEl.value = '';
  }
};

window.saResetPassword = async (userId) => {
  const emp = (AppState.saUsers || []).find(e => e.id === userId);
  if (!emp) return;
  if (!confirm(`Reset password login untuk ${emp.name} (${emp.nip})?\n\nPassword baru akan dibuat otomatis dan yang lama tidak berlaku lagi.`)) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === 'success' && data.credentials) {
      showSaCredential('Password Berhasil Direset', [
        ['Nama', emp.name], ['NIP (login)', data.credentials.nip || emp.nip], ['Password Baru', data.credentials.password]
      ], 'Segera bagikan password baru ini ke pengguna bersangkutan.');
    } else {
      showToast(data.detail || 'Gagal reset password.', 'error');
    }
  } catch (err) { showToast('Kesalahan koneksi saat reset password.', 'error'); }
};

window.saResetPin = async (userId) => {
  const emp = (AppState.saUsers || []).find(e => e.id === userId);
  if (!emp) return;
  if (!confirm(`Reset PIN slip gaji untuk ${emp.name} (${emp.nip})?\n\nPIN baru 6 digit akan dibuat otomatis.`)) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}/reset-pin`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === 'success' && data.credentials) {
      showSaCredential('PIN Berhasil Direset', [
        ['Nama', emp.name], ['NIP (login)', data.credentials.nip || emp.nip], ['PIN Baru', data.credentials.pin]
      ], 'PIN dipakai untuk membuka slip gaji di panel Payroll.');
    } else {
      showToast(data.detail || 'Gagal reset PIN.', 'error');
    }
  } catch (err) { showToast('Kesalahan koneksi saat reset PIN.', 'error'); }
};

window.saToggleStatus = async (userId) => {
  const emp = (AppState.saUsers || []).find(e => e.id === userId);
  if (!emp) return;
  const inactive = emp.account_status === 'Nonaktif';
  const newStatus = inactive ? 'Aktif' : 'Nonaktif';
  if (!inactive && emp.is_super_admin && !confirm(
    `PERHATIAN: ${emp.name} ber-role SUPER ADMIN.\n\nJika ini SUPER ADMIN terakhir yang aktif, sistem akan menolak. Nonaktifkan akun ini?`
  )) return;
  if (!inactive && !emp.is_super_admin && !confirm(`Nonaktifkan akun ${emp.name} (${emp.nip})?\n\nAkun nonaktif tidak bisa login sama sekali.`)) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_status: newStatus })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === 'success') {
      showToast(data.message || ('Akun ' + newStatus.toLowerCase() + 'kan.'), 'success');
      await window.loadSaUsers();
    } else {
      showToast(data.detail || 'Gagal mengubah status akun.', 'error');
    }
  } catch (err) { showToast('Kesalahan koneksi saat mengubah status akun.', 'error'); }
};

const showSaCredential = (title, rows, note) => {
  const tEl = document.getElementById('sa-credential-title');
  const bEl = document.getElementById('sa-credential-body');
  if (!tEl || !bEl) { alert(rows.map(r => r.join(': ')).join('\n')); return; }
  tEl.textContent = title;
  bEl.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
      ${rows.map(r => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; background:#f8fafc; padding:10px 14px; border-radius:10px;">
          <span style="font-size:12px; color:#64748b; font-weight:600;">${escapeHtml(r[0])}</span>
          <strong style="font-size:14px; color:var(--text-dark); user-select:all;">${escapeHtml(r[1] || '-')}</strong>
        </div>`).join('')}
    </div>
    ${note ? `<p style="font-size:12px; color:#b45309; background:#fef3c7; padding:10px 12px; border-radius:10px; margin:0;">⚠️ ${escapeHtml(note)}</p>` : ''}
  `;
  openModal('modal-sa-credential');
};

const SA_SETTING_KEYS = ['geofence_tolerance_m', 'default_radius_m', 'gps_max_accuracy_m', 'late_grace_min', 'late_deduction_per_min', 'late_deduction_cap', 'annual_leave_days', 'allow_self_registration', 'app_name', 'app_tagline'];

window.loadSaSettings = async () => {
  try {
    const res = await fetch('/api/admin/settings');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) {
        showToast('Backend belum di-deploy ulang (HTTP 404). Deploy Code.gs v45-leave-fix atau lebih baru. Lihat panduan di tab Ringkasan.', 'error');
        return;
      }
      showToast(data.detail || 'Gagal memuat pengaturan sistem.', 'error');
      return;
    }
    const s = (data && data.settings) || {};
    SA_SETTING_KEYS.forEach(k => {
      const el = document.getElementById('sa-set-' + k);
      if (el && s[k] !== undefined && s[k] !== null) el.value = String(s[k]);
    });
    AppState.saSettingsLoaded = true;
  } catch (err) {
    console.error('loadSaSettings error:', err);
    showToast('Kesalahan koneksi saat memuat pengaturan.', 'error');
  }
};

window.submitSaSettings = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const btn = document.getElementById('btn-sa-save-settings');
  const patch = {};
  SA_SETTING_KEYS.forEach(k => {
    const el = document.getElementById('sa-set-' + k);
    if (el) patch[k] = el.value;
  });
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: patch })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Pengaturan sistem berhasil disimpan.', 'success');
      window.loadSaSettings && window.loadSaSettings();
    } else {
      showToast(data.detail || data.message || 'Gagal menyimpan pengaturan.', 'error');
    }
  } catch (err) {
    console.error('submitSaSettings error:', err);
    showToast('Kesalahan koneksi saat menyimpan pengaturan.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-feather="save" style="width:13px; height:13px;"></i> Simpan Pengaturan Sistem';
      if (window.feather) feather.replace();
    }
  }
};
