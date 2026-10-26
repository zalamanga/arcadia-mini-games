import { clamp, createButton, createElement, createHud, createStatus, makeCanvas } from "./engine.js";
import { snakeFood, snakeStep } from "./rules.js";

function canvasShell(ctx, width = 720, height = 460) {
  const shell = createElement("div", "game-shell canvas-shell");
  const canvas = makeCanvas(width, height);
  canvas.setAttribute("aria-label", ctx.title || "Arena permainan");
  const status = createStatus();
  ctx.mount.replaceChildren(shell);
  return { shell, canvas, status, pen: canvas.getContext("2d") };
}

function snake(ctx) {
  const { shell, canvas, status, pen } = canvasShell(ctx, 720, 480);
  const scoreNode = createElement("strong", "snake-score", "0");
  const hud = createHud([{ label: "Score", value: "", className: "score-slot" }, { label: "Speed", value: "Normal", className: "snake-speed" }]);
  hud.querySelector(".score-slot").replaceWith(scoreNode);
  const controls = createElement("div", "direction-pad");
  [["↑", "up"], ["←", "left"], ["↓", "down"], ["→", "right"]].forEach(([label, direction]) => {
    const button = createButton(label, `game-button dir-${direction}`); button.dataset.direction = direction; controls.append(button);
  });
  let body = [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }];
  let food = { x: 15, y: 8 }; let direction = { x: 1, y: 0 }; let queued = direction; let score = 0; let stopped = false;
  const columns = 24; const rows = 16; const cell = 30;
  ctx.start(); status.textContent = "Makan pixel. Jangan menyentuh dinding atau ekormu.";

  function setDirection(name) {
    const next = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[name];
    if (next && !(next.x === -direction.x && next.y === -direction.y)) queued = next;
  }
  function keydown(event) {
    const name = { ArrowUp: "up", w: "up", ArrowDown: "down", s: "down", ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right" }[event.key];
    if (name) { event.preventDefault(); setDirection(name); }
  }
  function placeFood() {
    food = snakeFood(body, columns, rows);
  }
  function draw() {
    pen.fillStyle = "#090d18"; pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.strokeStyle = "rgba(255,255,255,.035)";
    for (let x = 0; x <= columns; x += 1) { pen.beginPath(); pen.moveTo(x * cell, 0); pen.lineTo(x * cell, canvas.height); pen.stroke(); }
    for (let y = 0; y <= rows; y += 1) { pen.beginPath(); pen.moveTo(0, y * cell); pen.lineTo(canvas.width, y * cell); pen.stroke(); }
    if (food) { pen.fillStyle = "#ff6484"; pen.beginPath(); pen.arc(food.x * cell + 15, food.y * cell + 15, 9, 0, Math.PI * 2); pen.fill(); }
    body.forEach((part, index) => { pen.fillStyle = index ? "#71d941" : "#c8ff4d"; pen.fillRect(part.x * cell + 3, part.y * cell + 3, 24, 24); });
  }
  function tick() {
    if (stopped) return;
    direction = queued;
    const next = snakeStep(body, direction, food, columns, rows);
    if (next.collision) {
      stopped = true; status.textContent = `Game over — ${score.toLocaleString("id-ID")} poin.`; ctx.complete(score, "Snake run selesai", score ? "complete" : "loss"); return;
    }
    body = next.body;
    if (next.ate) { score += 100; scoreNode.textContent = String(score); ctx.setScore(score); placeFood(); }
    draw();
    if (next.full) { stopped = true; status.textContent = "Papan penuh. Kamu menang!"; ctx.complete(score, "Snake memenuhi seluruh papan", "win"); }
  }
  const onDirection = (event) => setDirection(event.target.dataset.direction);
  ctx.mount.addEventListener("keydown", keydown);
  controls.addEventListener("click", onDirection);
  shell.append(hud, canvas, controls, status); draw(); const timer = setInterval(tick, 125);
  return () => { stopped = true; clearInterval(timer); ctx.mount.removeEventListener("keydown", keydown); controls.removeEventListener("click", onDirection); };
}

function pong(ctx) {
  const { shell, canvas, status, pen } = canvasShell(ctx);
  const scoreNode = createElement("strong", "pong-score", "0 : 0");
  const hud = createHud([{ label: "Player : CPU", value: "", className: "score-slot" }, { label: "Target", value: "5", className: "" }]);
  hud.querySelector(".score-slot").replaceWith(scoreNode); shell.append(hud, canvas, status);
  let playerY = 190; let cpuY = 190; let player = 0; let cpu = 0; let ended = false; let last = performance.now();
  const ball = { x: 360, y: 230, vx: 285, vy: 150, r: 8 }; const paddle = { w: 12, h: 82 };
  ctx.start(); status.textContent = "Gerakkan pointer atau gunakan W/S. Pertama mencapai 5 menang.";
  function resetBall(towardPlayer) { ball.x = 360; ball.y = 230; ball.vx = (towardPlayer ? -1 : 1) * 285; ball.vy = (Math.random() - .5) * 260; }
  function keydown(event) { if (!["w", "s", "ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); if (["w", "ArrowUp"].includes(event.key)) playerY -= 38; else playerY += 38; playerY = clamp(playerY, 0, canvas.height - paddle.h); }
  function pointer(event) { const rect = canvas.getBoundingClientRect(); playerY = clamp((event.clientY - rect.top) / rect.height * canvas.height - paddle.h / 2, 0, canvas.height - paddle.h); }
  function update(dt) {
    ball.x += ball.vx * dt; ball.y += ball.vy * dt; cpuY += clamp(ball.y - (cpuY + paddle.h / 2), -235 * dt, 235 * dt); cpuY = clamp(cpuY, 0, canvas.height - paddle.h);
    if (ball.y < ball.r || ball.y > canvas.height - ball.r) { ball.y = clamp(ball.y, ball.r, canvas.height - ball.r); ball.vy *= -1; }
    const playerHit = ball.vx < 0 && ball.x - ball.r <= 34 && ball.x > 20 && ball.y >= playerY && ball.y <= playerY + paddle.h;
    const cpuHit = ball.vx > 0 && ball.x + ball.r >= canvas.width - 34 && ball.x < canvas.width - 20 && ball.y >= cpuY && ball.y <= cpuY + paddle.h;
    if (playerHit || cpuHit) { ball.vx *= -1.045; ball.vy += (ball.y - ((playerHit ? playerY : cpuY) + paddle.h / 2)) * 4; }
    if (ball.x < -20) { cpu += 1; resetBall(false); } else if (ball.x > canvas.width + 20) { player += 1; resetBall(true); }
    scoreNode.textContent = `${player} : ${cpu}`; ctx.setScore(player * 250);
    if (player >= 5 || cpu >= 5) { ended = true; const won = player > cpu; status.textContent = won ? "Match point milikmu!" : "CPU menang. Rematch?"; ctx.complete(player * 250 + (won ? 500 : 0), "Pong match selesai", won ? "win" : "loss"); }
  }
  function draw() {
    pen.fillStyle = "#090d18"; pen.fillRect(0, 0, canvas.width, canvas.height); pen.strokeStyle = "rgba(255,255,255,.18)"; pen.setLineDash([10, 12]); pen.beginPath(); pen.moveTo(360, 0); pen.lineTo(360, 460); pen.stroke(); pen.setLineDash([]);
    pen.fillStyle = "#c8ff4d"; pen.fillRect(22, playerY, paddle.w, paddle.h); pen.fillStyle = "#55e6ff"; pen.fillRect(canvas.width - 34, cpuY, paddle.w, paddle.h); pen.fillStyle = "#fff"; pen.beginPath(); pen.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); pen.fill();
  }
  function frame(now) { const dt = Math.min(.025, (now - last) / 1000); last = now; if (!ended) { update(dt); draw(); animation = requestAnimationFrame(frame); } }
  ctx.mount.addEventListener("keydown", keydown); canvas.addEventListener("pointermove", pointer); canvas.addEventListener("pointerdown", pointer); let animation = requestAnimationFrame(frame);
  return () => { ended = true; cancelAnimationFrame(animation); ctx.mount.removeEventListener("keydown", keydown); canvas.removeEventListener("pointermove", pointer); canvas.removeEventListener("pointerdown", pointer); };
}

function breakout(ctx) {
  const { shell, canvas, status, pen } = canvasShell(ctx);
  const scoreNode = createElement("strong", "breakout-score", "0"); const livesNode = createElement("strong", "breakout-lives", "3");
  const hud = createHud([{ label: "Score", value: "", className: "score-slot" }, { label: "Lives", value: "", className: "lives-slot" }]);
  hud.querySelector(".score-slot").replaceWith(scoreNode); hud.querySelector(".lives-slot").replaceWith(livesNode); shell.append(hud, canvas, status);
  const paddle = { x: 300, y: 424, w: 120, h: 12 }; const ball = { x: 360, y: 390, vx: 230, vy: -260, r: 8 };
  const bricks = []; for (let row = 0; row < 5; row += 1) for (let column = 0; column < 10; column += 1) bricks.push({ x: 17 + column * 69, y: 35 + row * 30, w: 62, h: 20, alive: true, color: ["#ff6484", "#ff9f55", "#ffcf55", "#55e6ff", "#9a7cff"][row] });
  let score = 0; let lives = 3; let ended = false; let last = performance.now(); ctx.start(); status.textContent = "Gerakkan paddle dengan pointer atau tombol kiri/kanan.";
  function reset() { ball.x = 360; ball.y = 390; ball.vx = (Math.random() > .5 ? 1 : -1) * 230; ball.vy = -260; }
  function move(event) { const rect = canvas.getBoundingClientRect(); paddle.x = clamp((event.clientX - rect.left) / rect.width * canvas.width - paddle.w / 2, 0, canvas.width - paddle.w); }
  function keydown(event) { if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); if (event.key === "ArrowLeft") paddle.x -= 42; else paddle.x += 42; paddle.x = clamp(paddle.x, 0, canvas.width - paddle.w); }
  function update(dt) {
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < ball.r || ball.x > canvas.width - ball.r) { ball.x = clamp(ball.x, ball.r, canvas.width - ball.r); ball.vx *= -1; }
    if (ball.y < ball.r) { ball.y = ball.r; ball.vy *= -1; }
    if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y < paddle.y + paddle.h && ball.x >= paddle.x && ball.x <= paddle.x + paddle.w) { ball.y = paddle.y - ball.r; ball.vy = -Math.abs(ball.vy); ball.vx += (ball.x - (paddle.x + paddle.w / 2)) * 3; }
    for (const brick of bricks) if (brick.alive && ball.x + ball.r > brick.x && ball.x - ball.r < brick.x + brick.w && ball.y + ball.r > brick.y && ball.y - ball.r < brick.y + brick.h) { brick.alive = false; ball.vy *= -1; score += 100; scoreNode.textContent = String(score); ctx.setScore(score); break; }
    if (ball.y > canvas.height + 20) { lives -= 1; livesNode.textContent = String(lives); if (lives <= 0) { ended = true; status.textContent = "Out of lives. Coba run baru."; ctx.complete(score, "Breakout run selesai", "loss"); } else reset(); }
    if (!bricks.some((brick) => brick.alive)) { ended = true; status.textContent = "Semua blok bersih!"; ctx.complete(score + lives * 500, "Breakout cleared", "win"); }
  }
  function draw() { pen.fillStyle = "#090d18"; pen.fillRect(0, 0, canvas.width, canvas.height); for (const brick of bricks) if (brick.alive) { pen.fillStyle = brick.color; pen.fillRect(brick.x, brick.y, brick.w, brick.h); } pen.fillStyle = "#c8ff4d"; pen.fillRect(paddle.x, paddle.y, paddle.w, paddle.h); pen.fillStyle = "#fff"; pen.beginPath(); pen.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); pen.fill(); }
  function frame(now) { const dt = Math.min(.025, (now - last) / 1000); last = now; if (!ended) { update(dt); draw(); animation = requestAnimationFrame(frame); } }
  canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerdown", move); ctx.mount.addEventListener("keydown", keydown); let animation = requestAnimationFrame(frame);
  return () => { ended = true; cancelAnimationFrame(animation); ctx.mount.removeEventListener("keydown", keydown); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerdown", move); };
}

export const arcadeGames = [
  { id: "snake", setup: snake },
  { id: "pong", setup: pong },
  { id: "breakout", setup: breakout },
];
