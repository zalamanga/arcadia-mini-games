import { createButton, createElement, createHud, createStatus, randomInt } from "./engine.js";

function shellFor(ctx, className = "") { const shell = createElement("div", `game-shell ${className}`); const status = createStatus(); ctx.mount.replaceChildren(shell); return { shell, status }; }

function reactionTimer(ctx) {
  const { shell, status } = shellFor(ctx, "reaction-game"); const arena = createButton("MULAI", "reaction-arena idle"); const best = createElement("strong", "reaction-best", "—");
  const hud = createHud([{ label: "Best", value: "", className: "best-slot" }, { label: "Rounds", value: "0/5", className: "reaction-rounds" }]); hud.querySelector(".best-slot").replaceWith(best);
  let phase = "idle"; let round = 0; let startedAt = 0; let times = []; let timer; ctx.start(); status.textContent = "Klik mulai, lalu tunggu arena berubah hijau.";
  function prepare() { phase = "wait"; arena.className = "reaction-arena wait"; arena.textContent = "TUNGGU..."; timer = setTimeout(() => { phase = "go"; startedAt = performance.now(); arena.className = "reaction-arena go"; arena.textContent = "KLIK!"; }, randomInt(900, 2600)); }
  function press() {
    if (phase === "idle") return prepare();
    if (phase === "wait") { clearTimeout(timer); phase = "idle"; arena.className = "reaction-arena false-start"; arena.textContent = "TERLALU CEPAT"; status.textContent = "False start. Klik untuk coba lagi."; return; }
    if (phase === "go") { const time = Math.round(performance.now() - startedAt); times.push(time); round += 1; best.textContent = `${Math.min(...times)} ms`; hud.querySelector(".reaction-rounds").textContent = `${round}/5`; ctx.setScore(Math.max(0, 1000 - time)); if (round >= 5) { phase = "done"; const average = Math.round(times.reduce((sum, value) => sum + value, 0) / times.length); const score = Math.max(50, 1500 - average * 3); arena.className = "reaction-arena done"; arena.textContent = `${average} MS`; status.textContent = `Rata-rata ${average} ms.`; ctx.complete(score, "Reaction test selesai"); } else { phase = "idle"; arena.className = "reaction-arena idle"; arena.textContent = `${time} MS — LAGI`; } }
  }
  arena.addEventListener("click", press); shell.append(hud, arena, status); return () => clearTimeout(timer);
}

function aimTrainer(ctx) {
  const { shell, status } = shellFor(ctx, "aim-game"); const arena = createElement("div", "aim-arena"); const target = createButton("", "aim-target"); const timeNode = createElement("strong", "aim-time", "0.00s"); const hitsNode = createElement("strong", "aim-hits", "0/20");
  const hud = createHud([{ label: "Time", value: "", className: "time-slot" }, { label: "Targets", value: "", className: "hits-slot" }]); hud.querySelector(".time-slot").replaceWith(timeNode); hud.querySelector(".hits-slot").replaceWith(hitsNode);
  let hits = 0; let startedAt; let animation; let over = false; ctx.start(); status.textContent = "Klik dua puluh target secepat mungkin.";
  function moveTarget() { target.style.left = `${randomInt(5, 88)}%`; target.style.top = `${randomInt(8, 80)}%`; }
  function frame() { if (over) return; if (startedAt) timeNode.textContent = `${((performance.now() - startedAt) / 1000).toFixed(2)}s`; animation = requestAnimationFrame(frame); }
  function hit() { if (over) return; if (!startedAt) startedAt = performance.now(); hits += 1; hitsNode.textContent = `${hits}/20`; if (hits >= 20) { over = true; const elapsed = performance.now() - startedAt; timeNode.textContent = `${(elapsed / 1000).toFixed(2)}s`; cancelAnimationFrame(animation); const score = Math.max(100, Math.round(20000 - elapsed)); target.hidden = true; status.textContent = `Selesai dalam ${(elapsed / 1000).toFixed(2)} detik.`; ctx.complete(score, "Aim challenge selesai"); } else { ctx.setScore(hits * 100); moveTarget(); } }
  target.setAttribute("aria-label", "Target berikutnya"); target.addEventListener("click", hit);
  arena.append(target); shell.append(hud, arena, status); moveTarget(); animation = requestAnimationFrame(frame); return () => { over = true; cancelAnimationFrame(animation); target.removeEventListener("click", hit); };
}

function typingRace(ctx) {
  const { shell, status } = shellFor(ctx, "typing-game");
  const phrases = ["kode yang rapi mudah dirawat", "fullstack berarti memahami aliran data", "latihan konsisten mengalahkan motivasi sesaat", "antarmuka cepat tetap harus mudah digunakan", "pengujian kecil mencegah bug besar"];
  const phrase = phrases[randomInt(0, phrases.length - 1)]; const quote = createElement("div", "typing-quote");
  [...phrase].forEach((character) => quote.append(createElement("span", "", character)));
  const input = createElement("textarea", "typing-input"); input.rows = 3; input.placeholder = "Ketik kalimat di atas..."; input.setAttribute("aria-label", "Area mengetik");
  const wpmNode = createElement("strong", "typing-wpm", "0"); const accuracyNode = createElement("strong", "typing-accuracy", "100%");
  const hud = createHud([{ label: "WPM", value: "", className: "wpm-slot" }, { label: "Accuracy", value: "", className: "accuracy-slot" }]); hud.querySelector(".wpm-slot").replaceWith(wpmNode); hud.querySelector(".accuracy-slot").replaceWith(accuracyNode);
  let startedAt; let done = false; ctx.start(); status.textContent = "Ketik persis seperti teks. Timer dimulai pada karakter pertama.";
  input.addEventListener("input", () => { if (done) return; if (!startedAt) startedAt = performance.now(); const value = input.value.slice(0, phrase.length); input.value = value; let correct = 0; [...quote.children].forEach((span, index) => { span.className = index >= value.length ? "" : value[index] === phrase[index] ? "correct" : "wrong"; if (value[index] === phrase[index]) correct += 1; }); const minutes = Math.max((performance.now() - startedAt) / 60000, 1 / 600); const wpm = Math.round((correct / 5) / minutes); const accuracy = value.length ? Math.round(correct / value.length * 100) : 100; wpmNode.textContent = String(wpm); accuracyNode.textContent = `${accuracy}%`; ctx.setScore(wpm * accuracy); if (value === phrase) { done = true; input.disabled = true; const score = wpm * 10 + accuracy * 5; status.textContent = `${wpm} WPM dengan ${accuracy}% akurasi.`; ctx.complete(score, "Typing race selesai"); } });
  shell.append(hud, quote, input, status); input.focus({ preventScroll: true }); return () => { done = true; };
}

export const skillGames = [
  { id: "reaction-timer", setup: reactionTimer },
  { id: "aim-trainer", setup: aimTrainer },
  { id: "typing-race", setup: typingRace },
];
