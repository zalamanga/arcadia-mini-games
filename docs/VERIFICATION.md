# Status verifikasi

Pemeriksaan source 27 Oktober 2026 menggunakan Node.js 22.14.0, npm 10.9.2, dan PHP CLI 8.5.12:

| Pemeriksaan | Hasil |
| --- | --- |
| `npm ci --ignore-scripts` di `client` | Berhasil dengan lockfile yang disertakan |
| `npm test` | 44 PASS, 0 gagal |
| `npm run build` | Berhasil, Vite 8.3.2 |
| `php -l` untuk seluruh PHP | 14 berkas valid |
| `php backend/tests/unit.php` | 12 PASS, 0 gagal |

Dependency terpasang dan hasil build digunakan hanya untuk pemeriksaan, lalu dikeluarkan dari ekspor source. Tes unit transaksi memakai fake PDO, bukan koneksi MySQL. Suite native, API HTTP, seluruh interaksi game di browser, akses keyboard, ukuran layar, dan screenshot belum dijalankan.

| Source test | Deklarasi | Cakupan source |
|---|---:|---|
| `client/tests/game-rules.test.js` | 10 | Katalog, turn gate, merge 2048, winner, Snake tail/full, Mines flag/flood, Lights Out |
| `client/tests/transport.test.js` | 7 | Malformed auth/200, byte limit, UTF-8, deadline, actor switch, parent abort |
| `client/tests/storage.test.js` | 8 | Denied/corrupt/silent storage, safe metadata, confirmed downgrade, cleanup acknowledgement |
| `client/tests/operations.test.js` | 13 | Lost ACK, exact receipt, missing status, same-key retry, profile hash reentry, stale actor, confirmed local cleanup |
| `client/tests/session-router.test.js` | 6 | Stale auth GET, unknown login, error versus logout, captured logout, base/encoding |
| `backend/tests/unit.php` | 12 | Strict inputs/query/canonical receipt dan injected transaction commit/rollback outcomes |
| `backend/tests/native.php` | 9 | Fresh synthetic registration/actor/CSRF, replay/CAS, real PDO rollback/ACK fault, independent reads, logout |

Jumlah pada tabel adalah deklarasi per berkas; hasil eksekusi unit ada di tabel pemeriksaan di atas. Baris native belum dijalankan. Test transaction PHP unit memakai fake PDO; test native menggunakan PDO MySQL nyata dan adapter fault yang hanya ada pada file test. Tidak ada request/env fault switch pada produksi.

## Perintah setelah namespace QA siap

```powershell
# Frontend; tidak memerlukan backend untuk pure tests
Set-Location client
npm ci --ignore-scripts
npm test
npm run build
```

```powershell
# Dari root; unit tidak memakai database
php backend/tests/unit.php

# Native hanya pada database QA baru berisi identitas sintetis
$env:ARCADIA_NATIVE_TESTS = 'true'
$env:ARCADIA_TEST_CONFIRM_DATABASE = 'arcadia_demo_qa_<idunik>'
php backend/tests/native.php
```

Native juga memerlukan environment backend lengkap, marker ready, database bernama `arcadia_demo_qa_*`, seluruh email `@example.test`, dan API loopback hidup pada origin yang sesuai. File test menolak konfigurasi lain. Fixture miliknya dipertahankan untuk diperiksa; tidak ada penghapusan database otomatis. Pengelola QA bertanggung jawab menutup proses dan menghapus hanya namespace yang secara eksplisit dimiliki.

## Pemeriksaan lanjutan

- Syntax PHP, exact-lock install, pure tests, dan build frontend sudah berhasil. Native MySQL, HTTP, dan browser masih memerlukan lingkungan QA terpisah.
- Jalankan suite native pada database QA baru. Tambahkan pembuktian native concurrent duplicate key, queued actor setelah logout/session change, TTL, batas rate/cap/replay pada kapasitas penuh, tie-order leaderboard, dan DML-only database account. Test native awal di atas belum mengklaim semua skenario tersebut.
- Browser actual: mount/play/restart/leave seluruh 13 game; terminal/outcome per kelompok, klik cepat saat CPU menunggu, Mines first-safe/flag, shuffle tidak selesai, memory timer, 2048 milestone lalu final, seluruh listener/timer/frame bersih.
- Form akun/profil, stale GET/account switch, denied/corrupt storage, lost-response receipt, exact same-key retry/reentry, confirmed cleanup fault, module-abort/reload, dan sesi API unavailable. Gunakan data sintetis dan tanpa request provider eksternal.
- Keyboard/focus, reduced motion, target/label, serta viewport 320/390/640/1280 px dan teks 200%. Ukur keterbacaan/nonoverlap dan akses seluruh board, bukan hanya document scrollWidth. Aim target dan grid padat perlu pemeriksaan khusus pada teks besar.
- Tangkap PNG dari UI final yang benar-benar dijalankan. Beri caption demo sintetis dan ikat SHA ke source/bundle final. Jangan mengganti PNG dengan mockup atau menghapus error UI lewat manipulasi DOM.

Belum ada `docs/images` atau link screenshot kosong. Belum ada klaim PASS untuk native atau browser; hasil unit dan build tidak membuktikan kedua lapisan tersebut.
