# Panduan GitHub Pages (Tampilan Aplikasi PWA)

Bagian ini mengurus tampilan: halaman web yang dibuka karyawan dan bisa dipasang di layar HP seperti aplikasi.
Isi folder ini: `index.html`, `style.css`, `app.js`, `api-client.js`, `config.js`, `sw.js`, `manifest.json`, `diagnostik.html`, `diagnostik.js`, folder `icons/`.
Folder ini berisi tampilan saja, tidak ada data karyawan.

## Syarat
Selesaikan dulu panduan Apps Script sampai kamu punya **link /exec**.

## Langkah 1: Buat repository
1. Daftar atau login di github.com.
2. Klik **New repository**. Nama: `tertib-disiplin`. Pilih **Public** (GitHub Pages gratis butuh Public). Centang **Add a README file**. Klik **Create repository**.

## Langkah 2: Unggah file
1. Di halaman repository, klik **Add file > Upload files**.
2. Buka folder `github` di komputer, pilih **semua isinya** (termasuk folder `icons`), lalu seret ke halaman GitHub. Jangan unggah folder `github`-nya, tapi isinya, supaya `index.html` ada di paling atas.
3. Tunggu selesai, klik **Commit changes**.
4. **Periksa:** halaman utama repository harus menampilkan folder `icons` dan file `index.html`, `app.js`, `config.js`, dan lainnya di daftar paling atas. Kalau folder `icons` tidak ada, ulangi: Add file > Upload files, lalu seret **folder `icons`-nya** (bukan memilih file satu per satu, karena tombol "choose your files" tidak bisa memilih folder).

## Langkah 3: Isi link API
1. Klik file `config.js`, klik ikon pensil (Edit).
2. Ganti `GANTI_DENGAN_LINK_EXEC_APPS_SCRIPT` dengan link `/exec` dari Apps Script. Tetap pakai tanda kutip.
   Contoh: `API_URL: 'https://script.google.com/macros/s/AKfycb.../exec'`
3. Klik **Commit changes**.

## Langkah 4: Aktifkan GitHub Pages
1. Buka **Settings > Pages**.
2. Source: **Deploy from a branch**. Branch: **main**, folder **/ (root)**. Klik **Save**.
3. Tunggu 1 sampai 3 menit, muat ulang halaman Settings > Pages. Muncul link:
   `https://NAMAKAMU.github.io/tertib-disiplin/`
4. Bagikan link ini ke karyawan.

## Langkah 5: Pasang di layar HP / komputer
- **Android (Chrome):** buka link, tekan banner **Install Sekarang** atau menu titik tiga > **Install aplikasi**.
- **iPhone (Safari):** buka link, tombol Share > **Add to Home Screen** > **Add**.
- **Komputer (Chrome/Edge):** klik ikon instal di kanan address bar.
Izinkan **Lokasi** dan **Kamera** saat diminta. Presensi tidak bisa jalan tanpa lokasi.

## Langkah 6: Periksa dengan halaman Diagnostik
Buka `https://NAMAKAMU.github.io/tertib-disiplin/diagnostik.html`. Halaman ini memeriksa otomatis: config.js, berkas dan ikon di GitHub, link Apps Script, jalur kirim data, dan kesiapan Spreadsheet. Tiap baris hijau (✓), kuning (!), atau merah (✕) beserta saran perbaikannya.
- Ada kotak **Tes login** untuk menguji NIP dan password. Pesannya persis sama dengan yang dikirim server.
- Tombol **Salin laporan** untuk dikirim ke pembuat bila masih ada masalah.
- Tombol **Bersihkan cache aplikasi** menghapus versi lama yang tersimpan di HP/komputer.

## Memperbarui aplikasi
1. Unggah ulang file yang berubah (Add file > Upload files, nama sama akan menimpa).
2. Buka `sw.js`, naikkan angka versi `tertib-disiplin-v1` menjadi `v2`, `v3`, dan seterusnya, supaya HP karyawan mengambil versi baru.
3. Perubahan tampil 1 sampai 10 menit setelah commit (GitHub menyimpan cache). Jika `config.js` baru diganti tapi masih dianggap kosong, tunggu beberapa menit lalu tekan Ctrl+F5, atau pakai tombol Bersihkan cache di halaman Diagnostik.

## Jika ada masalah
| Gejala | Penyebab dan solusi |
|---|---|
| Logo tidak muncul | Folder `icons` belum terunggah. Aplikasi tetap menampilkan logo cadangan, tapi ikon PWA butuh folder itu. Ulangi Langkah 2 poin 4. |
| "API_URL belum diisi" | `config.js` belum diganti. Ikuti Langkah 3. |
| "Server tidak membalas dengan benar" | Link salah, atau Deploy Apps Script belum "Anyone". Buka link `/exec` di browser, harus muncul `{"status":200,...}`. |
| Login gagal terus, padahal benar | Setelah 5 kali salah, akun terkunci 5 menit. Tunggu, atau admin reset password. |
| Perubahan Code.gs tidak terasa | Belum membuat **New version** di Deploy > Manage deployments. |
| Halaman 404 di github.io | Pages belum aktif atau `index.html` ada di dalam subfolder. Ulangi Langkah 2 dan 4. |
| Kamera/lokasi tidak muncul | Pastikan membuka lewat `https://` dan izin browser untuk situs ini diaktifkan. |
| Tampilan lama masih muncul | Naikkan versi di `sw.js`, lalu tutup dan buka lagi aplikasinya. |

## Catatan
- Ikon grafik dan font memakai layanan internet (CDN), jadi sebagian tampilan tidak lengkap saat offline. Presensi dan data selalu butuh internet.
- Karena repository Public, jangan simpan password atau data karyawan di dalamnya. Data hanya ada di Google Sheets.
