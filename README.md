# TERTIB DISIPLIN - Sistem Kontrol Operasional & Presensi GPS Karyawan
### Multi-Outlet F&B & Hospitality Suite • Google Sheets Database & Google Drive Storage

Aplikasi Progressive Web App (PWA) modern untuk pemantauan dan kontrol pekerjaan **Tim Management** dan **Tim Operasional** (Multi-Outlet), terintegrasi penuh dengan **Google Sheets** sebagai database real-time dan **Google Drive** sebagai media penyimpanan bukti foto live selfie & laporan operasional.

---

## 🌟 Arsitektur Sistem (Serverless & Zero Cost)

```
[ PWA Client (GitHub Pages / Mobile / PC) ]
                   │
                   ▼  (JSON REST API)
       [ Google Apps Script Web App ]
         │                        │
         ▼                        ▼
[ Google Sheets Database ]   [ Google Drive Folder ]
(Tabel Karyawan, Presensi,   (Foto Live Selfie Presensi,
 Laporan, Payroll, Agenda)    Bukti Foto Selesai & Hold)
```

- **Hosting Frontend**: GitHub Pages (Gratis, HTTPS aktif otomatis, bisa di-install di Android/iOS/PC).
- **Backend API**: Google Apps Script (`Code.gs` & `Setup.gs`).
- **Database**: Google Sheets (Real-time spreadsheet multi-tab).
- **Storage Bukti Foto**: Google Drive Folder (`TERTIB_DISIPLIN_UPLOADS`).
- **Data Status**: Bersih (*Clean State*), bebas dari data demo/dummy.

---

## 📁 Struktur Berkas Proyek

```
DAILY REPORT/
├── google_apps_script/          # Berkas untuk di-upload ke Apps Script
│   ├── Code.gs                  # RESTful API Controller (CRUD Sheets & Drive)
│   ├── Setup.gs                 # Inisialisasi tabel, styling, & buat Akun Master Admin
│   ├── appsscript.json          # Manifest OAuth scopes Google Workspace
│   └── README_GAS.md            # Panduan detail setup Apps Script
├── icons/                       # Ikon & Logo PWA
├── index.html                   # UI Utama Web App & PWA
├── app.js                       # Controller JavaScript & Universal API Bridge
├── config.js                    # Konfigurasi URL Google Apps Script Web App
├── style.css                    # Desain Letspa Executive Burgundy (#701c34)
├── manifest.json                # PWA Web Manifest
├── sw.js                        # Service Worker PWA (Offline capability)
├── server.py                    # (Opsional) Server lokal Python FastAPI jika offline
├── database.py                  # (Opsional) SQLite lokal
├── run.bat                      # (Opsional) Runner server lokal
└── .gitignore                   # Aturan Git commit
```

---

## 🚀 Panduan Setup Cepat (Google Sheets + GitHub)

### 1. Setup Backend di Google Sheets & Google Drive
1. Buat Spreadsheet baru di [Google Drive](https://drive.google.com/), beri nama `TERTIB_DISIPLIN_DATABASE`.
2. Klik menu **Ekstensi (Extensions)** > **Apps Script**.
3. Buat file baru:
   - `Setup.gs`: Salin dari [`google_apps_script/Setup.gs`](google_apps_script/Setup.gs).
   - `Code.gs`: Salin dari [`google_apps_script/Code.gs`](google_apps_script/Code.gs).
   - `appsscript.json`: Salin dari [`google_apps_script/appsscript.json`](google_apps_script/appsscript.json) (aktifkan via Project Settings jika belum terlihat).
4. Di bilah atas, pilih fungsi **`setupInitialDatabase`**, lalu klik **Run (Jalankan)** ▶.
   - Berikan izin (*Grant permissions*) yang diminta Google.
   - Script akan otomatis membuat seluruh Sheet tabel, folder Google Drive untuk foto, dan Akun Master Admin.
5. Klik tombol biru **Deploy** > **New deployment** (Deploy baru):
   - Tipe: **Web app**
   - Execute as: **Me (email Anda)**
   - Who has access: **Anyone (Siapa saja)**
   - Klik **Deploy**, lalu **Salin Web app URL** yang didapat (akhiran `/exec`).

---

### 2. Hubungkan Frontend ke URL Google Apps Script
Buka file [`config.js`](config.js) dan [`static/config.js`](static/config.js), lalu masukkan URL Web App yang Anda salin:

```javascript
window.APP_CONFIG = {
  GAS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbx.../exec",
  APP_NAME: "TERTIB DISIPLIN",
  COMPANY_NAME: "CompanyOps Enterprise"
};
```

---

### 3. Upload ke GitHub & Aktifkan GitHub Pages (Hosting Gratis)
1. Buat repository baru di [GitHub](https://github.com/new), misalnya: `tertib-disiplin`.
2. Buka terminal di folder proyek ini dan jalankan:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Tertib Disiplin with Google Sheets & GDrive backend"
   git branch -M main
   git remote add origin https://github.com/USERNAME_ANDA/tertib-disiplin.git
   git push -u origin main
   ```
3. Di repository GitHub Anda, buka menu **Settings** > **Pages**.
4. Di bagian **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **`main`** / Folder: **`/ (root)`**
   - Klik **Save**.
5. Tunggu 1–2 menit, GitHub Pages akan memberikan tautan publik aplikasi Anda:  
   `https://USERNAME_ANDA.github.io/tertib-disiplin/`

Aplikasi kini dapat dibuka dari laptop, tablet, maupun smartphone Android & iPhone dan langsung siap di-install sebagai aplikasi Native (PWA)!

---

## 🔑 Akun Master Admin Bersih

Setelah setup dijalankan, sistem hanya memiliki 1 akun utama bersih:

| Peran | NIP / Identitas | Email Terdaftar | Password Default | PIN Slip Gaji Default |
| :--- | :--- | :--- | :--- | :--- |
| **Master Admin** | `ADM001` | `admin@tertibdisiplin.com` | `admin123` | `123456` |

> ⚠️ **PENTING — Keamanan**: Password & PIN di atas adalah **kredensial awal** yang HARUS diubah segera setelah login pertama melalui sheet `Employees` di Google Spreadsheet Anda. Panel "Masuk Cepat" yang sebelumnya muncul di halaman login kini **telah dihapus** demi keamanan produksi. Selain itu, celah keamanan universal-bypass (login dengan `admin123`/`123456` pada akun manapun) **telah ditutup** — verifikasi kini ketat: hanya password atau PIN yang benar-benar tersimpan untuk pengguna tersebut yang diterima.

*Login juga mendukung opsi **"Ingat saya di perangkat ini"** — jika tidak dicentang, sesi hanya tersimpan di `sessionStorage` (hilang saat browser ditutup) untuk perlindungan ekstra di perangkat umum/bersama.*

*Karyawan baru dapat didaftarkan langsung lewat form **Daftar Akun Baru** pada aplikasi web, atau ditambahkan langsung pada sheet `Employees` di Google Spreadsheet Anda.*

---

## 📊 Struktur Sheet Database (Google Sheets)

1. **`Employees`**: Data induk karyawan, divisi, role, status kerja, grade Permenaker 1/2017, gaji pokok, uang hadir, PIN slip gaji.
2. **`Outlets`**: Daftar lokasi cabang, koordinat Latitude/Longitude GPS, dan toleransi radius geofence presensi.
3. **`Attendance`**: Catatan presensi shift, jam masuk, jarak GPS, URL foto selfie live di Google Drive, dan status keterlambatan.
4. **`DailyReports`**: Kanban aktivitas (*Proses*, *Hold*, *Selesai*), wajib menyertakan link foto bukti di Google Drive dan alasan kendala (*Hold Reason*).
5. **`Payslips`**: Arsip slip gaji autopilot bulanan (Gaji pokok, tunjangan, uang hadir, BPJS TK, BPJS Kes, PPh 21 TER, take-home pay).
6. **`CalendarEvents`**: Agenda rapat manajemen, briefing harian, dan audit cabang.
7. **`ChatMessages`**: Ruang pesan internal multi-divisi.
8. **`Settings`**: ID folder Google Drive upload dan parameter operasional.

---

## 🛠️ Opsi Menjalankan Lokal (Offline Mode)
Jika ingin menjalankan secara lokal tanpa koneksi internet:
1. Jalankan `run.bat` atau ketik perintah:
   ```bash
   py -m uvicorn server:app --host 0.0.0.0 --port 8000
   ```
2. Buka browser di [http://localhost:8000](http://localhost:8000).
