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
  deviceCoordinates: { lat: -6.2088, lon: 106.8456 },
  cameraStream: null,
  deferredPwaPrompt: null
};

// ============================================================================
// UNIVERSAL API ADAPTER: GOOGLE APPS SCRIPT (SHEETS & DRIVE) + LOCAL FALLBACK
// ============================================================================
const originalFetch = window.fetch.bind(window);

window.fetch = async function(url, options = {}) {
  // Gunakan fetch lokal biasa jika URL bukan API atau konfigurasi Google Apps Script belum diset
  if (!window.APP_CONFIG || !window.APP_CONFIG.isGoogleBackendActive || typeof url !== 'string' || !url.startsWith('/api/')) {
    return originalFetch(url, options);
  }

  const gasUrl = window.APP_CONFIG.GAS_WEBAPP_URL;
  const method = (options.method || 'GET').toUpperCase();

  const makeJsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status: status,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    // 1. AUTH LOGIN & REGISTER
    if (url === '/api/auth/login') {
      const body = JSON.parse(options.body || '{}');
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'login', ...body })
      });
      const data = await gasRes.json();
      if (data.status === 'error') {
        return makeJsonResponse({ detail: data.message }, 401);
      }
      return makeJsonResponse(data, 200);
    }

    if (url === '/api/auth/register') {
      const body = JSON.parse(options.body || '{}');
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'register', ...body })
      });
      const data = await gasRes.json();
      if (data.status === 'error') {
        return makeJsonResponse({ detail: data.message }, 400);
      }
      return makeJsonResponse(data, 200);
    }

    // 2. CONFIG
    if (url === '/api/config') {
      const gasRes = await originalFetch(`${gasUrl}?action=config`);
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }

    // 3. OUTLETS
    if (url === '/api/outlets' && method === 'GET') {
      const gasRes = await originalFetch(`${gasUrl}?action=getOutlets`);
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }
    if (url === '/api/outlets' && method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'createOutlet', ...body })
      });
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }
    if (url.startsWith('/api/outlets/') && method === 'DELETE') {
      const id = url.split('/').pop();
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'deleteOutlet', id: id })
      });
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }

    // 4. EMPLOYEES
    if (url === '/api/employees' && method === 'GET') {
      const gasRes = await originalFetch(`${gasUrl}?action=getEmployees`);
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }

    // 5. DAILY REPORTS
    if (url === '/api/daily-reports' && method === 'GET') {
      const gasRes = await originalFetch(`${gasUrl}?action=getDailyReports`);
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }
    if (url === '/api/daily-reports' && method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'createDailyReport', ...body })
      });
      const data = await gasRes.json();
      if (data.status === 'error') {
        return makeJsonResponse({ detail: data.message }, 400);
      }
      return makeJsonResponse(data, 200);
    }
    if (url.startsWith('/api/daily-reports/') && url.endsWith('/status')) {
      const parts = url.split('/');
      const reportId = parts[3];
      const body = JSON.parse(options.body || '{}');
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'updateReportStatus', report_id: reportId, ...body })
      });
      const data = await gasRes.json();
      if (data.status === 'error') {
        return makeJsonResponse({ detail: data.message }, 400);
      }
      return makeJsonResponse(data, 200);
    }

    // 6. ATTENDANCE & CHECK-IN
    if (url.startsWith('/api/attendance') && method === 'GET') {
      const query = url.includes('?') ? '&' + url.split('?')[1] : '';
      const gasRes = await originalFetch(`${gasUrl}?action=getAttendance${query}`);
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }
    if (url === '/api/attendance/check-in' && method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'checkIn', ...body })
      });
      const data = await gasRes.json();
      if (data.status === 'error') {
        return makeJsonResponse({ detail: data.message }, 400);
      }
      return makeJsonResponse(data, 200);
    }

    // 7. PAYROLL & E-PAYSLIP
    if (url.startsWith('/api/payroll/slips') && method === 'GET') {
      const query = url.includes('?') ? '&' + url.split('?')[1] : '';
      const gasRes = await originalFetch(`${gasUrl}?action=getPayslips${query}`);
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }
    if (url === '/api/payroll/summary' && method === 'GET') {
      const gasRes = await originalFetch(`${gasUrl}?action=getPayrollSummary`);
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }
    if (url === '/api/payroll/verify-pin' && method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'verifyPin', ...body })
      });
      const data = await gasRes.json();
      if (data.status === 'error') {
        return makeJsonResponse({ detail: data.message }, 401);
      }
      return makeJsonResponse(data, 200);
    }
    if (url === '/api/payroll/run-autopilot' && method === 'POST') {
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'runPayrollAutopilot' })
      });
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }
    if (url.includes('/api/payroll/slips/') && url.endsWith('/send-email')) {
      const parts = url.split('/');
      const slipId = parts[4];
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'sendPayslipEmail', slip_id: slipId })
      });
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }

    // 8. KPI SUMMARY
    if (url === '/api/kpi/summary' && method === 'GET') {
      const gasRes = await originalFetch(`${gasUrl}?action=getKpiSummary`);
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }

    // 9. CHAT ROOM
    if (url.startsWith('/api/chat/messages') && method === 'GET') {
      const queryCh = new URLSearchParams(url.split('?')[1] || '').get('channel') || '#general';
      const gasRes = await originalFetch(`${gasUrl}?action=getChatMessages&channel=${encodeURIComponent(queryCh)}`);
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }
    if (url === '/api/chat/messages' && method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'sendMessage', ...body })
      });
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }

    // 10. CALENDAR & AGENDA
    if (url === '/api/calendar/events' && method === 'GET') {
      const gasRes = await originalFetch(`${gasUrl}?action=getCalendarEvents`);
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }
    if (url === '/api/calendar/events' && method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'createEvent', ...body })
      });
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }

    // 11. FILE UPLOAD TO GOOGLE DRIVE
    if (url === '/api/upload' && method === 'POST') {
      const formData = options.body;
      const file = formData ? formData.get('file') : null;
      if (!file) {
        return makeJsonResponse({ detail: 'File tidak ditemukan' }, 400);
      }
      
      const toBase64 = (f) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(f);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });

      const base64Str = await toBase64(file);
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'uploadFile',
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          base64: base64Str
        })
      });
      const data = await gasRes.json();
      if (data.status === 'error') {
        return makeJsonResponse({ detail: data.message }, 500);
      }
      return makeJsonResponse({ status: 'success', url: data.url, filename: file.name }, 200);
    }

    // 12. DATABASE OVERVIEW & INSPECTOR
    if (url === '/api/database/overview') {
      const gasRes = await originalFetch(`${gasUrl}?action=getOverview`);
      const data = await gasRes.json();
      return makeJsonResponse({ status: 'success', counts: data.data || data }, 200);
    }
    if (url.startsWith('/api/database/tables/')) {
      const parts = url.split('?')[0].split('/');
      const table = parts[parts.length - 1];
      const gasRes = await originalFetch(`${gasUrl}?action=getTableData&table=${encodeURIComponent(table)}`);
      const data = await gasRes.json();
      const rows = data.data || [];
      return makeJsonResponse({
        status: 'success',
        table: table,
        total_rows: rows.length,
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        data: rows
      }, 200);
    }
    if (url === '/api/database/reset' && method === 'POST') {
      const gasRes = await originalFetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'resetCleanDatabase' })
      });
      const data = await gasRes.json();
      return makeJsonResponse(data, 200);
    }

    // Fallback default
    return originalFetch(url, options);

  } catch (err) {
    console.error('GAS API Bridge Error:', err);
    return makeJsonResponse({ detail: 'Gagal menghubungi Google Apps Script: ' + err.message }, 500);
  }
};

// Formatting Utilities
const formatRupiah = (val) => {
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
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

// ==========================================
// Authentication Gate & Session Management
// ==========================================
const initAuthSession = () => {
  const savedUserStr = localStorage.getItem('tertib_disiplin_auth_user');
  const authScreen = document.getElementById('auth-gate-screen');

  if (savedUserStr) {
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

const switchAuthTab = (tab) => {
  const loginBtn = document.getElementById('tab-btn-login');
  const regBtn = document.getElementById('tab-btn-register');
  const loginForm = document.getElementById('form-auth-login');
  const regForm = document.getElementById('form-auth-register');

  if (tab === 'login') {
    loginBtn.classList.add('active');
    regBtn.classList.remove('active');
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
  } else {
    regBtn.classList.add('active');
    loginBtn.classList.remove('active');
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    syncRegisterDivisions(document.getElementById('reg-type').value || 'Operasional');
    populateRegisterOutlets();
  }
};

const quickFillLogin = (nip, password) => {
  document.getElementById('login-identifier').value = nip;
  document.getElementById('login-password').value = password;
  showToast(`Akun ${nip} siap untuk login!`, 'info');
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
  const ident = document.getElementById('login-identifier').value.trim();
  const pwd = document.getElementById('login-password').value.trim();
  const submitBtn = document.getElementById('btn-login-submit');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Memverifikasi...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: ident, password: pwd })
    });
    const data = await res.json();

    if (res.ok && data.status === 'success') {
      setCurrentUser(data.user);
      document.getElementById('auth-gate-screen').classList.add('hidden');
      showToast(data.message, 'success');

      // Adjust dashboard mode according to user type
      if (data.user.type === 'Management') {
        AppState.currentMode = 'Management';
        document.getElementById('btn-mode-management').classList.add('active');
        document.getElementById('btn-mode-operasional').classList.remove('active');
      } else {
        AppState.currentMode = 'Operasional';
        document.getElementById('btn-mode-operasional').classList.add('active');
        document.getElementById('btn-mode-management').classList.remove('active');
      }

      // Reload fresh data
      await loadEmployees();
      await loadDailyReports();
      await loadAttendanceLogs();
      await loadPayslips();
      await loadKpiSummary();
    } else {
      showToast(data.detail || 'Login gagal. Periksa kembali NIP/Email dan password Anda.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi saat login.', 'error');
  } finally {
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
  const password = document.getElementById('reg-password').value.trim();
  const pin_code = document.getElementById('reg-pincode').value.trim();
  const submitBtn = document.getElementById('btn-register-submit');

  if (password.length < 6) {
    showToast('Password minimal 6 karakter!', 'warning');
    return;
  }
  if (pin_code.length !== 6 || isNaN(pin_code)) {
    showToast('PIN harus berupa 6 digit angka!', 'warning');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Mendaftarkan akun...';

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
      showToast(data.message, 'success');

      if (data.user.type === 'Management') {
        AppState.currentMode = 'Management';
        document.getElementById('btn-mode-management').classList.add('active');
        document.getElementById('btn-mode-operasional').classList.remove('active');
      } else {
        AppState.currentMode = 'Operasional';
        document.getElementById('btn-mode-operasional').classList.add('active');
        document.getElementById('btn-mode-management').classList.remove('active');
      }

      await loadEmployees();
    } else {
      showToast(data.detail || 'Registrasi gagal.', 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi saat registrasi.', 'error');
  } finally {
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

const logoutUser = () => {
  if (!confirm('Apakah Anda yakin ingin keluar (Logout) dari TERTIB DISIPLIN?')) return;
  localStorage.removeItem('tertib_disiplin_auth_user');
  AppState.currentUser = null;
  const authScreen = document.getElementById('auth-gate-screen');
  if (authScreen) authScreen.classList.remove('hidden');
  switchAuthTab('login');
  showToast('Anda telah keluar dari aplikasi.', 'info');
};

// ================= PANEL SLIDE (Sidebar Responsif) =================
// Buka/tutup sidebar sebagai panel slide di Android/iOS/tablet.
const isMobileLayout = () => window.innerWidth <= 900;

window.openSidebar = () => {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !isMobileLayout()) return;
  sidebar.classList.add('open');
  sidebar.setAttribute('aria-hidden', 'false');
  if (overlay) overlay.classList.add('show');
  document.body.classList.add('panel-open');
};

window.closeSidebar = () => {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  sidebar.classList.remove('open');
  sidebar.setAttribute('aria-hidden', isMobileLayout() ? 'true' : 'false');
  if (overlay) overlay.classList.remove('show');
  document.body.classList.remove('panel-open');
};

const setupResponsiveSidebar = () => {
  const sidebar = document.getElementById('sidebar');
  const btnToggle = document.getElementById('btn-toggle-sidebar');
  if (!sidebar) return;

  // Tombol hamburger di topbar
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
    });
  }

  // Tutup lewat tombol Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
  });

  // Reset state saat berpindah mode PC <-> mobile
  window.addEventListener('resize', () => {
    if (!isMobileLayout()) closeSidebar();
  });

  // Gesture geser (swipe): tepi kiri -> buka, panel terbuka -> tutup
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let edgeSwipeActive = false;

  document.addEventListener('touchstart', (e) => {
    if (!isMobileLayout()) return;
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
    const isOpen = sidebar.classList.contains('open');
    // Mulai dari tepi kiri layar (24px) untuk membuka, atau dari dalam panel untuk menutup
    edgeSwipeActive = (!isOpen && touchStartX <= 24) || (isOpen && touchStartX <= 300);
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!edgeSwipeActive || !isMobileLayout()) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = Math.abs(t.clientY - touchStartY);
    const dt = Date.now() - touchStartTime;
    // Syarat swipe horizontal yang cepat & jelas
    if (dt < 400 && dy < 80) {
      const isOpen = sidebar.classList.contains('open');
      if (!isOpen && dx > 60) openSidebar();
      else if (isOpen && dx < -60) closeSidebar();
    }
    edgeSwipeActive = false;
  }, { passive: true });
};
// =============== END PANEL SLIDE (Sidebar Responsif) ===============

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(() => {
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

  // Setup Navigation listeners
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.getAttribute('data-view');
      if (view) switchView(view);
      // Di Android/iOS (layar sempit), menu otomatis ditutup setelah memilih halaman
      if (window.innerWidth <= 900) closeSidebar();
    });
  });

  // Sidebar responsif: tombol hamburger (mobile) + tutup lewat overlay / tombol Esc
  setupResponsiveSidebar();

  // Start live clock for attendance
  setInterval(updateAttendanceClock, 1000);
  detectDeviceGPS();

  // Load initial outlets first so registration can populate
  await loadOutlets();
  populateRegisterOutlets();
  syncRegisterDivisions('Operasional');

  // Check login session
  const isLoggedIn = initAuthSession();

  // Load app data
  await loadEmployees();
  await loadDailyReports();
  await loadKpiSummary();
  await loadAttendanceLogs();
  await loadPayslips();
  await loadCalendarEvents();

  // Initialize mockup charts
  initMockupCharts();

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
  AppState.currentView = viewName;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) activePanel.classList.add('active');

  const titles = {
    'dashboard': ['Dashboard', 'Pusat Kontrol Operasional & Manajemen 5 Outlet'],
    'daily-report': ['Daily Report Operasional', 'Alur Tugas: Proses ➔ Hold (Wajib Bukti) ➔ Selesai (Wajib Bukti)'],
    'presensi': ['Presensi GPS & Selfie', 'Verifikasi Titik Lokasi Geofence & Kamera Langsung'],
    'employees': ['Database Karyawan', 'Manajemen 275+ Personel, Skala Upah Permenaker 1/2017 & Struktur Organisasi'],
    'payroll': ['Kompensasi & Payroll Autopilot', 'Perhitungan Upah Harian, BPJS, PPh 21 TER, & Slip Gaji Online'],
    'kpi': ['Analisis Kinerja & KPI', 'Evaluasi Kinerja Otomatis Manajemen & Tim Operasional'],
    'chat': ['Chat Room Internal', 'Saluran Komunikasi Antar Divisi & Direct Messages'],
    'calendar': ['Kalender & Agenda Meeting', 'Jadwal Briefing, Audit QC, dan Agenda Operasional'],
    'outlets': ['Pengaturan Titik Outlet', 'Konfigurasi Titik Koordinat GPS dan Toleransi Radius Geofencing'],
    'database': ['Pusat Kontrol Database & Backup', 'Kelola Penyimpanan SQLite, Unduh Cadangan .db, Ekspor CSV & Live Inspector']
  };

  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-subtitle');
  if (titles[viewName]) {
    titleEl.textContent = titles[viewName][0];
    subEl.textContent = titles[viewName][1];
  }

  if (viewName === 'presensi') {
    startCamera();
    checkGpsDistance();
  } else if (viewName === 'database') {
    stopCamera();
    loadDatabaseOverview();
    loadDatabaseTableData();
  } else {
    stopCamera();
  }

  if (window.feather) feather.replace();
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
  if (avatarEl) avatarEl.src = user.avatar_url || 'icons/logo.png';
  localStorage.setItem('tertib_disiplin_auth_user', JSON.stringify(user));
};

// Load Outlets from API
const loadOutlets = async () => {
  try {
    const res = await fetch('/api/outlets');
    const data = await res.json();
    AppState.outlets = data;

    // Populate presensi outlet select
    const pSelect = document.getElementById('presensi-outlet-select');
    const rSelect = document.getElementById('rep-form-outlet');
    if (pSelect) {
      pSelect.innerHTML = data.map(o => `<option value="${o.id}">${o.name} (Radius: ${o.radius_meters}m)</option>`).join('');
    }
    if (rSelect) {
      rSelect.innerHTML = data.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    }

    renderOutletsTable();
  } catch (err) {
    console.error('Failed loading outlets:', err);
  }
};

// Load Employees from API (275+ records)
const loadEmployees = async () => {
  try {
    const res = await fetch('/api/employees');
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
    const data = await res.json();
    AppState.kpiSummary = data;
    renderStaffRatingsCards(data.topStaff || []);
    renderKpiTable(data.divisionStats || []);
  } catch (err) {
    console.error('Failed loading KPI:', err);
  }
};

// Load Attendance Logs
const loadAttendanceLogs = async () => {
  try {
    const res = await fetch('/api/attendance');
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
    const data = await res.json();
    AppState.payslips = data;
    renderPayslipsTable(data);

    // Summary
    const sumRes = await fetch('/api/payroll/summary');
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

const initMockupCharts = () => {
  // 1. Branch Rating Bar Chart
  const branchCanvas = document.getElementById('branchRatingChart');
  if (branchCanvas) {
    const ctx = branchCanvas.getContext('2d');
    branchRatingChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Sudirman', 'Senopati', 'PIK', 'Bandung', 'Surabaya'],
        datasets: [
          {
            label: 'Bulan Ini',
            data: [4.6, 4.4, 4.8, 4.2, 4.5],
            backgroundColor: '#701c34',
            borderRadius: 6,
            barThickness: 14
          },
          {
            label: 'Bulan Lalu',
            data: [4.2, 4.1, 4.5, 3.9, 4.3],
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
        labels: ['Resolved', 'Pending', 'Escalated'],
        datasets: [{
          data: [70, 20, 10],
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

  // 3. Happy Customers Donut Chart
  const happyCanvas = document.getElementById('happyDonutChart');
  if (happyCanvas) {
    const ctx = happyCanvas.getContext('2d');
    happyDonutChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Members', 'Non-Members', 'New Guest', 'Existing Guest'],
        datasets: [{
          data: [55, 25, 12, 8],
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
const detectDeviceGPS = () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        AppState.deviceCoordinates = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        };
        checkGpsDistance();
      },
      (err) => {
        console.warn('Geolocation permission not granted, using simulated outlet radius');
        // Fallback: place user within 18m of Outlet Pusat Sudirman
        AppState.deviceCoordinates = {
          lat: -6.20885,
          lon: 106.84565
        };
        checkGpsDistance();
      }
    );
  }
};

const updateAttendanceClock = () => {
  const clockEl = document.getElementById('camera-clock');
  if (clockEl) {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('id-ID') + ' WIB';
  }
};

const startCamera = async () => {
  const video = document.getElementById('camera-feed');
  if (!video) return;

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      AppState.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      video.srcObject = AppState.cameraStream;
    }
  } catch (err) {
    console.warn('Camera access error or desktop without webcam:', err);
  }
};

const stopCamera = () => {
  if (AppState.cameraStream) {
    AppState.cameraStream.getTracks().forEach(track => track.stop());
    AppState.cameraStream = null;
  }
};

// Haversine Distance Calculation (Client-side)
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

const checkGpsDistance = () => {
  const outletSelect = document.getElementById('presensi-outlet-select');
  const banner = document.getElementById('geofence-status-banner');
  const text = document.getElementById('geofence-text');
  const icon = document.getElementById('geofence-icon');
  if (!outletSelect || !banner) return;

  const outlet = AppState.outlets.find(o => o.id === outletSelect.value) || AppState.outlets[0];
  if (!outlet) return;

  const dist = calculateHaversine(AppState.deviceCoordinates.lat, AppState.deviceCoordinates.lon, outlet.lat, outlet.lon);
  const isValid = dist <= outlet.radius_meters;

  if (isValid) {
    banner.className = 'geofence-alert geofence-valid';
    text.innerHTML = `<strong>Tervalidasi di Lokasi:</strong> ${dist} meter dari ${outlet.name} (Batas Radius: ${outlet.radius_meters}m) - <strong>Valid Untuk Presensi</strong>`;
  } else {
    banner.className = 'geofence-alert geofence-invalid';
    text.innerHTML = `<strong>Di Luar Radius:</strong> Anda berada ${dist} meter dari ${outlet.name} (Batas Radius: ${outlet.radius_meters}m). <em>Presensi online ditolak kecuali dalam radius outlet.</em>`;
  }
};

// Snapshot from video to canvas
const captureSelfieSnapshot = () => {
  const video = document.getElementById('camera-feed');
  const canvas = document.getElementById('camera-snapshot-canvas');
  if (!video || !canvas) return null;

  canvas.width = video.videoWidth || 480;
  canvas.height = video.videoHeight || 360;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Stamp current time & GPS
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(10, canvas.height - 40, canvas.width - 20, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText(`GPS: ${AppState.deviceCoordinates.lat.toFixed(4)}, ${AppState.deviceCoordinates.lon.toFixed(4)} | ${new Date().toLocaleString('id-ID')}`, 20, canvas.height - 20);

  return canvas.toDataURL('image/jpeg', 0.85);
};

const submitAttendanceCheckIn = async () => {
  const outletId = document.getElementById('presensi-outlet-select').value;
  const shiftName = document.getElementById('presensi-shift-select').value;
  const outlet = AppState.outlets.find(o => o.id === outletId);

  // Take selfie
  const selfieBase64 = captureSelfieSnapshot();

  showToast('Memverifikasi GPS & Wajah Selfie...', 'info');

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
    if (res.ok) {
      if (data.in_radius) {
        showToast(`Presensi Berhasil! Status: ${data.attendance_status} (${data.late_minutes} menit)`, 'success');
      } else {
        showToast(`Peringatan: Presensi tercatat di LUAR RADIUS (${data.distance_meters}m)! Butuh approval atasan.`, 'warning');
      }
      await loadAttendanceLogs();
    } else {
      alert(data.detail || 'Gagal check-in');
    }
  } catch (err) {
    showToast('Terjadi kesalahan saat check-in', 'error');
  }
};

const renderAttendanceTable = (logs) => {
  const tbody = document.getElementById('attendance-tbody');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Belum ada data presensi hari ini.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(l => {
    const isLate = l.late_minutes > 0;
    const lateBadge = isLate ? `<span style="color:#ef4444; font-weight:700;">+${l.late_minutes} Menit (Denda: ${formatRupiah(l.late_deduction)})</span>` : '<span style="color:#10b981; font-weight:700;">Tepat Waktu</span>';

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
          <div style="font-size:11px; color:#64748b;">${l.check_in_time ? l.check_in_time.split(' ')[1] : '-'}</div>
        </td>
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
        <td>${formatRupiah(s.base_salary)}</td>
        <td>${formatRupiah(s.daily_allowance_total + s.overtime_pay)}</td>
        <td style="color:#ef4444; font-weight:700;">-${formatRupiah(s.total_deductions)}</td>
        <td style="font-weight:800; color:#065f46;">${formatRupiah(s.net_salary)}</td>
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
          <h2>COMPANYOPS ENTERPRISE</h2>
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
  if (!confirm('Jalankan proses Autopilot Payroll bulan ini untuk seluruh 275+ karyawan?')) return;
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
const switchChatChannel = (channel, el) => {
  AppState.activeChatChannel = channel;
  document.querySelectorAll('.chat-channel-item').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('active-chat-channel-name').textContent = channel;
  loadChatMessages(channel);
};

const loadChatMessages = async (channel = AppState.activeChatChannel) => {
  try {
    const res = await fetch(`/api/chat/messages?channel=${encodeURIComponent(channel)}`);
    const data = await res.json();
    renderChatMessages(data);
  } catch (err) {
    console.error('Failed loading chat:', err);
  }
};

const renderChatMessages = (messages) => {
  const container = document.getElementById('chat-messages-stream');
  if (!container) return;

  container.innerHTML = messages.map(m => {
    const isMe = m.sender_id === AppState.currentUser.id;
    return `
      <div class="chat-message-bubble ${isMe ? 'me' : ''}">
        <div class="chat-bubble-content">
          <div class="chat-sender-info">${m.sender_name} (${m.sender_division})</div>
          <div>${m.message}</div>
          <div class="chat-timestamp">${m.timestamp}</div>
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
};

const sendChatMessage = async (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-text-input');
  const text = input.value.trim();
  if (!text) return;

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
    if (res.ok) {
      input.value = '';
      await loadChatMessages(AppState.activeChatChannel);
    }
  } catch (err) {
    showToast('Gagal mengirim pesan', 'error');
  }
};

// ================= KALENDER & AGENDA =================
const loadCalendarEvents = async () => {
  try {
    const res = await fetch('/api/calendar/events');
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
  const list = document.getElementById('switch-user-list');
  renderUserSwitchItems(AppState.employees);
  openModal('modal-switch-user');
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

const exportCurrentTableCsv = () => {
  const table = AppState.dbState.currentTable || 'employees';
  showToast(`Mengekspor tabel ${table} ke file CSV / Excel...`, 'info');
  window.location.href = `/api/database/export-csv/${table}`;
};

const confirmResetDatabase = async () => {
  const confirmMsg = "⚠️ PERINGATAN:\nApakah Anda yakin ingin mereset database ke data awal default?\nSeluruh data inputan baru akan diatur ulang sesuai data template 275 karyawan.";
  if (!confirm(confirmMsg)) return;

  try {
    showToast('Sedang mereset database ke data awal demo...', 'info');
    const res = await fetch('/api/database/reset', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('Database berhasil direset ke data default demo!', 'success');
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
