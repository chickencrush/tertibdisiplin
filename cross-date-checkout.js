// TERTIB DISIPLIN — checkout lintas tanggal terbatas untuk Security dan Crew CCS UII.
// Menggunakan kembali handler checkout asli agar geofence, selfie, API, dan kalkulasi
// lembur tetap persis mengikuti perilaku aplikasi yang sudah ada.
(function () {
  'use strict';

  var MAX_OPEN_AGE_MS = 36 * 60 * 60 * 1000;
  var CCS_UII = 'chicken crush uii';
  var wrapped = false;

  function jakartaDate_(date) {
    var parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + '-' + values.month + '-' + values.day;
  }

  // API mengirim waktu lokal Jakarta sebagai yyyy-MM-dd HH:mm:ss.
  function attendanceTimestampMs_(value) {
    var match = String(value || '').trim().match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
    );
    if (!match) return NaN;
    return Date.UTC(
      Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      Number(match[4]) - 7, Number(match[5]), Number(match[6] || 0)
    );
  }

  function isSecurity_(user) {
    return String(user && user.division || '').trim().toLowerCase() === 'security';
  }

  function isCcsUiiCrew_(user) {
    if (!user) return false;
    var role = String(user.role || '').trim().toLowerCase();
    var outlet = String(user.outlet_name || '').trim().toLowerCase();
    return /(^|[^a-z])crew\s*ccs([^a-z]|$)/.test(role) && outlet === CCS_UII;
  }

  function findLatestOpenAttendance_(user, logs, nowMs) {
    var cutoff = nowMs - MAX_OPEN_AGE_MS;
    var eligible = (logs || []).filter(function (attendance) {
      if (String(attendance.employee_id) !== String(user.id)) return false;
      if (!attendance.check_in_time || attendance.check_out_time) return false;
      // Crew CCS cross-date hanya dapat menutup record dari outlet UII miliknya.
      if (isCcsUiiCrew_(user)) {
        if (String(attendance.outlet_name || '').trim().toLowerCase() !== CCS_UII) return false;
        if (user.outlet_id && String(attendance.outlet_id || '') !== String(user.outlet_id)) return false;
      }
      var time = attendanceTimestampMs_(attendance.check_in_time);
      return !isNaN(time) && time >= cutoff && time <= nowMs;
    });
    eligible.sort(function (a, b) {
      return attendanceTimestampMs_(b.check_in_time) - attendanceTimestampMs_(a.check_in_time);
    });
    return eligible[0] || null;
  }

  function installWrapper_() {
    if (wrapped || !window.AppState || typeof window.submitAttendanceCheckOut !== 'function') return false;
    var originalCheckout = window.submitAttendanceCheckOut;

    window.submitAttendanceCheckOut = async function () {
      var state = window.AppState;
      var user = state && state.currentUser;
      if (!isSecurity_(user) && !isCcsUiiCrew_(user)) {
        return originalCheckout.apply(this, arguments);
      }

      // Refresh hanya untuk akun target, supaya pemilihan record memakai data terbaru.
      if (typeof window.loadAttendanceLogs === 'function') {
        await window.loadAttendanceLogs();
      }

      var now = Date.now();
      var candidate = findLatestOpenAttendance_(user, state.attendanceLogs, now);
      var today = jakartaDate_(new Date(now));
      if (!candidate || String(candidate.date || candidate.check_in_time).slice(0, 10) === today) {
        // Tidak ada check-in lintas tanggal: alur normal tidak berubah.
        return originalCheckout.apply(this, arguments);
      }

      // Handler asli hanya mencari record bertanggal hari ini. Berikan salinan cache
      // sementara dengan tanggal hari ini; fungsi asli langsung menangkap record/id
      // sebelum mencapai await pertama. Record yang dikirim ke backend tetap ID asli,
      // tanggal database tidak disentuh, dan seluruh geofence/selfie/overtime tetap
      // dijalankan oleh handler yang sama seperti pengguna lain.
      var originalLogs = state.attendanceLogs;
      var checkoutLogs = (originalLogs || []).map(function (attendance) {
        if (String(attendance.id) !== String(candidate.id)) return attendance;
        var copy = Object.assign({}, attendance);
        copy.date = today;
        return copy;
      });
      state.attendanceLogs = checkoutLogs;
      var checkoutPromise;
      try {
        checkoutPromise = originalCheckout.apply(this, arguments);
      } finally {
        state.attendanceLogs = originalLogs;
      }
      return checkoutPromise;
    };
    wrapped = true;
    return true;
  }

  if (!installWrapper_()) {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (installWrapper_() || attempts >= 300) clearInterval(timer);
    }, 100);
  }
})();
