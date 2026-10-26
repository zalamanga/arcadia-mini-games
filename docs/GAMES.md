# Permainan dan skor

Katalog aktif berjumlah **13 game**. Metadata berasal dari [shared/games.json](../shared/games.json); implementasi didaftarkan di [catalog.js](../client/src/games/catalog.js). Fungsi Simon tidak masuk export game aktif.

| Game | Kontrol dan akhir run | Skor akhir dari source |
|---|---|---|
| Tic-Tac-Toe | Klik/tap sel atau Tab + Enter/Space. Pemain X melawan CPU; tunggu giliran CPU. | Menang 100, seri 25, kalah 0. |
| Connect Four | Pilih sel pada kolom tujuan; chip jatuh ke ruang terbawah. CPU bergerak setelah pemain. | Menang 150, seri 35, kalah 0. |
| 2048 | Fokuskan area bermain lalu gunakan panah, atau tombol arah. Game berlanjut setelah tile 2048; run selesai saat tidak ada langkah. | Jumlah nilai hasil merge, ditambah bonus 2048 sekali bila milestone tercapai. |
| Minesweeper | Papan 9×9 dengan 10 ranjau. Klik pertama aman; mode bendera atau klik kanan menandai sel. Klik normal pada sel berbendera tidak membuka ranjau. | Menang `max(100, 1500 - detik × 12)`, kalah 0. |
| Sliding Puzzle | Klik ubin yang bertetangga dengan ruang kosong hingga urut 1 sampai 15. Shuffle berasal dari langkah legal. | `max(100, 1800 - langkah × 10)`. |
| Memory Cards | Temukan delapan pasangan. Dua kartu yang salah ditutup setelah jeda. | `max(100, 1400 - percobaan pasangan × 35)`. |
| Lights Out | Klik lampu untuk mengubah lampu itu dan empat tetangga langsung. Matikan seluruh papan 5×5. | `max(100, 1100 - langkah × 22)`. |
| Snake | Fokuskan area bermain: panah/WASD atau tombol arah. Makanan menambah panjang; dinding/badan mengakhiri run. Papan penuh menjadi kemenangan. | 100 per makanan. |
| Pong | Pointer/sentuhan atau W/S/panah atas-bawah. Pemain melawan CPU, target lima poin. | Poin pemain × 250, ditambah 500 bila menang. |
| Breakout | Pointer/sentuhan atau panah kiri-kanan. Hancurkan 50 blok, pertahankan tiga nyawa. | 100 per blok, ditambah sisa nyawa × 500 bila semua blok habis. |
| Reaction Timer | Aktifkan tombol saat arena hijau; false start mengulang putaran tanpa menambah hasil. Lima reaksi menyelesaikan run. | `max(50, 1500 - rata-rata ms × 3)`. |
| Aim Trainer | Klik/tap 20 target. Target juga merupakan tombol yang dapat difokuskan dan diaktifkan dengan keyboard. | `max(100, round(20000 - total ms))`. |
| Typing Race | Ketik kalimat lokal persis pada textarea. Waktu dimulai saat karakter pertama. | WPM × 10 + akurasi persen × 5. |

Formula tersebut adalah aturan demo yang dipertahankan dari sumber, bukan pengukuran kemampuan yang terverifikasi. Durasi API berasal dari waktu run browser. Papan skor tidak membedakan metode input; misalnya Aim Trainer dengan keyboard tidak menjadi kompetisi pointer yang setara.

## Restart, fokus, dan penyimpanan

Restart melepas listener, timer, dan frame milik run sebelum memasang game baru. Berpindah halaman juga melepas run tersebut. Tombol panah hanya ditangani ketika fokus berada di area game, sehingga form/halaman lain tidak memakai kontrol game lama.

Completion mengirim satu hasil akhir. Milestone 2048 hanya memberi pemberitahuan dan tidak menutup run; hasil akhir baru disimpan setelah langkah habis. Satu pending giliran CPU mencegah dua klik pemain selama CPU menunggu. Snake membedakan ekor yang akan lepas dari tubuh yang tetap terisi dan memilih makanan dari daftar petak kosong.

Best lokal diperiksa terpisah dari konfirmasi online. Riwayat game online berasal dari run yang diterima server. Menekan Restart sebelum completion tidak membuat run selesai palsu. Jika ada operasi sebelumnya yang belum dikonfirmasi, game berikutnya tetap bisa dimainkan tetapi hasil barunya hanya lokal.

## Aksesibilitas dan batas yang perlu diuji

Game sel menggunakan button dan label; canvas menyediakan label arena serta alternatif kontrol pointer/keyboard pada game yang mendukungnya. Canvas tetap bersifat visual dan tidak memiliki representasi gameplay lengkap bagi screen reader. Skor/status dan petunjuk ditampilkan sebagai teks.

Grid padat mempertahankan ukuran target minimum 2,75 rem. Pada viewport sempit atau teks besar, area game menyediakan scroll mendatar yang diberi label dan bisa difokuskan. Halaman/recovery/form tetap dirancang reflow. Perilaku keyboard, scroll board, kontras, 320/390/640/1280 px, dan teks 200% masih menunggu pengujian browser aktual; source CSS bukan bukti bahwa semuanya sudah lolos.
