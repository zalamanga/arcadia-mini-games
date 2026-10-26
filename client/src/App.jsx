import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { games, gameMap } from "./games/catalog.js";
import { AVATARS, profileIntent } from "./protocol.js";
import { appHref, appPath, gameSlug } from "./router.js";
import { OperationController } from "./operation-controller.js";
import { readLocalBest, writeLocalBest } from "./local-best.js";
import { useRead } from "./use-read.js";
import "./styles.css";
import "./games/styles.css";

const format = (value) => new Intl.NumberFormat("id-ID").format(value);
const EMPTY_OPERATION = Object.freeze({ phase: "idle", busy: false, record: null, receipt: null, message: "", hasIntent: false });
const emptySnapshot = () => EMPTY_OPERATION;
function storage(name) { try { return window[name]; } catch { return null; } }

function Link({ to, base, navigate, children, ...props }) {
  return <a {...props} href={appHref(to, base)} onClick={(event) => {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(to); }
  }}>{children}</a>;
}

function ReadState({ resource, retry, empty = "Belum ada data." }) {
  if (resource.status === "loading") return <p role="status">Memuat data server…</p>;
  if (resource.status === "error") return <div className="inline-error" role="alert"><p>{resource.message}</p><button onClick={retry}>Muat ulang data</button></div>;
  return <p className="muted">{empty}</p>;
}

function OperationPanel({ controller, state, base, navigate }) {
  if (!controller || state.phase === "idle") return state.message && !state.receipt ? <p className="wrap inline-error" role="alert">{state.message}</p> : null;
  const label = state.record?.action === "profile.update" ? "Perubahan profil" : "Hasil permainan";
  return <section className={`wrap recovery ${state.phase === "confirmed" ? "confirmed" : ""}`} aria-label="Pemulihan operasi">
    <h2>{state.phase === "confirmed" ? "Operasi sudah tersimpan" : label}</h2>
    <p role={state.phase === "blocked" ? "alert" : "status"}>{state.message}</p>
    {state.record?.action === "score.submit" && <p>{gameMap.get(state.record.intent.gameId)?.title}: {format(state.record.intent.score)} poin</p>}
    {state.record && <p className="operation-key">Kunci: <code>{state.record.operationKey}</code></p>}
    <div className="actions">
      {["unknown", "unsent"].includes(state.phase) && <><button disabled={state.busy} onClick={() => void controller.reconcile()}>Periksa status</button>
        {state.hasIntent ? <button disabled={state.busy} onClick={() => void controller.retry()}>{state.phase === "unsent" ? "Coba simpan dan kirim kunci yang sama" : "Kirim ulang isi dan kunci yang sama"}</button>
          : <Link base={base} navigate={navigate} to="/profile">Masukkan kembali perubahan profil</Link>}</>}
      {["confirmed", "rejected"].includes(state.phase) && <button onClick={() => controller.finishLocalCleanup()}>Ulangi pembersihan lokal</button>}
      {state.phase === "blocked" && <button onClick={() => controller.load()}>Periksa penyimpanan lagi</button>}
    </div>
  </section>;
}

export function App({ api, session, base }) {
  const account = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [route, setRoute] = useState(() => appPath(location.pathname, base));
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => { void session.refresh({ discover: true }); return () => session.close(); }, [session]);
  useEffect(() => {
    const pop = () => { setRoute(appPath(location.pathname, base)); setNotice(""); };
    window.addEventListener("popstate", pop); return () => window.removeEventListener("popstate", pop);
  }, [base]);
  const navigate = (next) => { const href = appHref(next, base); if (location.pathname !== href) history.pushState({}, "", href); setRoute(next); setNotice(""); window.scrollTo({ top: 0, behavior: "instant" }); };
  const onSaved = (action) => {
    setNotice(action === "score.submit" ? "Skor sudah tersimpan di server." : "Perubahan profil sudah tersimpan di server.");
    setVersion((current) => current + 1);
    if (action === "profile.update") void session.refresh();
  };
  return <>
    <a className="skip-link" href="#main">Lewati navigasi</a>
    <header className="wrap topbar"><Link className="brand" base={base} navigate={navigate} to="/"><span className="brand-icon" aria-hidden="true">A</span><span>ARCADIA<small>Mini arcade</small></span></Link>
      <nav aria-label="Navigasi utama"><Link base={base} navigate={navigate} to="/games">Game</Link><Link base={base} navigate={navigate} to="/leaderboard">Papan skor</Link><Link base={base} navigate={navigate} to="/achievements">Pencapaian</Link></nav>
      <div className="account-nav">{account.user ? <Link base={base} navigate={navigate} to="/profile">{account.user.avatar} {account.user.username}</Link> : <><Link base={base} navigate={navigate} to="/login">Masuk</Link><Link className="button small" base={base} navigate={navigate} to="/register">Daftar</Link></>}</div>
    </header>
    {["loading", "error", "auth-unknown"].includes(account.status) && <section className="wrap session-state"><p role={account.status === "loading" ? "status" : "alert"}>{account.message}</p>{account.status !== "loading" && <button disabled={account.busy} onClick={() => void session.refresh({ discover: true })}>Periksa sesi</button>}</section>}
    {notice && <div className="wrap notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Tutup pemberitahuan">×</button></div>}
    <AccountScope key={account.generation} api={api} session={session} account={account} base={base} route={route} navigate={navigate} notice={setNotice} version={version} reload={() => setVersion((current) => current + 1)} onSaved={onSaved} />
    <footer className="wrap footer"><span>Arcadia ·13 permainan browser</span><span>Skor papan peringkat berasal dari laporan klien.</span></footer>
  </>;
}

function AccountScope({ api, session, account, base, route, navigate, notice, version, reload, onSaved }) {
  const [controller] = useState(() => account.user ? new OperationController({ api, actorId: account.user.id, ids: new Set(gameMap.keys()), storage: storage("sessionStorage"), isCurrent: session.capture().isCurrent, onSaved }) : null);
  const subscribe = useCallback((listener) => controller ? controller.subscribe(listener) : () => {}, [controller]);
  const operation = useSyncExternalStore(subscribe, controller?.getSnapshot ?? emptySnapshot, controller?.getSnapshot ?? emptySnapshot);
  useEffect(() => () => controller?.invalidate(), [controller]);
  useEffect(() => {
    if (!controller || operation.phase === "idle") return undefined;
    const leave = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", leave); return () => window.removeEventListener("beforeunload", leave);
  }, [controller, operation.phase]);
  const links = { base, navigate };
  const requestKey = account.generation + ":" + version;
  let content;
  if (route === "/") content = <Home api={api} session={session} requestKey={requestKey} reload={reload} {...links} />;
  else if (route === "/games") content = <Library api={api} session={session} requestKey={requestKey} reload={reload} {...links} />;
  else if (route === "/leaderboard") content = <Leaderboard api={api} session={session} account={account} requestKey={requestKey} reload={reload} />;
  else if (route === "/achievements") content = <Achievements api={api} session={session} account={account} requestKey={requestKey} reload={reload} />;
  else if (route === "/profile") content = account.user ? <Profile api={api} session={session} account={account} controller={controller} operation={operation} requestKey={requestKey} reload={reload} /> : <Auth key="login" mode="login" session={session} account={account} {...links} />;
  else if (route === "/login" || route === "/register") content = <Auth key={route} mode={route.slice(1)} session={session} account={account} {...links} />;
  else {
    const game = gameMap.get(gameSlug(route));
    content = game ? <GamePage game={game} api={api} session={session} account={account} controller={controller} operation={operation} requestKey={requestKey} reload={reload} notice={notice} {...links} />
      : <section className="wrap section"><h1>Halaman tidak ditemukan</h1><p>Alamat game belum cocok atau encoding URL tidak valid.</p><Link {...links} to="/games">Kembali ke daftar game</Link></section>;
  }
  return <><OperationPanel controller={controller} state={operation} {...links} /><main id="main" tabIndex={-1}>{content}</main></>;
}

function GameCard({ game, stats, base, navigate }) {
  const best = readLocalBest(storage("localStorage"), game.id);
  return <article className="game-card" style={{ "--accent": game.accent }}><div className="card-visual"><b aria-hidden="true">{game.glyph}</b><span>{game.category}</span></div><div className="card-body"><p className="eyebrow">{game.difficulty}</p><h3>{game.title}</h3><p>{game.description}</p>
    <dl className="card-stats"><div><dt>Run server</dt><dd>{stats ? format(stats.plays) : "Belum dimuat"}</dd></div><div><dt>Terbaik lokal</dt><dd>{best.value === null ? best.available ? "Belum ada" : "Tidak tersedia" : format(best.value)}</dd></div></dl>
    <Link className="play-link" base={base} navigate={navigate} to={"/games/" + game.id}>Mainkan {game.title} →</Link></div></article>;
}

function useCatalog(api, session, key) { return useRead("catalog:" + key, (signal) => api.games({ ...session.capture(), signal })); }
function CatalogStatus({ resource, reload }) { return resource.status !== "ready" ? <ReadState resource={resource} retry={reload} empty="" /> : null; }
function Home({ api, session, requestKey, reload, base, navigate }) {
  const resource = useCatalog(api, session, requestKey), stats = new Map((resource.value ?? []).map((game) => [game.id, game]));
  return <><section className="wrap hero"><div><p className="eyebrow">Arcadia / Puzzle, Arcade, Skill</p><h1>Pilih game.<br /><em>Mulai satu run.</em></h1><p className="lede">Tiga belas permainan singkat untuk browser. Main sebagai tamu, atau masuk untuk menyimpan hasil ke papan skor demo.</p><div className="actions"><Link className="button primary" base={base} navigate={navigate} to="/games">Lihat13 game</Link><Link className="button" base={base} navigate={navigate} to="/leaderboard">Buka papan skor</Link></div></div><aside className="hero-console" aria-label="Isi arcade"><span className="console-label">Pilih tantanganmu</span><div className="glyph-row" aria-hidden="true"><b>XO</b><b>2ⁿ</b><b>RT</b></div><p>Puzzle7 · Arcade3 · Skill3</p><p className="muted">Skor tamu tetap di perangkat. Login tidak otomatis mengunggah skor lama.</p></aside></section>
    <section className="wrap section"><div className="section-title"><div><p className="eyebrow">Mulai dari sini</p><h2>Tiga pilihan untuk satu jeda</h2></div><Link base={base} navigate={navigate} to="/games">Semua permainan →</Link></div><CatalogStatus resource={resource} reload={reload} /><div className="game-grid">{["snake", "2048", "memory-cards"].map((id) => <GameCard key={id} game={gameMap.get(id)} stats={stats.get(id)} base={base} navigate={navigate} />)}</div></section></>;
}

function Library({ api, session, requestKey, reload, base, navigate }) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState("All");
  const resource = useCatalog(api, session, requestKey), stats = new Map((resource.value ?? []).map((game) => [game.id, game]));
  const filtered = games.filter((game) => (category === "All" || category === game.category) && (game.title + " " + game.description).toLocaleLowerCase("id").includes(query.toLocaleLowerCase("id")));
  return <section className="wrap section"><p className="eyebrow">Daftar permainan</p><h1>Game untuk browsermu</h1><p className="lede">Seluruh13 game bisa dimainkan tanpa akun. Penyimpanan online membutuhkan API lokal dan sesi yang sudah dikonfirmasi.</p><div className="filter-row"><label>Cari game<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nama atau deskripsi" /></label><div className="tabs" role="group" aria-label="Kategori game">{["All", "Puzzle", "Arcade", "Skill"].map((item) => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item === "All" ? "Semua" : item}</button>)}</div></div><p>{filtered.length} game ditampilkan</p><CatalogStatus resource={resource} reload={reload} /><div className="game-grid">{filtered.map((game) => <GameCard key={game.id} game={game} stats={stats.get(game.id)} base={base} navigate={navigate} />)}</div>{!filtered.length && <p className="empty-state">Tidak ada game yang cocok. Ubah kata pencarian atau kategori.</p>}</section>;
}

function LeaderRows({ rows, ownId }) {
  return <ol className="leader-list">{rows.map((row) => <li key={row.userId} className={row.userId === ownId ? "is-you" : ""}><span className="rank">{row.rank}</span><span className="player-name">{row.avatar} {row.username}{row.userId === ownId ? " (kamu)" : ""}</span><strong>{format(row.score)}<small> poin</small></strong></li>)}</ol>;
}

function Leaderboard({ api, session, account, requestKey, reload }) {
  const [selected, setSelected] = useState("all");
  const resource = useRead("leaders:" + selected + ":" + requestKey, (signal) => api.leaderboard(selected, { ...session.capture(), signal }));
  return <section className="wrap section"><p className="eyebrow">Hasil yang dilaporkan pemain</p><h1>Papan skor demo</h1><p className="lede">Skor dihitung di browser. Papan ini tidak memverifikasi permainan atau mencegah modifikasi klien. Peringkat global menjumlahkan skor terbaik setiap game.</p><label className="select-label">Game<select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="all">Semua game</option>{games.map((game) => <option value={game.id} key={game.id}>{game.title}</option>)}</select></label>
    {resource.status === "ready" && resource.value.length ? <LeaderRows rows={resource.value} ownId={account.user?.id} /> : <ReadState resource={resource} retry={reload} empty="Belum ada skor yang diterima server." />}</section>;
}

function GamePage({ game, api, session, account, controller, operation, requestKey, reload, notice, base, navigate }) {
  const [run, setRun] = useState(0);
  const leaders = useRead("game-leaders:" + game.id + ":" + requestKey, (signal) => api.leaderboard(game.id, { ...session.capture(), signal }));
  return <section className="wrap section game-page"><Link base={base} navigate={navigate} to="/games">← Daftar permainan</Link><p className="eyebrow">{game.category} / {game.difficulty}</p><h1>{game.title}</h1><p>{game.description}</p><div className="game-layout"><div><section className="game-frame" aria-label={game.title}><div className="frame-bar"><span>Arcadia / {game.id}</span><button onClick={() => setRun((current) => current + 1)}>Restart</button></div>
    <p className="board-hint">{game.controls} Papan yang lebar dapat digeser mendatar; fokus keyboard tetap di area permainan.</p><GameFrame key={game.id + ":" + run} game={game} session={session} account={account} controller={controller} operation={operation} notice={notice} /></section></div><aside className="leader-panel"><h2>Pemain teratas</h2><p className="muted">Skor demo dari laporan klien.</p>{leaders.status === "ready" && leaders.value.length ? <LeaderRows rows={leaders.value.slice(0, 8)} ownId={account.user?.id} /> : <ReadState resource={leaders} retry={reload} empty="Belum ada skor online untuk game ini." />}</aside></div></section>;
}

function GameFrame({ game, session, account, controller, notice }) {
  const mount = useRef(null);
  const [score, setScore] = useState(0), [online, setOnline] = useState("");
  const [best, setBest] = useState(() => readLocalBest(storage("localStorage"), game.id));
  useEffect(() => {
    const node = mount.current;
    if (!node) return undefined;
    let live = true, ended = false, startedAt = Date.now();
    const captured = session.capture();
    const cleanup = game.setup({ mount: node, title: game.title,
      start() { startedAt = Date.now(); },
      setScore(value) { if (live && Number.isSafeInteger(value) && value >= 0) setScore(value); },
      notice(message) { if (live) notice(message); },
      complete(value, message, result = "complete") {
        if (!live || ended) return; ended = true;
        if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) { notice("Hasil permainan belum valid untuk disimpan."); return; }
        setScore(value);
        const local = writeLocalBest(storage("localStorage"), game.id, value); setBest(local);
        const currentAccount = session.getSnapshot();
        if (!captured.isCurrent() || currentAccount.status !== "authenticated" || !controller || currentAccount.user?.id !== account.user?.id) {
          setOnline(local.available ? "Hasil tersimpan sebagai skor terbaik lokal. Tidak diunggah." : "Penyimpanan lokal tidak tersedia. Hasil belum disimpan."); return;
        }
        if (controller.getSnapshot().phase !== "idle") { setOnline("Hasil ini hanya lokal. Selesaikan operasi sebelumnya sebelum menyimpan hasil online lain."); return; }
        setOnline("Menyiapkan penyimpanan online.");
        void controller.begin("score.submit", { gameId: game.id, score: value, duration: Math.min(86400000, Math.max(0, Date.now() - startedAt)), result }).then((saved) => {
          if (live && captured.isCurrent()) setOnline(saved ? "Skor sudah tersimpan di server." : "Skor online belum dikonfirmasi. Periksa panel pemulihan.");
        }).catch(() => { if (live) setOnline("Skor belum dapat dikonfirmasi. Catatan operasi tidak diganti."); });
        if (!local.available) notice("Penyimpanan best lokal tidak tersedia. Konfirmasi server diperiksa terpisah.");
      },
    });
    if (!node.contains(document.activeElement)) node.focus({ preventScroll: true });
    return () => { live = false; ended = true; if (typeof cleanup === "function") cleanup(); node.replaceChildren(); };
  }, [game, session, controller, account.generation]);
  return <><div className="game-mount" ref={mount} tabIndex={0} role="region" aria-label={"Area bermain " + game.title + ", dapat digeser mendatar"} /><div className="score-strip"><span>Skor saat ini <strong>{format(score)}</strong></span><span>Terbaik lokal <strong>{best.value === null ? best.available ? "Belum ada" : "Tidak tersedia" : format(best.value)}</strong></span></div>{online && <p className="run-result" role="status">{online}</p>}</>;
}

function Auth({ mode, session, account, base, navigate }) {
  const register = mode === "register";
  if (account.user) return <section className="wrap section"><h1>Kamu sudah masuk</h1><p>Akun aktif: {account.user.username}.</p><Link base={base} navigate={navigate} to="/profile">Buka profil</Link></section>;
  const submit = async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const body = register ? { username: form.get("username"), email: form.get("email"), password: form.get("password") } : { identity: form.get("identity"), password: form.get("password") };
    if (await session.authenticate(register ? "register" : "login", body)) navigate("/");
  };
  return <section className="auth-card"><p className="eyebrow">Akun pemain</p><h1>{register ? "Daftar di Arcadia" : "Masuk ke Arcadia"}</h1><p className="muted">Akun menyimpan hasil ke server demo lokal. Email dipakai sebagai identitas akun dan belum diverifikasi oleh layanan.</p><form onSubmit={submit}><fieldset disabled={account.busy || account.status !== "guest"}>
    {register ? <><label>Username<input name="username" minLength={3} maxLength={20} pattern="[a-zA-Z0-9_-]+" required autoComplete="username" /></label><label>Email<input name="email" type="email" maxLength={120} required autoComplete="email" /></label></> : <label>Email atau username<input name="identity" maxLength={120} required autoComplete="username" /></label>}
    <label>Password<input name="password" type="password" minLength={8} maxLength={72} required autoComplete={register ? "new-password" : "current-password"} /></label><p className="muted">Minimal delapan karakter, maksimal72 byte UTF-8.</p><button className="primary" disabled={account.busy || account.status !== "guest"}>{account.busy ? "Memeriksa akun…" : register ? "Buat akun" : "Masuk"}</button></fieldset></form>
    {account.status === "guest" && account.message && <p role={account.busy ? "status" : "alert"}>{account.message}</p>}<p><Link base={base} navigate={navigate} to={register ? "/login" : "/register"}>{register ? "Sudah punya akun? Masuk" : "Belum punya akun? Daftar"}</Link></p></section>;
}

function Achievements({ api, session, account, requestKey, reload }) {
  const resource = useRead("achievements:" + requestKey, (signal) => api.achievements({ ...session.capture(), signal }));
  return <section className="wrap section"><p className="eyebrow">Perjalanan di arcade</p><h1>Pencapaian</h1><p className="lede">Enam milestone dihitung dari run yang sudah diterima server. Skor lokal tamu tidak dihitung di sini.</p>{resource.status !== "ready" ? <ReadState resource={resource} retry={reload} /> : <div className="achievement-grid">{resource.value.map((item) => <article key={item.id} className={item.unlocked ? "achievement unlocked" : "achievement"}><span className="achievement-mark" aria-hidden="true">{item.unlocked ? "✓" : "◇"}</span><h2>{item.name}</h2><p>{item.description}</p><p className="muted">{item.requirement}</p><strong>{item.unlocked ? "Terbuka" : "Belum terbuka"}</strong></article>)}</div>}{!account.user && <p>Masuk untuk memeriksa pencapaian akunmu.</p>}</section>;
}

function Profile({ api, session, account, controller, operation, requestKey, reload }) {
  const initial = controller.profileDraft() ?? { username: account.user.username, avatar: account.user.avatar, expectedVersion: account.user.version };
  const [draft, setDraft] = useState(initial), [message, setMessage] = useState("");
  const resource = useRead("profile:" + requestKey, (signal) => api.profile({ ...session.capture(), signal }));
  const pendingProfile = operation.record?.action === "profile.update";
  const reentry = pendingProfile && operation.phase === "unknown" && !operation.hasIntent;
  const locked = operation.busy || (pendingProfile && operation.hasIntent && operation.phase !== "idle");
  const save = async (event) => {
    event.preventDefault(); setMessage(""); const captured = session.capture();
    try {
      if (reentry) { await controller.reenterProfile({ username: draft.username, avatar: draft.avatar }); return; }
      const intent = profileIntent(draft); const saved = await controller.begin("profile.update", intent);
      if (saved && captured.isCurrent()) {
        const version = controller.getSnapshot().receipt?.profileVersion;
        setDraft((current) => current.username === intent.username && current.avatar === intent.avatar && current.expectedVersion === intent.expectedVersion ? { ...current, expectedVersion: version } : current);
        setMessage("Profil tersimpan. Statistik dan data server dimuat ulang.");
      }
    } catch { setMessage("Isi profil belum valid. Draft tetap ada dan belum dikirim."); }
  };
  const newer = resource.status === "ready" && resource.value.user.version !== draft.expectedVersion;
  return <section className="wrap section"><p className="eyebrow">Profil pemain</p><h1>{account.user.username}</h1><p>{account.user.email}</p><p className="muted">Email akun belum diverifikasi oleh layanan.</p>
    {resource.status === "ready" ? <dl className="metric-row"><Metric name="Run selesai" value={format(resource.value.stats.sessions)} /><Metric name="Game berbeda" value={format(resource.value.stats.gamesPlayed)} /><Metric name="Skor terbaik" value={format(resource.value.stats.bestScore)} /><Metric name="Waktu bermain" value={format(Math.round(resource.value.stats.totalDuration / 60000)) + " menit"} /></dl> : <ReadState resource={resource} retry={reload} />}
    <div className="profile-columns"><form className="profile-form" onSubmit={save}><h2>{reentry ? "Pulihkan perubahan awal" : "Edit profil"}</h2><fieldset disabled={locked}><label>Username<input value={draft.username} onChange={(event) => setDraft((current) => ({ ...current, username: event.target.value }))} minLength={3} maxLength={20} pattern="[a-zA-Z0-9_-]+" required autoComplete="username" /></label><label>Avatar<select value={draft.avatar} onChange={(event) => setDraft((current) => ({ ...current, avatar: event.target.value }))}>{AVATARS.map((avatar) => <option key={avatar}>{avatar}</option>)}</select></label>
      <button className="primary" disabled={locked || (!reentry && operation.phase !== "idle") || resource.status !== "ready"}>{reentry ? "Cocokkan dengan perubahan awal" : "Simpan profil"}</button></fieldset>
      {newer && <div className="inline-error"><p>Versi server berbeda dari draft ini. Draft tidak ditimpa otomatis.</p><button type="button" disabled={operation.phase !== "idle"} onClick={() => { setDraft({ username: resource.value.user.username, avatar: resource.value.user.avatar, expectedVersion: resource.value.user.version }); setMessage("Draft diganti dengan profil server yang baru dibaca."); }}>Gunakan profil terbaru</button></div>}
      {message && <p role="status">{message}</p>}<button type="button" disabled={account.busy || operation.busy} onClick={() => void session.logout()}>Keluar dari sesi ini</button></form>
      <section><h2>Run terbaru</h2><p className="muted">Maksimal20 run terakhir dari akun ini.</p>{resource.status === "ready" ? resource.value.history.length ? <ul className="history-list">{resource.value.history.map((item) => <li key={item.id}><div><strong>{item.gameName}</strong><span>{new Date(item.createdAt).toLocaleString("id-ID")} · {item.result}</span></div><strong>{format(item.score)} poin</strong></li>)}</ul> : <p>Belum ada run yang disimpan.</p> : <p>Riwayat belum dimuat.</p>}</section></div></section>;
}

function Metric({ name, value }) { return <div><dt>{name}</dt><dd>{value}</dd></div>; }
