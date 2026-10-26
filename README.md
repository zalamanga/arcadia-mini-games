# Arcadia Mini Games

Arcadia berisi **13 permainan browser**: tujuh puzzle, tiga arcade, dan tiga permainan keterampilan. Main sebagai tamu untuk menyimpan skor terbaik di perangkat, atau gunakan akun pada API demo lokal untuk mencatat run, pencapaian, dan papan skor.

Frontend memakai React + Vite. Backend memakai PHP native, PDO, dan MySQL. Perhitungan skor terjadi di browser; papan skor menampilkan hasil yang dilaporkan klien dan tidak memverifikasi permainan.

**Pemeriksaan 27 Oktober 2026:** instalasi exact-lock, 44 tes Node, 12 tes unit PHP, syntax 14 berkas PHP, dan build frontend berhasil. MySQL, HTTP, interaksi browser, dan screenshot aktual belum diverifikasi. Lihat [cakupan pemeriksaan](docs/VERIFICATION.md).

## Yang bisa dilakukan

- Cari game berdasarkan nama atau kategori, mainkan seluruh game sebagai tamu, lalu restart tanpa meninggalkan halaman.
- Baca skor terbaik lokal. Jika penyimpanan browser ditolak atau rusak, aplikasi memberi tahu bahwa hasil lokal belum tersimpan.
- Daftar, masuk, ubah username/avatar, dan keluar dari sesi demo. Email akun belum diverifikasi.
- Lihat papan skor per game, peringkat global, enam pencapaian, statistik akun, dan maksimal 20 run terbaru.
- Periksa hasil pengiriman yang belum pasti. Retry skor/profil memakai isi dan kunci operasi yang sama; konfirmasi server tidak berubah menjadi gagal hanya karena pembersihan catatan lokal belum berhasil.

| Puzzle | Arcade | Skill |
|---|---|---|
| Tic-Tac-Toe, Connect Four, 2048, Minesweeper, Sliding Puzzle, Memory Cards, Lights Out | Snake, Pong, Breakout | Reaction Timer, Aim Trainer, Typing Race |

Aturan, kontrol, dan perhitungan skor ada di [daftar game](docs/GAMES.md). Simon merupakan fungsi eksperimen yang tidak terdaftar; jumlah game aktif tetap 13.

## Menjalankan demo lokal

Panduan berikut adalah konfigurasi sumber yang perlu diuji, bukan laporan instalasi yang sudah berhasil. Gunakan database demo baru; aplikasi ini tidak memigrasikan database lama.

Kebutuhan: Node sesuai `client/package.json` (`^20.19.0` atau `>=22.12.0`), PHP 8.3+ dengan PDO MySQL, serta MySQL 8.4. Versi frontend mengikuti lockfile asal: React/React DOM 19.3.0, Vite 8.3.2, dan plugin React 6.1.1. Tidak ada Composer dependency.

1. Ikuti [setup database dan environment](docs/SETUP.md). Initializer CLI membuat katalog 13 game, enam pencapaian, dan satu admin sintetis pada database kosong yang ditandai.
2. Setelah environment backend terisi, jalankan dari root proyek:

   ```powershell
   php -S 127.0.0.1:8080 -t backend/public
   ```

3. Pada terminal frontend:

   ```powershell
   Set-Location client
   $env:VITE_API_URL = 'http://127.0.0.1:8080/index.php'
   npm ci --ignore-scripts
   npm run dev -- --port 5173 --strictPort
   ```

4. Buka `http://127.0.0.1:5173`. Gunakan hostname dan scheme yang sama pada frontend/API. `localhost` dan `127.0.0.1` bukan nama host yang dapat dicampur untuk sesi ini.

Jika API belum tersedia, game masih dapat dimainkan sebagai tamu setelah konfigurasi frontend valid. Statistik online menampilkan kesalahan baca; aplikasi tidak menggantinya dengan angka nol yang terlihat seperti hasil server.

Untuk build frontend, gunakan `npm run build` di `client`. Hasilnya berada di `client/dist`. Opsi base path Apache dijelaskan di [SETUP](docs/SETUP.md#base-path-dan-apache); refresh subfolder tetap menunggu pembuktian browser.

## Skor, akun, dan pemulihan

Skor tamu tidak otomatis diunggah ketika login. Hanya penyelesaian run pada sesi akun yang sudah dikonfirmasi yang membuat operasi online baru. Jika operasi sebelumnya belum selesai dipulihkan, run berikutnya tetap lokal.

Papan skor per game memakai skor terbaik setiap pemain. Peringkat global menjumlahkan skor terbaik per game, sehingga tidak menjumlahkan seluruh percobaan. Skor, durasi, dan hasil divalidasi berdasarkan tipe dan batas, tetapi klien yang dimodifikasi masih dapat mengirim nilai buatan.

Saat balasan hilang, panel pemulihan menawarkan **Periksa status** atau pengiriman ulang dengan isi dan kunci yang sama. Catatan yang belum ditemukan bukan bukti bahwa penyimpanan gagal. Untuk perubahan profil setelah reload, masukkan kembali username/avatar yang sama; metadata hanya menyimpan hash dan versi awal, bukan teks profil atau password. Konfirmasi yang sudah diketahui cukup dipulihkan secara lokal tanpa POST lagi.

Metadata operasi berada di `sessionStorage` per akun. Menutup tab dapat menghilangkan metadata ini. Jika penyimpanan tidak dapat dibaca/ditulis, pengiriman baru diblokir; tidak ada klaim bahwa pemulihan tahan terhadap hilangnya seluruh data browser atau bahwa dua tab berbagi satu run secara otomatis.

## Struktur dan pengujian

| Lokasi | Tanggung jawab |
|---|---|
| `client/src/App.jsx` | Halaman, form akun, profil, dan pemilik run game |
| `client/src/games/` | Modul asli game yang dipindah dari sumber aktif `dist` |
| `client/src/operation-controller.js` | Identitas pengiriman, unknown/reconcile/retry, dan cleanup lokal |
| `backend/public/index.php` | Entry point API query-route |
| `backend/src/` | Batas request, sesi, transaksi, receipt, skor, dan pembacaan |
| `backend/bin/init-demo.php` | Inisialisasi demo kosong secara eksplisit |
| `shared/games.json` | Metadata 13 game untuk frontend dan initializer |

Perintah yang disediakan:

```powershell
# Unit aturan game, transport, storage, sesi, dan pemulihan; dari client
npm test

# Unit PHP tanpa database; dari root proyek
php backend/tests/unit.php
```

Test native memerlukan database QA sintetis terpisah dan persetujuan namespace yang eksplisit. Lihat [status dan cakupan verifikasi](docs/VERIFICATION.md); jangan menjalankannya pada data pengguna. Instalasi, tes unit, dan build di atas sudah berhasil dijalankan; suite native MySQL belum dijalankan.

Dokumentasi lanjutan: [alur kode](docs/CODE_FLOW.md), [API](docs/API.md), [kontrol game](docs/GAMES.md), dan [asal sumber](NOTICE.md).

## Batas demo

Backend sengaja dibatasi ke loopback dan database bernama `arcadia_demo_*`. Tidak ada email/OTP/reset-password, multiplayer, admin dashboard React, upload media, analitik, atau provider eksternal. Endpoint `admin/stats` tetap tersedia bagi admin yang dibuat CLI. Riwayat dan receipt memiliki batas kapasitas tanpa penghapusan otomatis; ketika penuh, operasi baru ditolak dengan penjelasan.

Screenshot README akan ditambahkan setelah UI final benar-benar dijalankan dan diperiksa. Tidak ada mockup yang disajikan sebagai screenshot aplikasi.
