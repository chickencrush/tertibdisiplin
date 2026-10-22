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
 */

// Application State
const AppState = {
  currentView: 'dashboard',
  currentMode: 'Management', // 'Management' or 'Operasional'
  currentUser: null,
  employees: [],
  outlets: [],
  dailyReports: [],
  attendanceLogs: [],
  payslips: [],
  kpiSummary: null,
  activeChatChannel: '#general',
  selectedPayslipForPin: null,
  deviceCoordinates: { lat: 0, lon: 0 },
  gpsOk: false,          // false = unknown/denied, true = granted
  gpsLoading: false,     // true while waiting for getCurrentPosition
  gpsLastError: '',      // human-readable last error
  cameraStream: null,
  cameraReady: false,    // true after stream attached & video dimensions known
  cameraLoading: false,
  deferredPwaPrompt: null,
  outletsLoadError: ''  // pesan error kalau loadOutlets gagal (untuk feedback di geofence banner)
};

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
  // Auto-remove after 4s with smooth fade
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

// === MODERN UI HELPERS ===
// Animate number count-up for stat cards
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
    // ease-out cubic
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

// Auto-animate stat numbers when view becomes active
const animateStatCards = () => {
  setTimeout(() => {
    document.querySelectorAll('.stat-main-number').forEach((el, idx) => {
      // Skip if already animated
      if (el.dataset.animated === '1') return;
      el.dataset.animated = '1';
      // Get text content as target (might include HTML like "<span>/ 5</span>")
      const text = el.textContent || '';
      const match = text.match(/[\d.,]+%?/);
      if (match) {
        const target = match[0];
        // Preserve any suffix (like " / 5")
        const suffix = text.substring(text.indexOf(target) + target.length);
        setTimeout(() => {
          animateCountUp(el, target, 700);
          // Re-append suffix after animation
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

// Stagger animation for cards in active view
const staggerViewCards = (view) => {
  if (!view) return;
  const cards = view.querySelectorAll('.modern-card, .stat-card');
  cards.forEach((card, idx) => {
    card.style.animation = 'none';
    card.offsetHeight; // trigger reflow
    card.style.animation = `fadeInUp 0.5s var(--ease-smooth) ${idx * 0.05}s backwards`;
  });
};

// ==========================================
// Hak akses panel per divisi
// ==========================================
// Super admin (OM) dan HRD membuka SEMUA panel. Divisi lain hanya panel yang relevan.
// Ubah daftar di bawah untuk menyesuaikan. Server (Code.gs) memakai aturan yang sama.
const FULL_ACCESS_DIVISIONS = ['OM', 'HRD'];
const PAYROLL_DIVISIONS = ['OM', 'HRD', 'Finance'];
// Divisi yang bisa approve/reject pengajuan cuti (lihat Code.gs LEAVE_APPROVERS)
const LEAVE_APPROVER_DIVISIONS = ['OM', 'HRD', 'BM', 'HRGA'];
const VIEW_ACCESS = {
  'dashboard': 'all',
  'presensi': 'all',
  'daily-report': 'all',
  'payroll': 'all',            // karyawan biasa hanya melihat slip sendiri (butuh PIN)
  'chat': 'all',               // saluran dibatasi lagi di CHAT_CHANNEL_RULES
  'calendar': 'all',
  'leaves': 'all',             // semua karyawan bisa ajukan cuti & lihat pengajuan sendiri
  'profile': 'all',            // semua karyawan bisa edit profil sendiri
  'employees': ['OM', 'HRD', 'Finance', 'BM', 'HRGA'],
  // KPI: semua karyawan bisa lihat (data sendiri); admin lihat semua (dipisah di backend h_kpi_)
  'kpi': 'all',
  // Input Data Center: HANYA Super Admin (OM) — bisa edit semua data karyawan, gaji, KPI
  'data-center': ['OM'],
  'outlets': ['OM', 'HRD'],
  'database': ['OM', 'HRD']
};
const CHAT_CHANNEL_RULES = {
  '#general': null,
  '#management': { type: 'Management' },
  '#kitchen-bar': { divisions: ['Head Kitchen', 'Head Bar', 'Kitchen', 'Bar', 'SPV', 'QC'] },
  '#service-crew': { divisions: ['SPV', 'Kasir', 'Server', 'PA', 'CS', 'BM'] },
  '#logistik': { divisions: ['Logistik', 'Driver', 'Produksi', 'Security', 'HRGA', 'Finance'] }
};

const isFullAccess = (user = AppState.currentUser) => !!user && FULL_ACCESS_DIVISIONS.includes(user.division);
const isPayrollAdmin = (user = AppState.currentUser) => !!user && PAYROLL_DIVISIONS.includes(user.division);
const canAccessView = (view, user = AppState.currentUser) => {
  if (!user) return false;
  if (isFullAccess(user)) return true;
  const rule = VIEW_ACCESS[view];
  if (!rule) return false;
  return rule === 'all' || rule.includes(user.division);
};
const canAccessChannel = (channel, user = AppState.currentUser) => {
  if (!user) return false;
  if (isFullAccess(user)) return true;
  if (!Object.prototype.hasOwnProperty.call(CHAT_CHANNEL_RULES, channel)) return false;
  const rule = CHAT_CHANNEL_RULES[channel];
  if (!rule) return true;
  if (rule.type && user.type === rule.type) return true;
  return !!(rule.divisions && rule.divisions.includes(user.division));
};

// Terapkan hak akses ke menu, pemilih mode, tombol payroll, dan saluran chat
const applyAccessControl = () => {
  const user = AppState.currentUser;
  if (!user) return;

  document.querySelectorAll('.nav-item').forEach(item => {
    const allowed = canAccessView(item.getAttribute('data-view'));
    const li = item.closest('li') || item;
    li.style.display = allowed ? '' : 'none';
  });

  // Pemilih Dashboard Management / Tim Operasional hanya untuk Super admin & HRD
  const modeSwitcher = document.querySelector('.mode-switcher-container');
  if (modeSwitcher) modeSwitcher.style.display = isFullAccess(user) ? '' : 'none';
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

  document.body.dataset.access = isFullAccess(user) ? 'full' : (canAccessView('employees', user) ? 'manager' : 'staff');
};

// ==========================================
// Sidebar (menu geser) untuk layar HP
// ==========================================
const setSidebarOpen = (open) => {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebar-backdrop');
  if (!sb) return;
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

// Pesan kesalahan login tampil di dalam formulir (tidak bergantung pada toast)
const showLoginError = (msg) => {
  const box = document.getElementById('auth-login-error');
  if (!box) return;
  box.textContent = msg || '';
  box.style.display = msg ? 'block' : 'none';
};

// ==========================================
// Authentication Gate & Session Management
// ==========================================
// Muat data aplikasi (hanya setelah login) - hanya yang boleh dilihat peran ini, dan paralel agar cepat
const loadAllAppData = async () => {
  applyAccessControl();
  await loadOutlets();
  populateRegisterOutlets();
  const jobs = [loadDailyReports(), loadAttendanceLogs(), loadPayslips(), loadCalendarEvents()];
  if (canAccessView('employees')) jobs.push(loadEmployees());
  if (canAccessView('kpi')) jobs.push(loadKpiSummary());
  // Always load leave balance (every employee has cuti balance) & requests
  jobs.push(loadLeaveBalance());
  jobs.push(loadLeaveRequests());
  await Promise.all(jobs);
  populateDivisionDropdowns();
  switchView('dashboard');
  if (window.feather) feather.replace();
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
      return true;
    } catch (e) {
      localStorage.removeItem('tertib_disiplin_auth_user');
    }
  }

  // Not logged in: show auth screen
  if (authScreen) authScreen.classList.remove('hidden');
  return false;
};

// ==========================================
// Auth Tab & Collapsible Registration Panel
// ==========================================
const switchAuthTab = (tab) => {
  // Deprecated: tabs removed. Use toggleRegisterForm() instead.
  // Kept as no-op for backward compatibility (older cached HTML may still call it).
  if (tab === 'register') {
    toggleRegisterForm(true);
  } else {
    toggleRegisterForm(false);
  }
};

// Exposed to window so inline onclick handlers can call it
window.toggleRegisterForm = (show) => {
  const wrapper = document.getElementById('auth-register-wrapper');
  const toggleBtn = document.getElementById('btn-show-register');
  if (!wrapper) return;
  if (show) {
    wrapper.classList.add('open');
    wrapper.setAttribute('aria-hidden', 'false');
    if (toggleBtn) toggleBtn.style.display = 'none';
    // Lazy-initialise dropdowns first time the form is opened
    try {
      syncRegisterDivisions(document.getElementById('reg-type').value || 'Operasional');
      populateRegisterOutlets();
    } catch (e) { /* ignored */ }
    // Smooth scroll to registration form
    setTimeout(() => wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    if (window.feather) feather.replace();
  } else {
    wrapper.classList.remove('open');
    wrapper.setAttribute('aria-hidden', 'true');
    if (toggleBtn) toggleBtn.style.display = '';
  }
};

const quickFillLogin = (nip, password) => {
  // Deprecated: Quick login panel removed for production security.
  return;
};

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

  // Field validation
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
      body: JSON.stringify({
        name, nip, email, phone, type, division, role, outlet_id, password, pin_code
      })
    });
    const data = await res.json();

    if (res.ok && data.status === 'success') {
      setCurrentUser(data.user);
      document.getElementById('auth-gate-screen').classList.add('hidden');
      showToast(data.message || `Pendaftaran berhasil! Selamat datang, ${name}.`, 'success');

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

  const mgmtDivs = ["HRD", "BM", "Finance", "QC", "Creative", "DOS", "Logistik", "Produksi", "Driver", "HRGA", "Security", "OM"];
  const opsDivs = ["SPV", "Head Kitchen", "Head Bar", "Kasir", "Server", "Kitchen", "Bar", "PA", "CS"];

  const list = (type === 'Management') ? mgmtDivs : opsDivs;
  divSelect.innerHTML = list.map(d => `<option value="${d}">${d}</option>`).join('');
};

const populateRegisterOutlets = () => {
  const outSelect = document.getElementById('reg-outlet');
  if (!outSelect || !AppState.outlets || AppState.outlets.length === 0) return;
  outSelect.innerHTML = AppState.outlets.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
};

// Hapus semua data pribadi dari memori & layar saat keluar / sesi berakhir
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
// Muat ulang halaman agar tidak ada sisa data pengguna sebelumnya di layar
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

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      console.log('TERTIB DISIPLIN Service Worker Registered');
    }).catch(err => console.log('SW registration error:', err));
  }

  // Setup PWA Installation Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.deferredPwaPrompt = e;
    const banner = document.getElementById('pwa-banner');
    if (banner) banner.style.display = 'flex';
  });

  initSidebarToggle();
  ['login-identifier', 'login-password'].forEach(id => {
    const f = document.getElementById(id);
    if (f) f.addEventListener('input', () => showLoginError(''));
  });

  // Setup Navigation listeners
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  // Start live clock for attendance
  setInterval(updateAttendanceClock, 1000);
  detectDeviceGPS();

  // Sesi berakhir -> kembali ke layar login
  window.addEventListener('td-session-expired', () => {
    clearSessionData();
    setSidebarOpen(false);
    const authScreen = document.getElementById('auth-gate-screen');
    if (authScreen) authScreen.classList.remove('hidden');
    switchAuthTab('login');
    showToast('Sesi berakhir. Silakan login kembali.', 'warning');
    restartToLogin('Sesi berakhir. Silakan login kembali.');
  });

  // Pesan dari sebelum halaman dimuat ulang (keluar / sesi berakhir)
  try {
    const notice = sessionStorage.getItem('td_notice');
    if (notice) { sessionStorage.removeItem('td_notice'); showToast(notice, 'info'); }
  } catch (e) { /* abaikan */ }

  // Cek sesi login, data dimuat hanya jika sudah login
  const isLoggedIn = initAuthSession();
  if (isLoggedIn) await loadAllAppData();

  // Initialize mockup charts (dilewati bila pustaka grafik gagal dimuat)
  if (window.Chart) initMockupCharts();

  // Populate UI dropdowns
  populateDivisionDropdowns();

  if (window.feather) feather.replace();
});

// PWA Trigger
const triggerPwaPrompt = () => {
  if (AppState.deferredPwaPrompt) {
    AppState.deferredPwaPrompt.prompt();
    AppState.deferredPwaPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') {
        showToast('Aplikasi berhasil dipasang di perangkat Anda!', 'success');
      }
      AppState.deferredPwaPrompt = null;
      dismissPwaBanner();
    });
  } else {
    showToast('Di browser PC/HP Anda: Klik menu titik tiga ➔ "Install App" / "Tambahkan ke Layar Utama"', 'info');
  }
};

const dismissPwaBanner = () => {
  const banner = document.getElementById('pwa-banner');
  if (banner) banner.style.display = 'none';
};

// Navigation View Switcher
const switchView = (viewName) => {
  if (!canAccessView(viewName)) {
    showToast('Anda tidak memiliki akses ke panel ini.', 'warning');
    viewName = 'dashboard';
  }
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
    'database': ['Pusat Kontrol Database & Backup', 'Kelola Penyimpanan SQLite, Unduh Cadangan .db, Ekspor CSV & Live Inspector']
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

  if (viewName === 'presensi') {
    // Don't auto-start camera (it may prompt user before they're ready).
    // User can click "Buka Kamera" or just press "AMBIL SELFIE & PRESENSI" —
    // the submit handler will start the camera on demand.
    // But DO trigger GPS detection so the geofence banner shows the right state.
    if (!AppState.gpsOk && !AppState.gpsLoading) {
      window.detectDeviceGPS && window.detectDeviceGPS();
    }
    // Auto-retry loading outlets if they failed before or are still empty
    if (!AppState.outlets || AppState.outlets.length === 0 || AppState.outletsLoadError) {
      loadOutlets && loadOutlets();
    }
    window.checkGpsDistance && window.checkGpsDistance();
    loadAttendanceLogs && loadAttendanceLogs();
  } else if (viewName === 'leaves') {
    // Refresh leave data when entering the leaves view
    stopCamera();
    loadLeaveBalance && loadLeaveBalance();
    loadLeaveRequests && loadLeaveRequests();
  } else if (viewName === 'chat') {
    // Auto-load chat messages saat masuk view chat
    stopCamera();
    loadChatMessages && loadChatMessages(AppState.activeChatChannel || '#general');
  } else if (viewName === 'data-center') {
    // Input Data Center — load employees & outlets
    stopCamera();
    loadEmployees && loadEmployees();
    loadDataCenterOutlets && loadDataCenterOutlets();
    renderDataCenterEmployeeList && renderDataCenterEmployeeList();
  } else if (viewName === 'profile') {
    // Profile view — render current user data
    stopCamera();
    renderProfileView && renderProfileView();
  } else if (viewName === 'database') {
    stopCamera();
    loadDatabaseOverview();
    loadDatabaseTableData();
  } else {
    stopCamera();
  }

  if (window.feather) feather.replace();

  // Modern UI: animate stat cards & stagger view cards
  if (activePanel) {
    staggerViewCards(activePanel);
    if (viewName === 'dashboard') animateStatCards();
  }
};

// Switch Dashboard Mode: Management vs Tim Operasional
const switchDashboardMode = (mode) => {
  AppState.currentMode = mode;
  document.getElementById('btn-mode-management').classList.toggle('active', mode === 'Management');
  document.getElementById('btn-mode-operasional').classList.toggle('active', mode === 'Operasional');

  if (mode === 'Management') {
    showToast('Beralih ke Tampilan Dashboard Management (Akses Eksekutif & HR)', 'info');
  } else {
    showToast('Beralih ke Tampilan Dashboard Tim Operasional (Akses Floor & Checklist)', 'info');
  }

  renderDashboardReportsStream();
  renderDailyReportBoard();
  if (window.feather) feather.replace();
};

const setCurrentUser = (user) => {
  if (!user) return;
  AppState.currentUser = user;
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

// Load Outlets from API
const loadOutlets = async () => {
  try {
    const res = await fetch('/api/outlets');
    if (!res.ok) {
      // Parse error message dari response
      let errMsg = 'Gagal memuat daftar outlet (HTTP ' + res.status + ')';
      try {
        const errData = await res.json();
        if (errData.detail) errMsg = errData.detail;
        else if (errData.message) errMsg = errData.message;
      } catch (e) { /* response body bukan JSON */ }
      console.error('loadOutlets error:', errMsg);
      AppState.outlets = [];
      AppState.outletsLoadError = errMsg;
      // Update geofence banner dengan error
      window.checkGpsDistance && window.checkGpsDistance();
      return;
    }
    const data = await res.json();
    AppState.outlets = data;
    AppState.outletsLoadError = '';

    // Populate presensi outlet select
    const pSelect = document.getElementById('presensi-outlet-select');
    const rSelect = document.getElementById('rep-form-outlet');
    if (pSelect && Array.isArray(data) && data.length > 0) {
      pSelect.innerHTML = '<option value="">— Pilih outlet —</option>' + 
        data.map(o => `<option value="${o.id}">${o.name}${o.radius_meters ? ' (Radius: ' + o.radius_meters + 'm)' : ''}</option>`).join('');
    }
    if (rSelect && Array.isArray(data) && data.length > 0) {
      rSelect.innerHTML = data.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    }

    renderOutletsTable();
    // Update geofence banner sekarang outlets sudah ada
    window.checkGpsDistance && window.checkGpsDistance();
  } catch (err) {
    console.error('Failed loading outlets:', err);
    AppState.outlets = [];
    AppState.outletsLoadError = (err && err.message) ? err.message : 'Kesalahan koneksi saat memuat outlet.';
    window.checkGpsDistance && window.checkGpsDistance();
  }
};

// Load Employees from API
const loadEmployees = async () => {
  try {
    const res = await fetch('/api/employees');
    if (!res.ok) return;
    const data = await res.json();
    AppState.employees = data;
    renderEmployeesTable(data);
  } catch (err) {
    console.error('Failed loading employees:', err);
  }
};

// Load Daily Reports from API
const loadDailyReports = async () => {
  try {
    const res = await fetch('/api/daily-reports');
    if (!res.ok) return;
    const data = await res.json();
    AppState.dailyReports = data;
    renderDashboardReportsStream();
    renderDailyReportBoard();
  } catch (err) {
    console.error('Failed loading reports:', err);
  }
};

// Load KPI Summary from API
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
      // Non-admin: show personal card, hide admin views
      renderPersonalKpi(data);
      if (personalCard) personalCard.style.display = 'block';
      if (adminTableCard) adminTableCard.style.display = 'none';
      if (leaderboardCard) leaderboardCard.style.display = 'none';
      renderStaffRatingsCards([]);
      renderKpiTable([]);
    } else {
      // Admin: show leaderboard & per-division table, hide personal card
      renderStaffRatingsCards(data.topStaff || []);
      renderKpiTable(data.divisionStats || []);
      if (personalCard) personalCard.style.display = 'none';
      if (adminTableCard) adminTableCard.style.display = 'block';
      if (leaderboardCard) leaderboardCard.style.display = 'block';
    }
  } catch (err) {
    console.error('Failed loading KPI:', err);
  }
};

// Render personal KPI card (for non-admin users — only their own data)
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
    <!-- Sisa Cuti Widget (loaded asynchronously from /api/leaves/balance) -->
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
  if (window.feather) feather.replace();
  // After rendering, fetch & display leave balance in the widget
  loadLeaveBalance && loadLeaveBalance();
};

// Load Attendance Logs
const loadAttendanceLogs = async () => {
  try {
    const res = await fetch('/api/attendance');
    if (!res.ok) return;
    const data = await res.json();
    AppState.attendanceLogs = data;
    renderAttendanceTable(data);
  } catch (err) {
    console.error('Failed loading attendance:', err);
  }
};

// Load Payslips
const loadPayslips = async () => {
  try {
    const res = await fetch('/api/payroll/slips');
    if (!res.ok) return;
    const data = await res.json();
    AppState.payslips = data;
    renderPayslipsTable(data);

    // Summary
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

// Populate Divisions in Filter Dropdowns
const populateDivisionDropdowns = () => {
  const empDivFilter = document.getElementById('emp-filter-division');
  if (!empDivFilter) return;

  const mgmtDivs = ["HRD", "BM", "Finance", "QC", "Creative", "DOS", "Logistik", "Produksi", "Driver", "HRGA", "Security", "OM"];
  const opsDivs = ["SPV", "Head Kitchen", "Head Bar", "Kasir", "Server", "Kitchen", "Bar", "PA", "CS"];

  let html = '<option value="all">Semua Divisi</option>';
  html += '<optgroup label="Management">';
  mgmtDivs.forEach(d => html += `<option value="${d}">${d}</option>`);
  html += '</optgroup><optgroup label="Tim Operasional">';
  opsDivs.forEach(d => html += `<option value="${d}">${d}</option>`);
  html += '</optgroup>';

  empDivFilter.innerHTML = html;
};

// ================= CHARTS INITIALIZATION (MATCHING MOCKUP) =================
let branchRatingChartInstance = null;
let issueRingsChartInstance = null;
let happyDonutChartInstance = null;

// Render charts with placeholder (zero) data; refreshFromApi() updates them later.
const initMockupCharts = () => {
  // 1. Branch Rating Bar Chart
  const branchCanvas = document.getElementById('branchRatingChart');
  if (branchCanvas) {
    const ctx = branchCanvas.getContext('2d');
    branchRatingChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['(Memuat outlet...)'],
        datasets: [
          {
            label: 'Bulan Ini',
            data: [0],
            backgroundColor: '#701c34',
            borderRadius: 6,
            barThickness: 14
          },
          {
            label: 'Bulan Lalu',
            data: [0],
            backgroundColor: '#e2e8f0',
            borderRadius: 6,
            barThickness: 14
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            min: 0,
            max: 5,
            ticks: { stepSize: 1, color: '#94a3b8' },
            grid: { color: '#f1f5f9' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { weight: '600', size: 11 } }
          }
        }
      }
    });
  }

  // 2. Issue Status Donut / Ring Chart
  const issueCanvas = document.getElementById('issueRingsChart');
  if (issueCanvas) {
    const ctx = issueCanvas.getContext('2d');
    issueRingsChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Resolved (Selesai)', 'Pending (Hold)', 'Escalated'],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 3,
          borderColor: '#ffffff',
          cutout: '72%'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }

  // 3. Happy Customers Donut Chart (placeholder until real data arrives)
  const happyCanvas = document.getElementById('happyDonutChart');
  if (happyCanvas) {
    const ctx = happyCanvas.getContext('2d');
    happyDonutChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Members', 'Non-Members', 'New Guest', 'Existing Guest'],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: ['#701c34', '#0284c7', '#f43f5e', '#10b981'],
          borderWidth: 2,
          borderColor: '#ffffff',
          cutout: '65%'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
};

// ================= DASHBOARD STREAM & STAFF RATINGS =================
const renderDashboardReportsStream = (filterStatus = 'All') => {
  const container = document.getElementById('dashboard-reports-stream');
  if (!container) return;

  let reports = AppState.dailyReports;
  if (filterStatus !== 'All') {
    reports = reports.filter(r => r.status.toLowerCase() === filterStatus.toLowerCase());
  }

  if (reports.length === 0) {
    container.innerHTML = `<p style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">Tidak ada aktivitas harian pada status ini.</p>`;
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
        <img src="https://images.unsplash.com/photo-1534528741775?w=100&auto=format&fit=crop&q=80" class="stream-avatar" alt="Avatar">
        <div class="stream-author-outlet">
          <h5>${r.reporter_name}</h5>
          <p>${r.outlet_name || 'Outlet Pusat'}</p>
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

  if (window.feather) feather.replace();
};

const filterDashboardReports = (status, btn) => {
  document.querySelectorAll('.reviews-tabs-nav .tab-pill-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderDashboardReportsStream(status);
};

// Render Staff Ratings Cards (Exact Match Georgy, Emma, Akash from Mockup)
const renderStaffRatingsCards = (staffList) => {
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
          <div class="sub-metric-col">
            <p class="lbl">Performance</p>
            <p class="num">+21% ↑</p>
          </div>
          <div class="sub-metric-col">
            <p class="lbl">Attendance</p>
            <p class="num">+46% ↑</p>
          </div>
          <div class="sub-metric-col">
            <p class="lbl">Ratings</p>
            <p class="num">+8% ↑</p>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (container) container.innerHTML = html;
  if (kpiLeader) kpiLeader.innerHTML = html;
  if (window.feather) feather.replace();
};

// ================= DAILY REPORT BOARD (PROSES - HOLD - SELESAI) =================
const renderDailyReportBoard = () => {
  const colProses = document.getElementById('kanban-col-proses');
  const colHold = document.getElementById('kanban-col-hold');
  const colSelesai = document.getElementById('kanban-col-selesai');
  if (!colProses) return;

  const divFilter = document.getElementById('report-filter-division')?.value || 'all';
  const statusFilter = document.getElementById('report-filter-status')?.value || 'all';
  const search = document.getElementById('report-search-box')?.value?.toLowerCase() || '';

  let list = AppState.dailyReports;
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

  if (window.feather) feather.replace();
};

const filterDailyReportBoard = () => {
  renderDailyReportBoard();
};

// Open Create Report Modal
const openCreateReportModal = () => {
  document.getElementById('modal-report-title').textContent = 'Buat Laporan Operasional Baru';
  document.getElementById('rep-form-title').value = '';
  document.getElementById('rep-form-desc').value = '';
  document.getElementById('rep-form-status').value = 'Proses';
  document.getElementById('rep-form-hold-reason').value = '';
  document.getElementById('rep-form-proof-url').value = '';
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
  const formData = new FormData();
  formData.append('file', file);

  try {
    showToast('Mengunggah bukti file...', 'info');
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.status === 'success') {
      document.getElementById('rep-form-proof-url').value = data.url;
      const previewImg = document.getElementById('proof-preview-img');
      previewImg.src = data.url;
      document.getElementById('proof-preview-container').style.display = 'block';
      showToast('Bukti berhasil diunggah!', 'success');
    } else {
      showToast(data.detail || 'Gagal mengunggah file bukti', 'error');
    }
  } catch (err) {
    showToast('Gagal mengunggah file bukti', 'error');
  }
};

// Submit Daily Report with MANDATORY proof check
const submitDailyReportForm = async (e) => {
  e.preventDefault();
  const status = document.getElementById('rep-form-status').value;
  const proofUrl = document.getElementById('rep-form-proof-url').value;
  const holdReason = document.getElementById('rep-form-hold-reason').value;

  // STRICT VALIDATION
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

const promptHoldWithProof = (reportId) => {
  const reason = prompt('Masukkan alasan penundaan/kendala (Hold Reason):');
  if (!reason) return;
  // Use pre-seeded image or trigger upload modal
  const proofUrl = prompt('Masukkan link bukti foto kendala / tekan OK untuk menggunakan simulasi bukti audit:', 'https://images.unsplash.com/photo-1588854337236-6889d631faa8?w=600&auto=format&fit=crop&q=80');
  if (!proofUrl) {
    alert('Status Hold wajib menyertakan bukti foto!');
    return;
  }
  updateReportStatusDirect(reportId, 'Hold', proofUrl, 'Menunggu penanganan teknisi/bahan baku', reason);
};

const promptSelesaiWithProof = (reportId) => {
  const proofUrl = prompt('Wajib melampirkan bukti foto penyelesaian. Masukkan URL foto / tekan OK untuk simulasi bukti pekerjaan selesai:', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80');
  if (!proofUrl) {
    alert('Status Selesai wajib menyertakan bukti foto hasil pekerjaan!');
    return;
  }
  updateReportStatusDirect(reportId, 'Selesai', proofUrl, 'Pekerjaan tuntas dan divalidasi', null);
};

const quickUpdateReportStatus = (reportId, newStatus) => {
  updateReportStatusDirect(reportId, newStatus, null, null, null);
};

const updateReportStatusDirect = async (reportId, status, proofUrl, proofNotes, holdReason) => {
  try {
    const res = await fetch(`/api/daily-reports/${reportId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: status,
        proof_file_url: proofUrl,
        proof_notes: proofNotes,
        hold_reason: holdReason
      })
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
// All presensi functions are exposed to window.* so inline onclick handlers
// work even when the script is loaded as a module / in strict mode.

// --- GPS Detection (async, with proper state tracking) ---
window.detectDeviceGPS = () => {
  if (!navigator.geolocation) {
    AppState.gpsOk = false;
    AppState.gpsLastError = 'Browser tidak mendukung deteksi lokasi.';
    window.checkGpsDistance();
    return;
  }
  if (AppState.gpsLoading) return; // prevent duplicate concurrent requests
  AppState.gpsLoading = true;
  window.checkGpsDistance(); // show "mendeteksi..." immediately

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      AppState.deviceCoordinates = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      AppState.gpsOk = true;
      AppState.gpsLoading = false;
      AppState.gpsLastError = '';
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

// --- Live clock on camera overlay (also updates GPS display) ---
const updateAttendanceClock = () => {
  const clockEl = document.getElementById('camera-clock');
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('id-ID') + ' WIB';
  }
  const gpsDisplay = document.getElementById('camera-gps-display');
  if (gpsDisplay) {
    if (AppState.gpsOk) {
      gpsDisplay.textContent = AppState.deviceCoordinates.lat.toFixed(4) + ', ' + AppState.deviceCoordinates.lon.toFixed(4);
    } else {
      gpsDisplay.textContent = 'belum diketahui';
    }
  }
};

// --- Camera Start (async, with proper state tracking) ---
window.startCamera = async () => {
  const video = document.getElementById('camera-feed');
  if (!video) return;
  if (AppState.cameraLoading || AppState.cameraReady) return; // prevent duplicate calls
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Browser tidak mendukung akses kamera. Gunakan tombol kamera HP saat presensi.', 'warning');
    return;
  }
  AppState.cameraLoading = true;
  // Update button label if exists
  const btn = document.getElementById('btn-submit-checkin');
  try {
    AppState.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false
    });
    video.srcObject = AppState.cameraStream;
    // Wait for video metadata to ensure dimensions are available
    await new Promise((resolve) => {
      if (video.readyState >= 2) return resolve();
      video.onloadedmetadata = () => resolve();
      setTimeout(resolve, 3000); // safety timeout
    });
    AppState.cameraReady = true;
    AppState.cameraLoading = false;
  } catch (err) {
    AppState.cameraReady = false;
    AppState.cameraLoading = false;
    const msg = (err && err.name === 'NotAllowedError')
      ? 'Akses kamera ditolak. Izinkan kamera di browser, atau gunakan tombol kamera HP saat presensi.'
      : 'Kamera tidak tersedia. Anda bisa presensi dengan kamera HP saat klik tombol presensi.';
    console.warn('Camera error:', err && err.message);
    // Don't alert here — the user will see the warning when they try to presensi
    showToast(msg, 'warning');
  }
};
const startCamera = window.startCamera;

// --- Stop Camera (called when leaving presensi view) ---
const stopCamera = () => {
  if (AppState.cameraStream) {
    try {
      AppState.cameraStream.getTracks().forEach(track => track.stop());
    } catch (e) { /* ignored */ }
    AppState.cameraStream = null;
  }
  AppState.cameraReady = false;
  AppState.cameraLoading = false;
  const video = document.getElementById('camera-feed');
  if (video) video.srcObject = null;
};

// --- Haversine Distance Calculation (client-side) ---
const calculateHaversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
};

// --- Update Geofence Banner (called whenever GPS or outlet changes) ---
window.checkGpsDistance = () => {
  const outletSelect = document.getElementById('presensi-outlet-select');
  const banner = document.getElementById('geofence-status-banner');
  const text = document.getElementById('geofence-text');
  const icon = document.getElementById('geofence-icon');
  if (!outletSelect || !banner || !text) return;

  // === STATE: Outlet gagal dimuat — tampilkan error + tombol retry ===
  if (AppState.outletsLoadError) {
    banner.className = 'geofence-alert geofence-invalid';
    text.innerHTML = `<strong>Gagal memuat daftar outlet:</strong> ${AppState.outletsLoadError}
      <br><button type="button" class="btn-secondary" style="margin-top:6px; padding:5px 10px; font-size:11px;" onclick="window.retryLoadOutlets && window.retryLoadOutlets()">
        <i data-feather="refresh-cw" style="width:11px; height:11px;"></i> Coba Muat Ulang
      </button>`;
    if (window.feather) feather.replace();
    return;
  }

  // === STATE: Outlet masih loading (belum ada error, belum ada data) ===
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

  // GPS still loading
  if (AppState.gpsLoading) {
    banner.className = 'geofence-alert geofence-warning';
    text.innerHTML = '<strong>Mendeteksi lokasi GPS...</strong> Pastikan GPS perangkat aktif.';
    return;
  }

  // GPS not yet acquired
  if (!AppState.gpsOk) {
    banner.className = 'geofence-alert geofence-invalid';
    text.innerHTML = `<strong>GPS belum aktif:</strong> ${AppState.gpsLastError || 'Izinkan akses lokasi pada browser, lalu tekan tombol "Deteksi Lokasi GPS".'}
      <br><button type="button" class="btn-secondary" style="margin-top:6px; padding:5px 10px; font-size:11px;" onclick="window.detectDeviceGPS()">
        <i data-feather="map-pin" style="width:11px; height:11px;"></i> Deteksi Ulang Lokasi GPS
      </button>`;
    if (window.feather) feather.replace();
    return;
  }

  // Outlet may be from public endpoint (no lat/lon) — skip client-side check
  if (typeof outlet.lat !== 'number' || typeof outlet.lon !== 'number') {
    banner.className = 'geofence-alert geofence-warning';
    text.innerHTML = `<strong>${outlet.name}</strong> dipilih. Validasi radius akan dilakukan di server saat presensi.`;
    return;
  }

  const dist = calculateHaversine(AppState.deviceCoordinates.lat, AppState.deviceCoordinates.lon, outlet.lat, outlet.lon);
  const isValid = dist <= outlet.radius_meters;

  if (isValid) {
    banner.className = 'geofence-alert geofence-valid';
    text.innerHTML = `<strong>Tervalidasi di Lokasi:</strong> ${dist} meter dari ${outlet.name} (Batas Radius: ${outlet.radius_meters}m) — <strong>Valid Untuk Presensi</strong>`;
  } else {
    banner.className = 'geofence-alert geofence-invalid';
    text.innerHTML = `<strong>Di Luar Radius:</strong> Anda berada ${dist} meter dari ${outlet.name} (Batas Radius: ${outlet.radius_meters}m). <em>Presensi akan ditandai "Menunggu Approval" atasan.</em>`;
  }
};
const checkGpsDistance = window.checkGpsDistance;

// Retry loading outlets (dipanggil dari tombol di geofence banner)
window.retryLoadOutlets = async () => {
  AppState.outletsLoadError = '';
  window.checkGpsDistance && window.checkGpsDistance(); // show "loading..." again
  await loadOutlets();
  // If still failed, checkGpsDistance will show error (called inside loadOutlets)
  // If success, checkGpsDistance will show outlet info (called inside loadOutlets)
};

// --- Snapshot from video to canvas ---
const captureSelfieSnapshot = () => {
  const video = document.getElementById('camera-feed');
  const canvas = document.getElementById('camera-snapshot-canvas');
  if (!video || !canvas) return null;
  if (!AppState.cameraReady || !AppState.cameraStream || !video.videoWidth) return null;

  canvas.width = video.videoWidth || 480;
  canvas.height = video.videoHeight || 360;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Stamp current time & GPS on the snapshot
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(10, canvas.height - 40, canvas.width - 20, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText(`GPS: ${AppState.deviceCoordinates.lat.toFixed(4)}, ${AppState.deviceCoordinates.lon.toFixed(4)} | ${new Date().toLocaleString('id-ID')}`, 20, canvas.height - 20);

  return canvas.toDataURL('image/jpeg', 0.85);
};

// --- Fallback: native camera input (used when in-page camera fails or on iOS Safari) ---
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

// --- Submit Attendance (Check-in) with full UX feedback ---
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

  // --- GPS check: if not ready, request once and wait briefly ---
  if (!AppState.gpsOk) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mendeteksi GPS...'; }
    window.detectDeviceGPS();
    // Wait up to 8 seconds for GPS to come back
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

  // --- Camera: ensure in-page camera is started; fallback to native camera input ---
  if (!AppState.cameraReady) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Memulai kamera...'; }
    await window.startCamera();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="check-circle"></i> AMBIL SELFIE & PRESENSI MASUK'; if (window.feather) feather.replace(); }
  }

  // --- Take selfie (in-page camera first, native fallback second) ---
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengambil foto...'; }
  let selfieBase64 = captureSelfieSnapshot();
  if (!selfieBase64) {
    // Prompt user to capture via native camera
    showToast('Kamera halaman tidak siap. Buka kamera HP untuk ambil selfie.', 'info');
    selfieBase64 = await captureSelfieViaNativeCamera();
  }
  if (!selfieBase64) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="check-circle"></i> AMBIL SELFIE & PRESENSI MASUK'; if (window.feather) feather.replace(); }
    showToast('Foto selfie wajib diambil. Coba lagi, atau izinkan akses kamera di pengaturan browser.', 'warning');
    return;
  }

  // --- Submit to API ---
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
        selfie_base64: selfieBase64,
        shift_name: shiftName,
        notes: 'Presensi Selfie Mandiri'
      })
    });
    const data = await res.json();
    if (res.ok && data.status !== 'error') {
      if (data.in_radius) {
        showToast(`Presensi berhasil! Status: ${data.attendance_status}${data.late_minutes ? ' (Terlambat ' + data.late_minutes + ' menit)' : ' (Tepat Waktu)'}`, 'success');
      } else {
        showToast(`Presensi tercatat di LUAR RADIUS (${data.distance_meters}m). Menunggu approval atasan.`, 'warning');
      }
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

// --- Submit Attendance (Check-out / Presensi Pulang) ---
// Records the check-out time for the user's most recent check-in today.
// Also requires GPS + selfie, and computes overtime if check-out is past shift end.
window.submitAttendanceCheckOut = async () => {
  const submitBtn = document.getElementById('btn-submit-checkout');

  if (!AppState.currentUser || !AppState.currentUser.id) {
    showToast('Sesi login tidak ditemukan. Silakan login kembali.', 'error');
    return;
  }

  // Make sure we have today's attendance logs to know which record to update
  if (!AppState.attendanceLogs || AppState.attendanceLogs.length === 0) {
    await loadAttendanceLogs();
  }
  // Find today's check-in for this user (any shift)
  const today = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
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

  // --- GPS check ---
  if (!AppState.gpsOk) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mendeteksi GPS...'; }
    window.detectDeviceGPS();
    let waited = 0;
    while (AppState.gpsLoading && waited < 8000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
    }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="log-out" style="width:14px; height:14px;"></i> PRESENSI PULANG (CHECK-OUT)'; if (window.feather) feather.replace(); }
    if (!AppState.gpsOk) {
      showToast('Lokasi GPS belum tersedia. Pastikan GPS aktif dan izin lokasi diberikan, lalu coba lagi.', 'warning');
      return;
    }
  }

  // --- Camera + selfie ---
  if (!AppState.cameraReady) {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Memulai kamera...'; }
    await window.startCamera();
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="log-out" style="width:14px; height:14px;"></i> PRESENSI PULANG (CHECK-OUT)'; if (window.feather) feather.replace(); }
  }
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengambil foto...'; }
  let selfieBase64 = captureSelfieSnapshot();
  if (!selfieBase64) {
    showToast('Kamera halaman tidak siap. Buka kamera HP untuk ambil selfie pulang.', 'info');
    selfieBase64 = await captureSelfieViaNativeCamera();
  }
  if (!selfieBase64) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i data-feather="log-out" style="width:14px; height:14px;"></i> PRESENSI PULANG (CHECK-OUT)'; if (window.feather) feather.replace(); }
    showToast('Foto selfie wajib diambil untuk presensi pulang.', 'warning');
    return;
  }

  // --- Submit to API ---
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
      const otMsg = data.overtime_hours > 0
        ? ` (+${data.overtime_hours} jam lembur)`
        : '';
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
      submitBtn.innerHTML = '<i data-feather="log-out" style="width:14px; height:14px;"></i> PRESENSI PULANG (CHECK-OUT)';
      if (window.feather) feather.replace();
    }
  }
};
const submitAttendanceCheckOut = window.submitAttendanceCheckOut;

const renderAttendanceTable = (logs) => {
  const tbody = document.getElementById('attendance-tbody');
  if (!tbody) return;

  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">Belum ada data presensi hari ini.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(l => {
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

// ================= DATABASE KARYAWAN & SKALA UPAH PERMENAKER 1/2017 =================
const renderEmployeesTable = (list) => {
  const tbody = document.getElementById('employees-tbody');
  if (!tbody) return;

  const typeFilter = document.getElementById('emp-filter-type')?.value || 'all';
  const divFilter = document.getElementById('emp-filter-division')?.value || 'all';
  const outletFilter = document.getElementById('emp-filter-outlet')?.value || 'all';
  const search = document.getElementById('emp-search-input')?.value?.toLowerCase() || '';

  let filtered = list;
  if (typeFilter !== 'all') filtered = filtered.filter(e => e.type === typeFilter);
  if (divFilter !== 'all') filtered = filtered.filter(e => e.division === divFilter);
  if (outletFilter !== 'all') filtered = filtered.filter(e => e.outlet_id === outletFilter);
  if (search) filtered = filtered.filter(e => e.name.toLowerCase().includes(search) || e.nip.toLowerCase().includes(search) || e.role.toLowerCase().includes(search));

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

const loadEmployeesList = () => {
  renderEmployeesTable(AppState.employees);
};

// Permenaker 1/2017 Matrix Modal
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

// ================= PAYROLL & E-PAYSLIP =================
const renderPayslipsTable = (slips) => {
  const tbody = document.getElementById('payslips-tbody');
  if (!tbody) return;

  tbody.innerHTML = slips.slice(0, 100).map(s => {
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
  if (window.feather) feather.replace();
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
  if (!pin) {
    alert('Masukkan PIN 6 Digit!');
    return;
  }

  try {
    const res = await fetch('/api/payroll/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: AppState.selectedPayslipForPin.empId,
        pin: pin
      })
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
        <div class="meta-field">
          <span class="lbl">Nama Karyawan</span>
          <span class="val">${slip.employee_name}</span>
        </div>
        <div class="meta-field">
          <span class="lbl">Periode Gaji</span>
          <span class="val">${slip.period_label}</span>
        </div>
        <div class="meta-field">
          <span class="lbl">Divisi & Jabatan</span>
          <span class="val">${slip.division} - ${slip.role}</span>
        </div>
        <div class="meta-field">
          <span class="lbl">Struktur Grading</span>
          <span class="val">${slip.grade} (Permenaker 1/2017)</span>
        </div>
      </div>

      <!-- Earnings Table -->
      <table class="payslip-table">
        <thead>
          <tr>
            <th>KOMPONEN PENERIMAAN (EARNINGS)</th>
            <th style="text-align:right;">JUMLAH (IDR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Gaji Pokok</td>
            <td class="amount">${formatRupiah(slip.base_salary)}</td>
          </tr>
          <tr>
            <td>Tunjangan Jabatan / Posisi</td>
            <td class="amount">${formatRupiah(slip.position_allowance)}</td>
          </tr>
          <tr>
            <td>Uang Makan & Kehadiran (${slip.attendance_days} Hari Hadir)</td>
            <td class="amount">${formatRupiah(slip.daily_allowance_total)}</td>
          </tr>
          <tr>
            <td>Upah Lembur (${slip.overtime_hours} Jam SPL)</td>
            <td class="amount">${formatRupiah(slip.overtime_pay)}</td>
          </tr>
          <tr>
            <td>Bonus Kinerja / Insentif KPI</td>
            <td class="amount">${formatRupiah(slip.bonus_kpi)}</td>
          </tr>
          <tr style="background:#f8fafc; font-weight:700;">
            <td>TOTAL PENGHASILAN BRUTO</td>
            <td class="amount" style="color:var(--burgundy-primary);">${formatRupiah(slip.gross_salary)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Deductions Table -->
      <table class="payslip-table">
        <thead>
          <tr>
            <th>KOMPONEN POTONGAN (DEDUCTIONS)</th>
            <th style="text-align:right;">JUMLAH (IDR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>BPJS Ketenagakerjaan (JHT 2% + JP 1%)</td>
            <td class="amount">-${formatRupiah(slip.bpjs_tk_deduction)}</td>
          </tr>
          <tr>
            <td>BPJS Kesehatan (1% Karyawan)</td>
            <td class="amount">-${formatRupiah(slip.bpjs_kes_deduction)}</td>
          </tr>
          <tr>
            <td>PPh 21 Skema TER (Tarif Efektif Rata-Rata)</td>
            <td class="amount">-${formatRupiah(slip.pph21_ter_deduction)}</td>
          </tr>
          <tr>
            <td>Potongan Keterlambatan Presensi</td>
            <td class="amount">-${formatRupiah(slip.late_deduction)}</td>
          </tr>
          <tr>
            <td>Potongan Pinjaman / Kasbon Karyawan</td>
            <td class="amount">-${formatRupiah(slip.kasbon_deduction)}</td>
          </tr>
          <tr style="background:#fef2f2; font-weight:700; color:#ef4444;">
            <td>TOTAL PENGURANG GAJI</td>
            <td class="amount">-${formatRupiah(slip.total_deductions)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Net Salary Row -->
      <div style="background:#f8fafc; border:2px solid var(--burgundy-primary); border-radius:12px; padding:16px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="font-size:14px; color:var(--burgundy-primary);">GAJI BERSIH DITERIMA (TAKE HOME PAY)</strong>
          <div style="font-size:11px; color:#64748b;">Ditransfer langsung ke Rekening Bank Karyawan</div>
        </div>
        <div style="font-size:22px; font-weight:800; color:#065f46;">
          ${formatRupiah(slip.net_salary)}
        </div>
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
    const res = await fetch(`/api/payroll/slips/${AppState.activeViewingSlipId}/send-email`, {
      method: 'POST'
    });
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

// ================= KPI & ANALISIS KINERJA =================
const renderKpiTable = (stats) => {
  const tbody = document.getElementById('kpi-division-tbody');
  if (!tbody) return;

  tbody.innerHTML = stats.map(s => {
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
// Expose to window so inline onclick/onsubmit di HTML bisa panggil
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
  loadChatMessages(channel);
};
const switchChatChannel = window.switchChatChannel;

const loadChatMessages = async (channel) => {
  const ch = channel || AppState.activeChatChannel || '#general';
  const container = document.getElementById('chat-messages-stream');
  if (container) {
    container.innerHTML = '<div style="text-align:center; color:#94a3b8; padding:20px; font-size:12px;">Memuat pesan...</div>';
  }
  try {
    const res = await fetch(`/api/chat/messages?channel=${encodeURIComponent(ch)}`);
    if (!res.ok) {
      let errMsg = 'Gagal memuat pesan (HTTP ' + res.status + ')';
      try {
        const errData = await res.json();
        if (errData.detail) errMsg = errData.detail;
      } catch (e) { /* ignore */ }
      if (container) {
        container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px; font-size:12px;">⚠️ ${errMsg}<br><button type="button" class="btn-secondary" style="margin-top:8px; padding:5px 10px; font-size:11px;" onclick="window.loadChatMessages && window.loadChatMessages('${ch}')">Coba Lagi</button></div>`;
      }
      return;
    }
    const data = await res.json();
    renderChatMessages(data);
  } catch (err) {
    console.error('Failed loading chat:', err);
    if (container) {
      container.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px; font-size:12px;">⚠️ Kesalahan koneksi. <button type="button" class="btn-secondary" style="margin-top:8px; padding:5px 10px; font-size:11px;" onclick="window.loadChatMessages && window.loadChatMessages('${ch}')">Coba Lagi</button></div>`;
    }
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
  container.innerHTML = messages.map(m => {
    const isMe = m.sender_id === myId;
    const time = m.timestamp ? String(m.timestamp).split(' ')[1] || m.timestamp : '';
    return `
      <div class="chat-message-bubble ${isMe ? 'me' : ''}">
        <div class="chat-bubble-content">
          <div class="chat-sender-info">${m.sender_name || 'Anon'} (${m.sender_division || '-'})</div>
          <div>${escapeHtml(m.message || '')}</div>
          <div class="chat-timestamp">${time}</div>
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
};

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
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Mengirim...'; }

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
      input.value = '';
      await loadChatMessages(AppState.activeChatChannel);
    } else {
      showToast(data.detail || data.message || 'Gagal mengirim pesan.', 'error');
    }
  } catch (err) {
    showToast('Gagal mengirim pesan. Periksa koneksi internet.', 'error');
    console.error('Chat send error:', err);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i data-feather="send" style="width:14px; height:14px;"></i>';
      if (window.feather) feather.replace();
    }
  }
};
const sendChatMessage = window.sendChatMessage;

// ================= KALENDER & AGENDA =================
const loadCalendarEvents = async () => {
  try {
    const res = await fetch('/api/calendar/events');
    if (!res.ok) return;
    const data = await res.json();
    renderCalendarEvents(data);
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

// ================= LEAVE REQUESTS (CUTI & IJIN) =================
const isLeaveApprover = (user = AppState.currentUser) => !!user && LEAVE_APPROVER_DIVISIONS.includes(user.division);

// State for leave requests
AppState.leaveRequests = [];
AppState.leaveBalance = null;

const loadLeaveBalance = async () => {
  try {
    const res = await fetch('/api/leaves/balance');
    if (!res.ok) return;
    const data = await res.json();
    AppState.leaveBalance = data;
    renderLeaveBalance(data);
    // Also update the leave balance widget on KPI personal card (if visible)
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
    AppState.leaveRequests = data;
    renderLeaveRequestsList(data);
  } catch (err) {
    console.error('Failed loading leave requests:', err);
  }
};

const renderLeaveBalance = (b) => {
  const card = document.getElementById('leave-balance-card');
  if (!card || !b) return;
  const remainingColor = (b.remaining || 0) >= 6 ? '#10b981' : ((b.remaining || 0) >= 3 ? '#f59e0b' : '#ef4444');
  const usedPct = b.entitlement > 0 ? Math.min(100, Math.round((b.used / b.entitlement) * 100)) : 0;
  card.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
      <div>
        <h3 style="margin:0; font-size:16px;">Sisa Cuti Tahunan ${b.year || ''}</h3>
        <p style="margin:4px 0 0 0; font-size:12px; color:#64748b;">Berdasarkan UU Ketenagakerjaan (12 hari/tahun)</p>
      </div>
      <div style="text-align:right;">
        <div style="font-size:32px; font-weight:800; color:${remainingColor}; line-height:1;">${b.remaining || 0}</div>
        <div style="font-size:11px; color:#64748b; font-weight:700; text-transform:uppercase;">hari tersisa</div>
      </div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:10px; margin-bottom:14px;">
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
    </div>
    <div style="background:#e2e8f0; border-radius:8px; height:8px; overflow:hidden;">
      <div style="background:linear-gradient(90deg, var(--burgundy-primary), var(--burgundy-light)); height:100%; width:${usedPct}%; transition:width 0.3s;"></div>
    </div>
    <p style="font-size:11px; color:#94a3b8; margin:6px 0 0 0;">${usedPct}% dari hak cuti telah terpakai</p>
  `;
};

const renderLeaveRequestsList = (requests) => {
  const tbody = document.getElementById('leaves-tbody');
  if (!tbody) return;
  if (!requests || requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:24px;">Belum ada pengajuan cuti/ijin.</td></tr>';
    return;
  }
  const isApprover = isLeaveApprover();
  const me = AppState.currentUser;

  tbody.innerHTML = requests.map(l => {
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
  if (window.feather) feather.replace();
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
      // Reset form
      typeEl.value = 'Cuti Tahunan';
      startEl.value = '';
      endEl.value = '';
      reasonEl.value = '';
      if (attachmentEl) attachmentEl.value = '';
      // Reload list & balance
      await loadLeaveRequests();
      await loadLeaveBalance();
      // Close modal if open
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
    const res = await fetch(`/api/leaves/${id}/cancel`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    });
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

// Expose to window
window.submitLeaveRequest = submitLeaveRequest;

// ================= INPUT DATA CENTER (Khusus Super Admin OM) =================
// Panel ini hanya untuk Super Admin (OM). Berisi 3 fitur:
// 1. Edit data karyawan (nama, divisi, role, outlet, dll)
// 2. Edit data gaji (gaji pokok, uang hadir harian)
// 3. Edit data KPI (rating, skor KPI)

// Populate outlet dropdown in the Data Center modal
const loadDataCenterOutlets = () => {
  const select = document.getElementById('dc-edit-outlet');
  if (!select) return;
  if (!AppState.outlets || AppState.outlets.length === 0) return;
  select.innerHTML = AppState.outlets.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
};

// Render daftar karyawan di panel Data Center
const renderDataCenterEmployeeList = (filterText = '') => {
  const tbody = document.getElementById('dc-employees-tbody');
  if (!tbody) return;
  const allEmps = AppState.employees || [];
  // Update badge count
  const badge = document.getElementById('dc-emp-count-badge');
  if (badge) badge.textContent = allEmps.length + ' karyawan';

  if (allEmps.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:24px;">Memuat data karyawan...</td></tr>';
    return;
  }
  let filtered = allEmps;
  const q = (filterText || '').toLowerCase().trim();
  if (q) {
    filtered = allEmps.filter(e =>
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

// Search input handler
window.dcSearchEmployees = (input) => {
  const text = (input && input.value) || '';
  renderDataCenterEmployeeList(text);
};

// Open modal to edit employee data (data + gaji + KPI in one form)
window.openEditEmployeeModal = (employeeId) => {
  const emp = (AppState.employees || []).find(e => e.id === employeeId);
  if (!emp) {
    showToast('Data karyawan tidak ditemukan.', 'error');
    return;
  }
  // Fill form fields
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val !== undefined && val !== null ? val : ''; };
  setVal('dc-edit-id', emp.id);
  setVal('dc-edit-name', emp.name);
  setVal('dc-edit-nip-display', emp.nip); // read-only display
  setVal('dc-edit-phone', emp.phone);
  setVal('dc-edit-type', emp.type);
  setVal('dc-edit-division', emp.division);
  setVal('dc-edit-role', emp.role);
  setVal('dc-edit-outlet', emp.outlet_id);
  setVal('dc-edit-status', emp.employment_status || 'Tetap');
  setVal('dc-edit-base-salary', emp.base_salary);
  setVal('dc-edit-daily-allowance', emp.daily_allowance);
  setVal('dc-edit-rating', emp.rating);
  setVal('dc-edit-kpi-score', emp.kpi_score);
  // Update header
  const titleEl = document.getElementById('dc-modal-emp-name');
  if (titleEl) titleEl.textContent = emp.name + ' (' + emp.nip + ')';
  // Show modal
  const modal = document.getElementById('modal-dc-edit-employee');
  if (modal) {
    modal.classList.add('active');
    if (window.feather) feather.replace();
  }
};

// Submit edit form — calls PUT /api/employees/{id}
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
      // Close modal
      const modal = document.getElementById('modal-dc-edit-employee');
      if (modal) modal.classList.remove('active');
      // Reload employees
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

// Division dropdown options
const DC_DIVISIONS_MGMT = ["HRD", "BM", "Finance", "QC", "Creative", "DOS", "Logistik", "Produksi", "Driver", "HRGA", "Security", "OM"];
const DC_DIVISIONS_OPS = ["SPV", "Head Kitchen", "Head Bar", "Kasir", "Server", "Kitchen", "Bar", "PA", "CS"];

// Populate division dropdown based on selected type
window.dcSyncDivisions = () => {
  const typeSel = document.getElementById('dc-edit-type');
  const divSel = document.getElementById('dc-edit-division');
  if (!typeSel || !divSel) return;
  const currentVal = divSel.value;
  const list = typeSel.value === 'Management' ? DC_DIVISIONS_MGMT : DC_DIVISIONS_OPS;
  divSel.innerHTML = list.map(d => `<option value="${d}">${d}</option>`).join('');
  // Restore previous value if still valid
  if (list.indexOf(currentVal) >= 0) divSel.value = currentVal;
};

// ================= PROFIL SAYA (Edit Data Diri) =================
// Semua karyawan bisa akses. Bisa ubah: nama, no. HP, foto profil, info bank, password, PIN.
// Tidak bisa ubah sendiri: NIP, email, divisi, role, outlet, gaji, KPI (hanya admin via Data Center).

const LOGO_URI_PROFILE = './icons/logo.png';

// Render profil view dengan data user yang login
const renderProfileView = () => {
  const u = AppState.currentUser;
  if (!u) {
    showToast('Sesi login tidak ditemukan. Silakan login kembali.', 'error');
    return;
  }
  // Avatar preview
  const avatarImg = document.getElementById('profile-avatar-preview');
  if (avatarImg) {
    avatarImg.src = u.avatar_url || LOGO_URI_PROFILE;
    avatarImg.onerror = function() { this.onerror = null; this.src = LOGO_URI_PROFILE; };
  }
  // Info badges
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

  // Form fields
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val !== undefined && val !== null ? val : ''; };
  setVal('profile-name', u.name);
  setVal('profile-phone', u.phone);
  setVal('profile-bank-name', u.bank_name || '');
  setVal('profile-bank-account', u.bank_account || '');

  // Top bar avatar also update
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
  // Also update display name in identity card
  const displayName = document.getElementById('profile-display-name');
  if (displayName) displayName.textContent = u.name || '-';
};
// Expose to window so switchView can call it
window.renderProfileView = renderProfileView;

// Upload avatar — convert file ke base64, kirim ke /api/profile/avatar
window.uploadProfileAvatar = async (inputEl) => {
  if (!inputEl || !inputEl.files || inputEl.files.length === 0) return;
  const file = inputEl.files[0];
  // Validate file type
  if (!file.type.startsWith('image/')) {
    showToast('File harus berupa gambar (JPG, PNG, atau WEBP).', 'warning');
    inputEl.value = '';
    return;
  }
  // Validate file size (max 3MB)
  if (file.size > 3 * 1024 * 1024) {
    showToast('Ukuran foto maksimal 3MB.', 'warning');
    inputEl.value = '';
    return;
  }
  const submitBtn = document.getElementById('btn-upload-avatar');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Mengupload...'; }
  const previewImg = document.getElementById('profile-avatar-preview');

  try {
    // Read file as base64
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

    // Show preview immediately (optimistic)
    if (previewImg) previewImg.src = URL.createObjectURL(file);

    // Upload to API
    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64Data })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Foto profil berhasil diupload.', 'success');
      // Update current user state
      if (AppState.currentUser) {
        AppState.currentUser.avatar_url = data.url;
        // Also update localStorage
        try { localStorage.setItem('tertib_disiplin_auth_user', JSON.stringify(AppState.currentUser)); } catch (e) { /* ignore */ }
      }
      // Update top bar & sidebar avatar
      const topAvatar = document.getElementById('current-user-avatar');
      if (topAvatar) topAvatar.src = data.url;
      const sidebarAvatar = document.getElementById('sidebar-user-avatar');
      if (sidebarAvatar) sidebarAvatar.src = data.url;
      // Update preview with the real URL from server
      if (previewImg) previewImg.src = data.url;
    } else {
      showToast(data.detail || data.message || 'Gagal upload foto profil.', 'error');
      // Revert preview
      if (previewImg && AppState.currentUser) {
        previewImg.src = AppState.currentUser.avatar_url || LOGO_URI_PROFILE;
      }
    }
  } catch (err) {
    showToast('Kesalahan koneksi saat upload foto.', 'error');
    console.error('Avatar upload error:', err);
    // Revert preview
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

// Submit profile update (nama, phone, bank info)
window.submitProfileUpdate = async (e) => {
  if (e && e.preventDefault) e.preventDefault();
  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const name = getVal('profile-name');
  const phone = getVal('profile-phone');
  const bankName = getVal('profile-bank-name');
  const bankAccount = getVal('profile-bank-account');
  if (!name || name.length < 2) { showToast('Nama minimal 2 karakter.', 'warning'); return; }
  if (!phone || phone.length < 5) { showToast('No. HP minimal 5 karakter.', 'warning'); return; }
  const submitBtn = document.getElementById('btn-save-profile');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Menyimpan...'; }
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, bank_name: bankName, bank_account: bankAccount })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      showToast(data.message || 'Profil berhasil diupdate.', 'success');
      // Update current user state
      if (data.user) {
        // Preserve avatar_url since profile update doesn't return it (use existing)
        const currentAvatar = AppState.currentUser ? AppState.currentUser.avatar_url : '';
        AppState.currentUser = Object.assign({}, AppState.currentUser, data.user, { avatar_url: data.user.avatar_url || currentAvatar });
        try { localStorage.setItem('tertib_disiplin_auth_user', JSON.stringify(AppState.currentUser)); } catch (e) { /* ignore */ }
        // Update top bar display
        const nameEl = document.getElementById('current-user-name');
        if (nameEl) nameEl.textContent = AppState.currentUser.name;
        const roleEl = document.getElementById('current-user-role');
        if (roleEl) roleEl.textContent = `${AppState.currentUser.role} (${AppState.currentUser.division})`;
        const sName = document.getElementById('sidebar-user-name');
        if (sName) sName.textContent = AppState.currentUser.name;
        const sRole = document.getElementById('sidebar-user-role');
        if (sRole) sRole.textContent = `${AppState.currentUser.role} (${AppState.currentUser.division})`;
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

// Change password
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
      // Clear fields
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

// Change PIN
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

// Toggle password/PIN visibility
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

// ================= PENGATURAN TITIK OUTLET =================
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
      body: JSON.stringify({
        ...outlet,
        radius_meters: parseInt(newRadius)
      })
    });
    showToast('Radius geofence berhasil diperbarui!', 'success');
    await loadOutlets();
  } catch (err) {
    showToast('Gagal mengubah radius', 'error');
  }
};

const openAddOutletModal = () => {
  openModal('modal-add-outlet');
};

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

// ================= RBAC SIMULATOR / USER SWITCHER =================
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
  return; // dinonaktifkan: berganti akun harus lewat login
  const user = AppState.employees.find(e => e.id === empId);
  if (user) {
    setCurrentUser(user);
    showToast(`Beralih akun ke: ${user.name} (${user.role})`, 'success');
    closeModal('modal-switch-user');
  }
};

// ================= MODAL HELPERS & LIGHTBOX =================
const openModal = (id) => {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
};

const closeModal = (id) => {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
};

// Open the leave create modal — exposes to window so inline onclick can call it
window.openCreateLeaveModal = () => {
  const modal = document.getElementById('modal-leave-create');
  if (!modal) {
    showToast('Form pengajuan cuti tidak ditemukan.', 'error');
    return;
  }
  // Reset form fields
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
  // Set min date to today
  const today = new Date().toISOString().split('T')[0];
  if (startEl) startEl.min = today;
  if (endEl) endEl.min = today;
  // Auto-update end date min when start date changes
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

const showNotificationCenter = () => {
  alert("🔔 Pusat Notifikasi Terintegrasi:\n- 3 Laporan Berstatus 'Hold' Memerlukan Tindak Lanjut\n- Briefing Pagi Seluruh Cabang Jam 09:00 WIB\n- 50 Slip Gaji Online Telah Terdistribusi ke Akun Karyawan");
};

const openSplModal = () => {
  const hours = prompt('Jumlah Jam Lembur yang diajukan:', '2');
  if (!hours) return;
  const reason = prompt('Alasan Pekerjaan Lembur (Surat Perintah Lembur):', 'Persiapan event VIP weekend & restock chiller bar');
  if (reason) {
    showToast(`Pengajuan SPL ${hours} Jam telah diteruskan ke SPV & OM untuk di-approval!`, 'success');
  }
};

const applyGlobalFilters = () => {
  showToast('Memperbarui filter periode & outlet...', 'info');
  loadDailyReports();
  loadAttendanceLogs();
};

// ==========================================
// Database & Backup Controller
// ==========================================
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

    // Render Table Headers
    if (thead) {
      thead.innerHTML = `<tr>` + data.columns.map(c => `<th style="white-space:nowrap; background:#f8fafc; color:#475569; padding:10px 14px;">${c}</th>`).join('') + `</tr>`;
    }

    // Render Table Rows
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

    // Update Pagination & Counter
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
