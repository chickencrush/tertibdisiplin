# KPI pribadi dan edit profil: kontrak integrasi

Frontend akun-pribadi.js dimuat melalui config.js pada halaman utama. KPI lama disembunyikan, bukan dihapus, agar controller lama tidak kehilangan target DOM. Ini pembatasan tampilan, bukan perbaikan otorisasi API lama. Semua akun, termasuk admin, melihat halaman KPI pribadi saja. Jangan menganggap menyembunyikan tabel mengamankan data yang sudah dikirim server.

Endpoint berikut BELUM diverifikasi tersedia dan memerlukan implementasi pada Apps Script yang dipakai deployment. Jangan menyatakan fitur aktif end-to-end sebelum integrasi dan pengujian. Envelope tetap {method,path,body,token,slipToken} dengan response {status,body}.

- GET /api/kpi/me -> {employee:{id,name},period:string,metrics:[{label:string,value:number,unit?:string}]}. Ambil identitas dari token dan hanya kembalikan analisis akun tersebut. Jangan menyertakan leaderboard, nilai rekan kerja, atau agregat divisi. Format metrik harus dijelaskan dan dihitung server, tanpa nilai dummy.
- GET /api/profile/me -> {employee:{id,nip,name,email,phone,address,division,role,avatar_url},version:string|number,can_edit:boolean}. Hanya data pemilik token. Jangan kembalikan password, PIN atau komponen gaji.
- PATCH /api/profile/me body {name,email,phone,address,expected_version,avatar?:{mime:"image/jpeg",data:base64}} -> {status:"success",employee:{id,name,email,phone,address,avatar_url},version}. Kembalikan profil yang benar-benar tersimpan. Frontend tidak mengulang PATCH otomatis dan meminta reload setelah hasil tidak pasti.

Backend harus whitelist field, menolak employee_id/peran/divisi/NIP/gaji dari klien, memvalidasi email serta panjang teks, memeriksa duplikasi email dan expected_version (konflik 409), serta mengikat transaksi pada identitas token. Validasi ulang ukuran, signature, dan format gambar di server; pembatasan browser bukan kontrol keamanan. Foto frontend dibatasi input 2 MB dan dikonversi JPEG hingga 512 piksel.

Simpan foto di storage yang aksesnya sesuai kebijakan data karyawan, bukan commit ke GitHub atau saldo/foto palsu di localStorage. avatar_url harus dapat dimuat browser melalui HTTPS sesuai otorisasi aplikasi. Jangan otomatis membuat folder/foto terbuka untuk publik. Update sumber data Employees yang sama agar foto menjadi bagian data diri lintas perangkat. Kelola foto lama setelah update berhasil dan catat audit.

Perubahan email tidak boleh memberikan akses ke akun lain; jika email dipakai untuk pemulihan/login, verifikasi kepemilikan email baru sebelum mengaktifkannya. Gunakan penguncian dan mekanisme pemulihan untuk kegagalan tulis Sheets/Drive.

Status: belum diuji di browser/backend live. Uji dua akun berbeda, akun admin, sesi berubah saat request, foto rusak/terlalu besar, pembatalan pilih foto, konflik versi, timeout dengan hasil simpan tidak pasti, role injection, email duplikat, dan persistensi foto setelah logout/login.
