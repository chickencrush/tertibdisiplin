# 📋 Panduan Setup Google Sheets & Google Drive (Google Apps Script Backend)

Ikuti langkah-langkah mudah di bawah ini untuk menghubungkan aplikasi **TERTIB DISIPLIN** langsung ke akun Google Anda (Gratis 100%, tanpa butuh server/hosting berbayar):

---

## 🚀 Langkah 1: Buat Google Spreadsheet Baru
1. Buka [Google Drive](https://drive.google.com/) Anda.
2. Klik tombol **+ Baru (+ New)** > **Google Spreadsheet (Google Sheets)**.
3. Beri nama spreadsheet tersebut, misalnya:  
   `TERTIB_DISIPLIN_DATABASE`.

---

## 🚀 Langkah 2: Buka Editor Google Apps Script
1. Di dalam Google Spreadsheet tersebut, klik menu atas:  
   **Ekstensi (Extensions)** > **Apps Script**.
2. Tab baru editor skrip Google Apps Script akan terbuka.
3. Beri nama proyek skrip di pojok kiri atas, misalnya:  
   `TertibDisiplin_API`.

---

## 🚀 Langkah 3: Masukkan File Skrip
Di menu sebelah kiri terdapat daftar file (ikon `Files`):

### 1. File `Setup.gs`
- Klik tanda **+** di sebelah tulisan *Files* > pilih **Script**.
- Beri nama: `Setup`.
- Hapus semua isi bawaan, lalu **Copy & Paste** seluruh isi file:  
  📁 [`google_apps_script/Setup.gs`](./Setup.gs)

### 2. File `Code.gs`
- Buka file bawaan `Code.gs`.
- Hapus semua isi bawaan, lalu **Copy & Paste** seluruh isi file:  
  📁 [`google_apps_script/Code.gs`](./Code.gs)

### 3. File `appsscript.json` (Opsional tapi Direkomendasikan)
- Di menu kiri, klik **Project Settings (ikon Gerigi / Gear)**.
- Centang opsi: **"Show 'appsscript.json' manifest file in editor"**.
- Kembali ke menu **Editor (ikon <>)**, buka `appsscript.json`.
- Ganti isinya dengan isi file:  
  📁 [`google_apps_script/appsscript.json`](./appsscript.json)

---

## 🚀 Langkah 4: Jalankan Setup Inisialisasi Database
1. Di bilah menu atas editor Apps Script, cari dropdown fungsi (biasanya tertulis *myFunction* atau *setupInitialDatabase*).
2. Pilih fungsi: **`setupInitialDatabase`**.
3. Klik tombol **Run (Jalankan)** ▶.
4. Google akan meminta izin akses (*Authorization Required*):
   - Klik **Review Permissions** (Tinjau Izin).
   - Pilih akun Google Anda.
   - Jika muncul peringatan *"Google hasn't verified this app"*, klik **Advanced (Lanjutan)** di kiri bawah > klik **Go to TertibDisiplin_API (unsafe)**.
   - Klik **Allow (Izinkan)**.
5. Tunggu proses selesai (muncul status *Execution complete*).

> **Hasil yang Otomatis Dibuat:**
> - Seluruh sheet/tabel: `Employees`, `Outlets`, `Attendance`, `DailyReports`, `Payslips`, `CalendarEvents`, `ChatMessages`, `Settings`.
> - Folder Google Drive: `TERTIB_DISIPLIN_UPLOADS` (untuk menyimpan foto selfie dan bukti laporan secara otomatis).
> - **HANYA 1 Akun Master Admin Bersih** (tanpa dummy demo 275 data):
>   - **NIP**: `ADM001`
>   - **Email**: `admin@tertibdisiplin.com`
>   - **Password**: `admin123`
>   - **PIN**: `123456`

---

## 🚀 Langkah 5: Deploy Menjadi Web App (API Publik)
1. Di pojok kanan atas editor Apps Script, klik tombol biru: **Deploy** > **New deployment**.
2. Di sebelah kiri tulisan *Select type*, klik ikon gerigi ⚙️ > pilih **Web app**.
3. Isi konfigurasi berikut:
   - **Description**: `Versi 1.0 Produksi`
   - **Execute as**: **Me (email Anda)**
   - **Who has access**: **Anyone (Siapa saja)**  
     *(Wajib pilih "Anyone" agar aplikasi web / PWA frontend bisa mengirim data presensi & laporan).*
4. Klik tombol **Deploy**.
5. Salin (Copy) **Web app URL** yang muncul, bentuknya seperti:  
   `https://script.google.com/macros/s/AKfycbx.../exec`

---

## 🚀 Langkah 6: Hubungkan ke Aplikasi Web
Buka file [`static/config.js`](../static/config.js) di folder proyek ini:
Ganti nilai variabel `GAS_WEBAPP_URL` dengan URL yang Anda salin tadi:

```javascript
window.APP_CONFIG = {
  // Masukkan URL Web App Google Apps Script Anda di sini:
  GAS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbx.../exec",
  APP_NAME: "TERTIB DISIPLIN"
};
```

Simpan file, dan aplikasi Anda kini 100% menggunakan **Google Sheets** sebagai database dan **Google Drive** untuk upload foto!
