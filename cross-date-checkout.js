// TERTIB DISIPLIN — checkout lintas tanggal terbatas untuk Security dan Crew CCS UII.
// Alur check-in, geofence, endpoint backend, dan perhitungan lembur tidak diubah.
(function () {
  'use strict';

  var MAX_OPEN_ATTENDANCE_AGE_MS = 36 * 60 * 60 * 1000;
  var OUTLET_CCS_UII = 'chicken crush uii';
  var wrapped = false;

  function jakartaDate_(date) {
    var parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date || new Date());
    var values = {};
    parts.forEach(function (part) { values[part.type] = part.value; });
    return values.year + '-' + values.month + '-' + values.day;
  }

  // API menyimpan timestamp dalam format yyyy-MM-dd HH:mm:ss waktu Jakarta.
  function attendanceTimestampMs_(value) {
    var match = String(value || '').trim().match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
    );
    if (!match) return NaN;
    // Jakarta menggunakan UTC+7 tanpa daylight-saving time.
    return Date.UTC(
      Number(match[1]), Number(match[2]) - 1, Number(match[3]),
      Number(match[4]) - 7, Number(match[5]), Number(match[6] || 0)
    );
  }

  function eligibleUser_(user) {
    if (!user) return false;
    if (String(user.division || '').trim().toLowerCase() === 'security') return true;

    var role = String(user.role || '').trim().toLowerCase();
    var outlet = String(user.outlet_name || '').trim().toLowerCase();
    return /(^|[^a-z])crew\s*ccs([^a-z]|$)/.test(role) && outlet === OUTLET_CCS_UII;
  }

  function isCcsUiiRecord_(user, attendance) {
    if (String(user.division || '').trim().toLowerCase() === 'security') return true;
    if (!eligibleUser_(user)) return false;
    if (String(attendance.outlet_name || '').trim().toLowerCase() !== OUTLET_CCS_UII) return false;
    return !user.outlet_id || String(attendance.outlet_id || '') === String(user.outlet_id);
  }

  function findCrossDateAttendance_(user, logs, nowMs) {
    var todayJakarta = jakartaDate_(new Date(nowMs));
    var cutoff = nowMs - MAX_OPEN_ATTENDANCE_AGE_MS;
    var candidates = (logs || []).filter(function (attendance) {
      if (String(attendance.employee_id) !== String(user.id)) return false;
      if (!attendance.check_in_time || attendance.check_out_time) return false;
      if (!isCcsUiiRecord_(user, attendance)) return false;

      var checkInMs = attendanceTimestampMs_(attendance.check_in_time);
      if (isNaN(checkInMs) || checkInMs < cutoff || checkInMs > nowMs) return false;
      // Hanya pilih record yang tanggal IN-nya berbeda dari tanggal Jakarta saat ini.
      return String(attendance.date || attendance.check_in_time).slice(0, 10) !== todayJakarta;
    });
    candidates.sort(function (a, b) {
      return attendanceTimestampMs_(b.check_in_time) - attendanceTimestampMs_(a.check_in_time);
    });
    return candidates[0] || null;
  }

  function notify_(message, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'info');
      return;
    }
    var node = document.createElement('div');
    node.textContent = message;
    node.setAttribute('role', 'status');
    node.style.cssText = 'position:fixed;z-index:10000;bottom:20px;left:50%;transform:translateX(-50%);padding:12px 16px;background:#1f2937;color:#fff;border-radius:8px;max-width:90vw;font:14px sans-serif;';
    document.body.appendChild(node);
    setTimeout(function () { node.remove(); }, 5000);
  }

  function wait_(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function ensureGps_() {
    var state = window.AppState;
    if (state.gpsOk) return Promise.resolve(true);
    if (typeof window.detectDeviceGPS !== 'function') return Promise.resolve(false);
    window.detectDeviceGPS();
    var started = Date.now();
    return new Promise(function (resolve) {
      var timer = setInterval(function () {
        if (state.gpsOk || Date.now() - started >= 20000) {
          clearInterval(timer);
          resolve(!!state.gpsOk);
        }
      }, 250);
    });
  }

  function locationIsAllowed_(user, state) {
    var outlets = typeof window.getAllowedPresensiOutlets === 'function'
      ? window.getAllowedPresensiOutlets()
      : [];
    var gps = state.deviceCoordinates || {};
    if (!state.gpsOk || !isFinite(Number(gps.lat)) || !isFinite(Number(gps.lon))) return false;
    return (outlets || []).some(function (outlet) {
      var lat = Number(outlet.lat), lon = Number(outlet.lon);
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) return false;
      var dLat = (lat - Number(gps.lat)) * Math.PI / 180;
      var dLon = (lon - Number(gps.lon)) * Math.PI / 180;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(Number(gps.lat) * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      var distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      var radius = Number(outlet.radius_meters) || 100;
      return distance <= radius + 5;
    });
  }

  function addSelfieStamp_(ctx, canvas, state) {
    var width = canvas.width, height = canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(10, height - 40, width - 20, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    var gps = state.deviceCoordinates || { lat: 0, lon: 0 };
    ctx.fillText(
      'GPS: ' + Number(gps.lat).toFixed(4) + ', ' + Number(gps.lon).toFixed(4) + ' | ' + new Date().toLocaleString('id-ID'),
      20, height - 20
    );
  }

  function captureNativeSelfie_(state) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.setAttribute('capture', 'user');
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        resolve(value);
      }
      input.onchange = function () {
        var file = input.files && input.files[0];
        if (!file || !file.type || file.type.indexOf('image/') !== 0) return finish(null);
        var image = new Image();
        var objectUrl = URL.createObjectURL(file);
        image.onload = function () {
          var scale = Math.min(1, 800 / Math.max(image.width, image.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          var ctx = canvas.getContext('2d');
          if (!ctx) { URL.revokeObjectURL(objectUrl); return finish(null); }
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          addSelfieStamp_(ctx, canvas, state);
          URL.revokeObjectURL(objectUrl);
          finish(canvas.toDataURL('image/jpeg', 0.85));
        };
        image.onerror = function () { URL.revokeObjectURL(objectUrl); finish(null); };
        image.src = objectUrl;
      };
      input.addEventListener('cancel', function () { finish(null); });
      input.click();
    });
  }

  async function captureSelfie_(state) {
    var video = document.getElementById('camera-feed');
    var canvas = document.getElementById('camera-snapshot-canvas');
    if (state.cameraReady && state.cameraStream && video && video.videoWidth && canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      var ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        addSelfieStamp_(ctx, canvas, state);
        return canvas.toDataURL('image/jpeg', 0.85);
      }
    }
    return captureNativeSelfie_(state);
  }

  async function submitCrossDateCheckout_(attendance) {
    var state = window.AppState;
    var user = state && state.currentUser;
    var button = document.getElementById('btn-submit-checkout');
    if (!user || !user.id) {
      notify_('Sesi login tidak ditemukan. Silakan login kembali.', 'error');
      return;
    }

    if (typeof window.loadEarlyCheckoutRequests === 'function') {
      var requests = await window.loadEarlyCheckoutRequests({ scope: 'mine' });
      var pending = (requests || []).some(function (request) {
        return String(request.attendance_id) === String(attendance.id) && String(request.status) === 'Pending';
      });
      if (pending) {
        notify_('Pengajuan pulang lebih awal masih menunggu approval.', 'warning');
        return;
      }
    }

    if (button) { button.disabled = true; button.textContent = 'Memeriksa GPS...'; }
    try {
      if (!(await ensureGps_())) {
        notify_('Lokasi GPS belum tersedia. Izinkan akses lokasi lalu coba lagi.', 'warning');
        return;
      }
      if (!locationIsAllowed_(user, state)) {
        notify_('Presensi pulang ditolak. Pastikan Anda berada dalam radius titik lokasi yang diizinkan.', 'error');
        return;
      }

      if (!state.cameraReady && typeof window.startCamera === 'function') {
        if (button) button.textContent = 'Memulai kamera...';
        await window.startCamera();
      }
      if (button) button.textContent = 'Ambil selfie...';
      notify_('Ambil selfie untuk menyelesaikan presensi pulang.', 'info');
      var selfie = await captureSelfie_(state);
      if (!selfie) {
        notify_('Selfie wajib diambil untuk presensi pulang.', 'warning');
        return;
      }

      if (button) button.textContent = 'Mengirim presensi pulang...';
      var response = await fetch('/api/attendance/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendance_id: attendance.id,
          employee_id: user.id,
          lat: state.deviceCoordinates.lat,
          lon: state.deviceCoordinates.lon,
          selfie_base64: selfie,
          notes: 'Presensi Pulang (Check-out) Mandiri'
        })
      });
      var data = await response.json();
      if (response.ok && data.status !== 'error') {
        var time = data.check_out_time ? (data.check_out_time.split(' ')[1] || data.check_out_time) : '-';
        var overtime = Number(data.overtime_hours) > 0 ? ' (+' + data.overtime_hours + ' jam lembur)' : '';
        notify_('Presensi pulang berhasil! Jam pulang: ' + time + overtime, 'success');
        if (typeof window.loadAttendanceLogs === 'function') await window.loadAttendanceLogs();
      } else {
        notify_(data.detail || data.message || 'Gagal check-out. Coba lagi.', 'error');
      }
    } catch (error) {
      console.error('Cross-date checkout error:', error);
      notify_('Terjadi kesalahan saat presensi pulang. Periksa koneksi lalu coba lagi.', 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = '<i data-feather="log-out" style="width:16px; height:16px;"></i> AMBIL SELFIE & PRESENSI PULANG';
        if (window.feather) window.feather.replace();
      }
    }
  }

  function installWrapper_() {
    if (wrapped || typeof window.submitAttendanceCheckOut !== 'function' || !window.AppState) return false;
    var original = window.submitAttendanceCheckOut;
    var replacement = async function () {
      var user = window.AppState.currentUser;
      if (!eligibleUser_(user)) return original.apply(this, arguments);

      // Muat ulang hanya untuk akun target agar keputusan memakai record terbaru.
      if (typeof window.loadAttendanceLogs === 'function') await window.loadAttendanceLogs();
      var now = Date.now();
      var crossDate = findCrossDateAttendance_(user, window.AppState.attendanceLogs, now);
      if (!crossDate) return original.apply(this, arguments);
      return submitCrossDateCheckout_(crossDate);
    };
    replacement.__tdCrossDateCheckoutWrapped = true;
    window.submitAttendanceCheckOut = replacement;
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
