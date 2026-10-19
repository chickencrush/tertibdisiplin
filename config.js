/**
 * ============================================================================
 * TERTIB DISIPLIN - Global Configuration File
 * ============================================================================
 * Hubungkan aplikasi ini ke Google Sheets dan Google Drive dengan cara:
 * 1. Deploy Apps Script (Code.gs & Setup.gs) sebagai Web App.
 * 2. Tempelkan URL Web App yang didapat ke dalam variabel `GAS_WEBAPP_URL` di bawah.
 */

window.APP_CONFIG = {
  // Masukkan URL Google Apps Script Web App Anda di sini (akhiran /exec):
  // Contoh: "https://script.google.com/macros/s/AKfycbx.../exec"
  GAS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbw_8hZ8MTeXQtEWaIYGkr83m9H1icf56m_0g_Rv_PzP--OE-kqluosg_xtYxAR6kJk/exec",

  // Konfigurasi Brand & Identitas
  APP_NAME: "TERTIB DISIPLIN",
  TAGLINE: "Sistem Kontrol Operasional & Presensi GPS Karyawan",
  COMPANY_NAME: "CHICKEN  CRUSH INDONESIA",
  VERSION: "2.0.0-GAS-GDrive",

  // Jika URL GAS diisi, aplikasi akan otomatis beralih 100% ke Google Sheets & Drive
  // Jika kosong, aplikasi menggunakan backend API server lokal (Python/FastAPI)
  get isGoogleBackendActive() {
    return Boolean(this.GAS_WEBAPP_URL && this.GAS_WEBAPP_URL.trim().length > 15);
  }
};
