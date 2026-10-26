# API query-route

Entry point: `backend/public/index.php?route=<route>`. Seluruh respons JSON memakai `Cache-Control: no-store`. Kontrak di bawah berasal dari source; HTTP/MySQL aktual belum diuji pada checkpoint ini.

| Method | Route | Akses dan hasil |
|---|---|---|
| GET | `health` | Marker demo/schema, tanpa kredensial pada respons |
| POST | `auth/register` | `{username,email,password}`; 201 dan cookie sesi; role selalu user |
| POST | `auth/login` | `{identity,password}`; 200 dan cookie sesi baru |
| GET | `auth/me` | `{user:null}` hanya bila tidak ada sesi valid; kegagalan DB tetap error |
| POST | `auth/logout` | `{}`; cabut token yang dikirim, tanpa header penghapus cookie baru |
| GET | `games` | Katalog aktif, jumlah run, top score, label client-reported |
| GET | `games/<gameId>` | Detail game dan maksimal 10 pemain teratas |
| GET | `scores/<gameId>` | Maksimal 25 skor terbaik pemain untuk game itu |
| GET | `leaderboard/<gameId>` | Maksimal 25 peringkat game |
| GET | `leaderboard` | Maksimal 25 peringkat dari jumlah best-score per game |
| GET | `achievements` | Enam milestone; status akun bila sesi aktif |
| POST | `scores` | Sesi + actor + operation key; skor/run/milestone/receipt atomik |
| GET | `profile` | Sesi; akun, statistik, maksimal 20 run terbaru milik sendiri |
| PATCH | `profile` | Sesi + actor + operation key; username/avatar dengan expectedVersion |
| GET | `operations&operationKey=<uuid>` | Receipt operasi milik sesi sendiri, tanpa detail profil |
| GET | `admin/stats` | Sesi role admin; total akun/run/game dan skor hari UTC ini |

Parameter URL hanya `route`, ditambah `operationKey` khusus route `operations`. Parameter ganda, array, key tambahan, atau encoding rusak ditolak. ID game mengikuti [katalog](../shared/games.json), bukan ID skor numerik.

## Batas request dan actor

Host API harus cocok dengan konfigurasi loopback. Semua mutasi memerlukan origin frontend persis, `Content-Type: application/json`, dan `X-Arcadia-Intent: mutate-v1`. Cookie sendiri tidak cukup untuk melewati batas tersebut. CORS credentials hanya diberikan kepada origin yang dikonfigurasi.

Mutasi/logout dan operasi milik akun mengikat `X-Arcadia-Actor` ke ID yang ditangkap UI. Server memeriksa sesi hidup pada koneksi transaksi setelah common row guard diperoleh; header actor hanya pembanding, tidak memberi otoritas. Actor yang berbeda menghasilkan 409 tanpa menulis skor/profil akun baru.

Body harus berupa object JSON UTF-8 dengan field yang tepat, maksimal 32.768 byte aktual maupun declared length. Skor adalah integer finite 0 sampai 1.000.000.000; durasi integer milidetik 0 sampai 86.400.000; hasil salah satu `win`, `loss`, `draw`, `complete`. Nilai JSON whole seperti `2e0` dinormalisasi menjadi integer; string angka dan boolean ditolak. Semua respons dibatasi 1 MiB; klien membatasi streamed body dan seluruh permintaan menjadi 15 detik.

## Identitas operasi skor dan profil

Kirim `X-Arcadia-Operation` berupa UUID v4 lowercase. Pasangan user + key unik pada database. Intent yang di-hash adalah canonical JSON UTF-8:

```json
{"action":"score.submit","actorId":7,"data":{"duration":2500,"gameId":"snake","result":"complete","score":200}}
```

Key object diurutkan; username profil di-trim dan dibatasi ASCII; avatar salah satu `P1`, `P2`, `PX`, `AI`, `GG`, `XP`. Karena scalar intent ini tidak memuat teks Unicode bebas, tidak ada normalisasi Unicode implisit lintas PHP/JavaScript.

POST skor:

```json
{"gameId":"snake","score":200,"duration":2500,"result":"complete"}
```

Konfirmasi 201 hanya membawa metadata aman:

```json
{"actorId":7,"score":{"id":1,"gameId":"snake","score":200,"duration":2500,"result":"complete","createdAt":1000},"unlocked":["first-run"],"operationKey":"44b6d6f7-b680-4ae7-9588-31f9aaa1e864","replayed":false}
```

PATCH profil:

```json
{"username":"player_7","avatar":"XP","expectedVersion":1}
```

Konfirmasi 200 memuat `actorId`, `profileVersion`, `operationKey`, dan `replayed`; tidak menyimpan username/email dalam receipt. Versi profil meningkat pada simpan baru dan mencegah tab lama menimpa perubahan baru. Replay yang sudah committed diperiksa sebelum versi terkini, rate, atau kapasitas operasi baru. Key sama dengan intent berbeda menghasilkan 409 `intent_changed`.

GET receipt mengembalikan `{found:false,operationKey}` atau `{found:true,operationKey,action,status,response}`. `found:false` tidak membuktikan permintaan lama gagal; transaksi dapat belum selesai atau ACK belum sampai. Tidak ada retry otomatis maupun pembuatan key pengganti setelah hasil unknown.

## Transaksi dan error

Semua penulis memakai transaksi InnoDB dan row guard yang sama. Skor, run, milestone, dan receipt masuk satu commit. Profil + kenaikan versi + receipt juga satu commit. Konfirmasi tidak membutuhkan query leaderboard setelah commit.

Rollback yang terkonfirmasi mengembalikan kesalahan awal. Bila commit sudah dicoba atau rollback tidak dapat dipastikan, respons 503 membawa `outcomeUnknown:true`. PDO tidak persistent dan koneksi tidak dikembalikan ke pool. Periksa key sama sebelum retry. Register/login tidak memiliki durable receipt; pada ACK sesi yang hilang, UI wajib memeriksa `auth/me` sebelum mengirim password lagi. Cookie register/login yang tidak sampai memang tidak dapat dipulihkan melalui receipt; keterbatasan ini tidak dianggap login berhasil.

Error berbentuk `{error:{code,message},outcomeUnknown:boolean}`; rate limit juga memberi `Retry-After`. 401 berarti tidak ada sesi valid, 403 batas origin/role, 409 konflik actor/intent/versi/kapasitas, 422 input tidak valid, dan 503 layanan/marker/receipt belum dapat diperiksa. Tidak ada raw exception, password, cookie, ataupun nilai konfigurasi pada respons/log aplikasi.
