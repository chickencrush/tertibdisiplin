/*
 * PENGATURAN APLIKASI
 * Ganti nilai API_URL dengan link "Web app" dari Apps Script (berakhiran /exec).
 * Contoh: https://script.google.com/macros/s/AKfycb.../exec
 */
window.TD_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbw23yj8ej85QJ9w2gcNrNPew5ZMpIUnZLpjsK8srKDYAjm5WuVdbncUkxoBXz8K2N0/exec'
};

// Add-on ini hanya memperluas pemilihan record checkout untuk akun tertentu.
// Ia menunggu fungsi checkout inti tersedia dan tidak mengubah rumus lembur/backend.
(function () {
  var script = document.createElement('script');
  script.src = './cross-date-checkout.js';
  script.async = true;
  (document.head || document.documentElement).appendChild(script);
})();
