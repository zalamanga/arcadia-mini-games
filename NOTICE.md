# Asal sumber dan atribusi

Proyek ini dirapikan dari keluarga lokal **Arcadia** pada `sendiri/AUTOMASI/games`. Identitas Arcadia, metadata/glyph game, aturan 13 game aktif, dan struktur React/Vite + PHP/PDO dipertahankan. Modul game yang semula berada dalam `dist` merupakan source aktif yang diimpor aplikasi; modul tersebut dipindah ke `client/src/games` agar tidak bercampur dengan hasil build baru.

Sumber asal disimpan terpisah dan tidak diubah. Konfigurasi berisi kredensial, file environment lama, SQL seed/data historis, media pribadi, browser state, dependency terpasang, dan hasil build lama tidak dimasukkan. Keluarga lokal lain bernama `sendiri/games` tidak digabungkan.

Tidak ditemukan LICENSE atau atribusi upstream yang eksplisit dalam allowlist source asal yang diperiksa. Catatan ini tidak menetapkan pemilik baru dan tidak menyatakan seluruh source bebas lisensi. Belum ada lisensi baru untuk kode proyek ini. Jika sumber upstream atau pemilik hak diketahui, pertahankan atribusi dan tentukan izin sebelum distribusi lebih lanjut.

React, React DOM, Vite, plugin React, dan dependency transitif mengikuti lisensi paket masing-masing. Versi resolved pada lockfile asal dipertahankan; label `latest` pada root manifest diganti dengan versi exact yang sama. Exact-lock install dan build telah berhasil pada 27 Oktober 2026. Tidak ada aset visual baru yang dibuat. Dependency terpasang dan bundle hasil pemeriksaan tidak disertakan dalam ekspor source; lisensi paket tetap berlaku saat dependency dipasang. Catatan ini tidak menggantikan teks lisensi setiap dependency.
