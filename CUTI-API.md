# Panel Cuti & Izin: status dan kontrak backend

Frontend berada di cuti.html dan cuti.js. Buka pada preview branch yang menggunakan origin/login sama dengan aplikasi utama. Halaman terpisah ini belum ditautkan ke sidebar. Jangan mengubah deployment produksi untuk sekadar melihat preview.

BELUM AKTIF END-TO-END: backend Apps Script tidak tersedia di repositori ini. Endpoint di bawah adalah kontrak baru, bukan klaim endpoint sudah ada. Panel menonaktifkan pengajuan jika pemuatan data gagal. Tidak ada saldo dummy atau penyimpanan pengajuan lokal. Halaman ini memuat config.js sebelum api-client.js dan menggunakan token sesi aplikasi utama.

## Envelope Apps Script
Gunakan router yang sudah ada: request {method,path,body,token,slipToken}; response {status:200,body:{...}}. Identitas WAJIB diambil dari token tervalidasi, bukan employee_id atau divisi kiriman klien. Kegagalan menggunakan status 401/403/404/409/422/500 yang sesuai.

## Endpoint baru
- GET /api/leave/me -> {employee:{id,name},balance:null|{period,entitlement,used,remaining},requests:[],can_submit:boolean,can_review:boolean}. Semua saldo angka dalam hari, bukan string. balance:null berarti hak belum dikonfigurasi, bukan nol. Hanya data akun dari token. Server menentukan can_submit berdasarkan konfigurasi dan kebijakan.
- GET /api/leave/pending -> {requests:[]}. Hanya peninjau sah; filter outlet/divisi dari server.
- POST /api/leave/requests body {kind,start_date,end_date,reason,idempotency_key} -> {status:"success",request:{...}}. kind: cuti|izin|sakit. Tanggal ISO YYYY-MM-DD. Status awal pending.
- POST /api/leave/requests/{id}/decision body {decision,note,expected_version} -> {status:"success",request:{...}}. decision: approved|rejected. Penolakan wajib catatan. Hanya transisi pending, versi harus cocok; konflik -> 409.

Request record: {id,employee_name,kind,start_date,end_date,days,status,reason,review_note,version}. Riwayat pribadi dan antrean memakai bentuk ini. days dihitung server menggunakan jadwal kerja karyawan, hari libur, zona waktu kebijakan, dan aturan perusahaan. Frontend tidak mengasumsikan Sabtu/Minggu libur atau hak tahunan tertentu.

## Saldo otomatis dan integritas
1. Konfigurasi hak dan periode per karyawan; jangan isi nilai tahunan default tanpa persetujuan kebijakan.
2. Simpan ledger hak, penyesuaian dan penggunaan dengan referensi pengajuan unik. Saldo = hak + penyesuaian - penggunaan sah. entitlement pada API mencerminkan total hak efektif.
3. Pending/rejected tidak memotong saldo. Izin/sakit hanya memotong jika kebijakan server secara eksplisit menetapkannya.
4. Persetujuan harus memeriksa ulang saldo, benturan tanggal, kewenangan, status dan versi di dalam LockService yang sama dengan penulisan. Cegah persetujuan sendiri kecuali kebijakan eksplisit mengizinkan.
5. Deduplicasi idempotency_key per identitas dan payload. Payload berbeda dengan key sama -> 409. Jangan mengulang POST otomatis. Keputusan berulang tidak boleh mendebit saldo dua kali.
6. Sheets tidak menyediakan transaksi lintas-sheet: gunakan status commit/ledger unik dan prosedur pemulihan serta rekonsiliasi jika penulisan terputus. LockService saja tidak menjamin atomicity lintas-sheet.
7. Pembatalan approved, jika nanti ditambahkan, wajib reversal ledger satu kali; tidak boleh sekadar menghapus baris.
8. Catat aktor, waktu, status sebelum/sesudah dan alasan. Batasi panjang input dan normalisasi tanggal; cegah formula injection saat menyimpan teks ke Sheets.
9. Tolak akses lintas karyawan, peninjau tidak sah, saldo tidak cukup, tanggal tidak valid, periode yang belum didukung, dan keputusan konflik.

Panel mengambil ulang data setelah operasi sukses dan tiap 60 detik ketika halaman terlihat serta formulir belum diisi. Ini polling, bukan push realtime. Saldo akun lain akan terbaca terbaru pada refresh berikutnya setelah backend menerapkan ledger.

## Pengujian sebelum merge
Belum diuji pada browser atau backend live. Uji: sesi kedaluwarsa, akses silang, saldo belum diatur, saldo nol, API tidak tersedia, tanggal terbalik, kalender shift, duplikasi pengajuan, double approval, persetujuan bersamaan saat saldo terbatas, kegagalan penulisan Sheets dan rekonsiliasi. Uji izin/sakit tidak mendebit tanpa kebijakan. Pastikan branch preview tidak memakai data produksi tanpa persetujuan.
