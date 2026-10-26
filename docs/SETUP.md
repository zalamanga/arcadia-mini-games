# Setup demo lokal

Status: panduan berdasarkan source; instalasi dan runtime belum diuji pada checkpoint ini. Gunakan terminal privat untuk kredensial. Backend membaca environment proses, tidak memuat file `.env` lama.

## 1. Database baru dan initializer

Gunakan MySQL loopback dan nama database baru seperti `arcadia_demo_local`. Nama harus cocok dengan `^arcadia_demo_[a-z0-9_]{1,40}$`. Jangan menunjuk database historis. Initializer menolak database nonkosong, termasuk schema parsial, dan tidak mencoba reset otomatis.

Isi environment berikut dalam terminal initializer. Nilai password dan rate key di bawah merupakan placeholder yang harus diganti sendiri, bukan kredensial bawaan.

```powershell
$env:ARCADIA_DEMO_MODE = 'true'
$env:ARCADIA_DB_HOST = '127.0.0.1'
$env:ARCADIA_DB_PORT = '3306'
$env:ARCADIA_DB_NAME = 'arcadia_demo_local'
$env:ARCADIA_FRONTEND_ORIGIN = 'http://127.0.0.1:5173'
$env:ARCADIA_API_ORIGIN = 'http://127.0.0.1:8080'
$env:ARCADIA_INIT_USER = '<akun initializer privat>'
$env:ARCADIA_INIT_PASSWORD = '<password initializer privat>'
php backend/bin/init-demo.php --database=arcadia_demo_local --confirm-empty --admin-email=qa-admin@example.test
```

CLI membaca satu baris password admin sintetis melalui STDIN. Masukkan minimal delapan karakter dan maksimal 72 byte UTF-8. Input terminal biasa dapat terlihat di layar; jalankan pada terminal privat atau berikan STDIN melalui pengelola rahasia, tanpa meletakkan password pada argumen proses maupun file repo.

Initializer membuat 11 tabel dari [schema](../backend/schema.sql), katalog dari [games.json](../shared/games.json), enam milestone, satu `qa_admin`, dan penanda schema versi 1. Admin email dibatasi `@example.test`; pendaftaran HTTP biasa selalu membuat role `user`.

Jika proses gagal, pertahankan database parsial untuk diperiksa. Jangan mengulang dengan menghapus tabel atau memakai nama database pengguna lain. Inisialisasi demo baru merupakan tindakan terpisah yang eksplisit.

## 2. Akun database aplikasi

Pisahkan akun initializer dari akun aplikasi. Setelah schema siap, buat akun lokal khusus dengan password privat dan berikan hanya `SELECT, INSERT, UPDATE, DELETE` pada database demo tersebut. Aplikasi tidak memerlukan `CREATE`, `ALTER`, `DROP`, `GRANT`, atau akses database lain.

Contoh lingkup grant MySQL untuk nama di atas:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
ON `arcadia\_demo\_local`.* TO 'arcadia_app'@'127.0.0.1';
```

Underscore pada pola database grant di-escape agar lingkupnya tepat. Buat akun/password melalui administrasi MySQL lokal Anda terlebih dahulu. Contoh ini tidak mengubah akun yang sudah ada atau mencabut grant milik aplikasi lain. Periksa grant dan penolakan CREATE/DROP pada koneksi aplikasi baru sebelum menjalankan API.

Dalam terminal API, isi nilai umum langkah 1, kemudian:

```powershell
$env:ARCADIA_DB_USER = 'arcadia_app'
$env:ARCADIA_DB_PASSWORD = '<password aplikasi privat>'
$env:ARCADIA_RATE_KEY = '<nilai acak privat minimal32 byte>'
php -S 127.0.0.1:8080 -t backend/public
```

Jangan meneruskan `ARCADIA_INIT_USER`/`ARCADIA_INIT_PASSWORD` ke proses API. Konfigurasi aplikasi tidak memakai keduanya. Request biasa memeriksa penanda schema dan tidak membuat tabel/data awal.

Origin harus persis tanpa path atau trailing slash. Host/scheme frontend dan API harus sama agar cookie sesi dapat digunakan; port boleh berbeda. Gunakan alamat yang sama juga saat membuka browser. HTTPS mengaktifkan cookie `Secure`; cookie selalu `HttpOnly`, `SameSite=Lax`, berlaku delapan jam, dan token hanya disimpan sebagai hash dalam database.

## 3. Frontend

```powershell
Set-Location client
$env:VITE_API_URL = 'http://127.0.0.1:8080/index.php'
npm ci --ignore-scripts
npm run dev -- --port 5173 --strictPort
```

`VITE_API_URL` adalah alamat publik API demo, sehingga tidak boleh berisi password atau token. Ini merupakan konfigurasi build frontend. Konfigurasi backend tidak dibundel ke browser.

`npm run build` menghasilkan `client/dist`. `npm run preview -- --port 5173 --strictPort` hanya untuk melihat build lokal. Pertahankan `ARCADIA_FRONTEND_ORIGIN` sesuai port preview yang digunakan. Build, preview, dan dependency notices masih menunggu verifikasi exact-lock.

## Base path dan Apache

Base default adalah `/`. Untuk frontend pada `/arcadia/`, atur sebelum build:

```powershell
$env:ARCADIA_WEB_BASE = '/arcadia/'
$env:VITE_API_URL = 'http://127.0.0.1:8080/index.php'
npm run build
```

Helper route memakai base yang sama dari Vite. Base hanya menerima segmen huruf/angka/underscore/hyphen dengan slash akhir. Apache perlu fallback SPA dari [client/public/.htaccess](../client/public/.htaccess) dan `mod_rewrite` yang diizinkan pada lokasi frontend. Fallback ini tidak berlaku untuk PHP API.

Untuk PHP, document root harus menunjuk `backend/public`, sementara direktori `backend/src`, schema, dan `shared` tetap di luar web root dengan hubungan path repo yang utuh. Jangan mengekspos root repo atau menyalin `public` sendirian tanpa modul yang dirujuk. Konfigurasi vhost/fallback subfolder belum dijalankan pada checkpoint ini.

## Kapasitas yang disengaja

Maksimal 200 akun, 2.000 baris sesi, 20 sesi aktif per akun, masing-masing 20.000 skor/run/receipt, serta 2.000 bucket rate limit. Baris sesi kedaluwarsa tetap dihitung pada batas global. Tidak ada scheduler atau penghapusan riwayat otomatis.

Pendaftaran dibatasi lima percobaan per identitas per 15 menit dan 20 per alamat; login 10 per identitas dan 60 per alamat dalam jendela yang sama. Operasi skor baru dibatasi 30 per menit per akun; profil 15. Replay receipt terjadi sebelum batas dinamis operasi baru. Respons 429 memberi `Retry-After`; klien tidak otomatis mengulang POST.
