import {
  checkLineWinner,
  createButton,
  createElement,
  createHud,
  createStatus,
  randomInt,
  shuffle,
  slide2048Line,
} from "./engine.js";
import { createTurnGate, crossIndexes, mineNeighbors, revealMineCells } from "./rules.js";

function baseShell(mount, statusText) {
  const shell = createElement("div", "game-shell");
  const status = createStatus(statusText);
  mount.replaceChildren(shell);
  return { shell, status };
}

function ticTacToe(ctx) {
  const { shell, status } = baseShell(ctx.mount, "Giliranmu — kamu X.");
  const boardElement = createElement("div", "cell-grid ttt-grid");
  const board = Array(9).fill("");
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  let over = false;
  const turn = createTurnGate();
  ctx.start();

  const cells = board.map((_, index) => {
    const cell = createButton("", "ttt-cell");
    cell.setAttribute("aria-label", `Kotak ${index + 1}`);
    cell.addEventListener("click", () => playerMove(index));
    boardElement.append(cell);
    return cell;
  });

  function render() {
    cells.forEach((cell, index) => {
      cell.textContent = board[index];
      cell.disabled = over || turn.pending || Boolean(board[index]);
    });
  }

  function finishIfNeeded() {
    const winner = checkLineWinner(board, lines);
    if (winner) {
      over = true;
      const won = winner === "X";
      status.textContent = won ? "Kamu menang! Garis yang bersih." : "Rival digital menang. Coba rematch.";
      ctx.complete(won ? 100 : 0, won ? "Tic-Tac-Toe selesai" : "Match selesai", won ? "win" : "loss");
      render();
      return true;
    }
    if (board.every(Boolean)) {
      over = true;
      status.textContent = "Seri. Tidak ada ruang tersisa.";
      ctx.complete(25, "Pertandingan seri", "draw");
      render();
      return true;
    }
    return false;
  }

  function findMove(mark) {
    for (const line of lines) {
      const values = line.map((index) => board[index]);
      if (values.filter((value) => value === mark).length === 2 && values.includes("")) {
        return line[values.indexOf("")];
      }
    }
    return -1;
  }

  function cpuMove() {
    if (over) return;
    const open = board.map((value, index) => value ? -1 : index).filter((index) => index >= 0);
    const move = findMove("O") >= 0
      ? findMove("O")
      : findMove("X") >= 0
        ? findMove("X")
        : !board[4]
          ? 4
          : open[Math.floor(Math.random() * open.length)];
    board[move] = "O";
    render();
    if (!finishIfNeeded()) status.textContent = "Giliranmu — pilih kotak kosong.";
  }

  function playerMove(index) {
    if (over || turn.pending || turn.stopped || board[index]) return;
    board[index] = "X";
    render();
    if (finishIfNeeded()) return;
    status.textContent = "Rival sedang berpikir…";
    turn.queue(cpuMove, 350);
    render();
  }

  shell.append(boardElement, status);
  render();
  return () => { over = true; turn.stop(); };
}

function connectFour(ctx) {
  const { shell, status } = baseShell(ctx.mount, "Jatuhkan chip cyan. Empat berurutan untuk menang.");
  const grid = createElement("div", "connect-grid");
  const board = Array(42).fill("");
  let over = false;
  const turn = createTurnGate();
  ctx.start();

  const cells = board.map((_, index) => {
    const cell = createButton("", "connect-cell");
    cell.setAttribute("aria-label", `Kolom ${(index % 7) + 1}, baris ${Math.floor(index / 7) + 1}`);
    cell.addEventListener("click", () => drop(index % 7, "P"));
    grid.append(cell);
    return cell;
  });

  function landingIndex(column) {
    for (let row = 5; row >= 0; row -= 1) {
      const index = row * 7 + column;
      if (!board[index]) return index;
    }
    return -1;
  }

  function winner(mark) {
    const directions = [[0,1],[1,0],[1,1],[1,-1]];
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        if (board[row * 7 + column] !== mark) continue;
        for (const [dr, dc] of directions) {
          let matched = 1;
          for (let step = 1; step < 4; step += 1) {
            const nextRow = row + dr * step;
            const nextColumn = column + dc * step;
            if (nextRow >= 0 && nextRow < 6 && nextColumn >= 0 && nextColumn < 7 && board[nextRow * 7 + nextColumn] === mark) matched += 1;
          }
          if (matched === 4) return true;
        }
      }
    }
    return false;
  }

  function render() {
    cells.forEach((cell, index) => {
      cell.className = `connect-cell${board[index] === "P" ? " red" : board[index] === "C" ? " yellow" : ""}`;
      cell.disabled = over || turn.pending;
    });
  }

  function finish(mark) {
    if (winner(mark)) {
      over = true;
      const won = mark === "P";
      status.textContent = won ? "Empat terhubung — kamu menang!" : "Rival mendapat empat lebih dulu.";
      ctx.complete(won ? 150 : 0, won ? "Connect Four selesai" : "Match selesai", won ? "win" : "loss");
      render();
      return true;
    }
    if (board.every(Boolean)) {
      over = true;
      status.textContent = "Papan penuh. Pertandingan seri.";
      ctx.complete(35, "Pertandingan seri", "draw");
      render();
      return true;
    }
    return false;
  }

  function cpuMove() {
    if (over || turn.stopped) return;
    const columns = Array.from({ length: 7 }, (_, column) => column).filter((column) => landingIndex(column) >= 0);
    const centerWeighted = columns.flatMap((column) => column === 3 ? [column, column, column] : [column]);
    const column = centerWeighted[Math.floor(Math.random() * centerWeighted.length)];
    board[landingIndex(column)] = "C";
    render();
    if (!finish("C")) status.textContent = "Giliranmu — pilih kolom.";
  }

  function drop(column, mark) {
    if (over || turn.pending || turn.stopped || mark !== "P") return;
    const index = landingIndex(column);
    if (index < 0) return;
    board[index] = mark;
    render();
    if (finish(mark)) return;
    status.textContent = "Rival menjatuhkan chip…";
    turn.queue(cpuMove, 380);
    render();
  }

  shell.append(grid, status);
  render();
  return () => { over = true; turn.stop(); };
}

function game2048(ctx) {
  const { shell, status } = baseShell(ctx.mount, "Gabungkan angka yang sama. Target: 2048.");
  const scoreValue = createElement("strong", "score-value", "0");
  const hud = createHud([{ label: "Score", value: "", className: "score-slot" }]);
  hud.querySelector(".score-slot").replaceWith(scoreValue);
  const gridElement = createElement("div", "grid-2048");
  const controls = createElement("div", "touch-controls");
  let board = Array(16).fill(0);
  let score = 0;
  let achieved = false;
  let over = false;
  ctx.start();

  for (const [direction, label] of [["up","↑"],["left","←"],["down","↓"],["right","→"]]) {
    const button = createButton(label, "");
    button.dataset.dir = direction;
    button.setAttribute("aria-label", direction);
    button.addEventListener("click", () => move(direction));
    controls.append(button);
  }

  function addTile() {
    const empty = board.map((value, index) => value ? -1 : index).filter((index) => index >= 0);
    if (!empty.length) return;
    board[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
  }

  function linesFor(direction) {
    const lines = [];
    for (let outer = 0; outer < 4; outer += 1) {
      const line = [];
      for (let inner = 0; inner < 4; inner += 1) {
        const row = ["left", "right"].includes(direction) ? outer : inner;
        const column = ["left", "right"].includes(direction) ? inner : outer;
        line.push(row * 4 + column);
      }
      if (["right", "down"].includes(direction)) line.reverse();
      lines.push(line);
    }
    return lines;
  }

  function canMove() {
    if (board.includes(0)) return true;
    return board.some((value, index) => {
      const row = Math.floor(index / 4);
      const column = index % 4;
      return (column < 3 && board[index + 1] === value) || (row < 3 && board[index + 4] === value);
    });
  }

  function move(direction) {
    if (over) return;
    const before = board.join(",");
    for (const indexes of linesFor(direction)) {
      const result = slide2048Line(indexes.map((index) => board[index]));
      result.line.forEach((value, offset) => { board[indexes[offset]] = value; });
      score += result.score;
    }
    if (board.join(",") !== before) addTile();
    render();
    ctx.setScore(score);
    if (!achieved && board.some((value) => value >= 2048)) {
      achieved = true;
      status.textContent = "2048 tercapai! Kamu boleh lanjut bermain.";
      ctx.notice?.("2048 tercapai. Hasil akhir disimpan ketika langkah habis, termasuk bonus 2048.");
    }
    if (!canMove()) {
      over = true;
      const finalScore = score + (achieved ? 2048 : 0);
      status.textContent = `Tidak ada langkah tersisa. Skor akhir ${finalScore.toLocaleString("id-ID")}.`;
      ctx.complete(finalScore, "Run 2048 selesai", achieved ? "win" : "complete");
    }
  }

  function render() {
    gridElement.replaceChildren(...board.map((value) => {
      const tile = createElement("div", "tile-2048", value || "");
      if (value) tile.dataset.value = String(value);
      return tile;
    }));
    scoreValue.textContent = score.toLocaleString("id-ID");
  }

  function onKey(event) {
    const direction = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[event.key];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  }

  addTile(); addTile(); render();
  ctx.mount.addEventListener("keydown", onKey);
  shell.append(hud, gridElement, controls, status);
  return () => { over = true; ctx.mount.removeEventListener("keydown", onKey); };
}

function minesweeper(ctx) {
  const { shell, status } = baseShell(ctx.mount, "Buka semua kotak aman. Aktifkan mode bendera untuk menandai ranjau.");
  const grid = createElement("div", "mine-grid");
  const hud = createHud([{ label: "Mines", value: "10", className: "mine-count" }, { label: "Time", value: "0s", className: "mine-time" }]);
  const flagButton = createButton("⚑ Mode bendera: OFF", "game-button alt");
  const board = Array.from({ length: 81 }, () => ({ mine: false, revealed: false, flagged: false, count: 0 }));
  let initialized = false;
  let flagMode = false;
  let over = false;
  let elapsed = 0;
  const timer = setInterval(() => {
    if (initialized && !over) {
      elapsed += 1;
      hud.querySelector(".mine-time").textContent = `${elapsed}s`;
    }
  }, 1000);
  ctx.start();

  const cells = board.map((_, index) => {
    const cell = createButton("", "mine-cell");
    cell.addEventListener("click", () => act(index));
    cell.setAttribute("aria-label", `Kotak ${index + 1}, tertutup`);
    cell.addEventListener("contextmenu", (event) => { event.preventDefault(); toggleFlag(index); });
    grid.append(cell);
    return cell;
  });

  flagButton.addEventListener("click", () => {
    flagMode = !flagMode;
    flagButton.textContent = `⚑ Mode bendera: ${flagMode ? "ON" : "OFF"}`;
  });

  function initialize(safeIndex) {
    const candidates = shuffle(Array.from({ length: 81 }, (_, index) => index).filter((index) => index !== safeIndex));
    candidates.slice(0, 10).forEach((index) => { board[index].mine = true; });
    for (let index = 0; index < 81; index += 1) {
      const row = Math.floor(index / 9);
      const column = index % 9;
      board[index].count = neighbors(row, column).filter((neighbor) => board[neighbor].mine).length;
    }
    initialized = true;
  }

  function neighbors(row, column) {
    return mineNeighbors(row * 9 + column, 9);
  }

  function toggleFlag(index) {
    if (over || board[index].revealed) return;
    board[index].flagged = !board[index].flagged;
    render();
  }

  function act(index) {
    if (over) return;
    if (flagMode) { toggleFlag(index); return; }
    if (board[index].flagged || board[index].revealed) return;
    if (!initialized) initialize(index);
    const result = revealMineCells(board, index, 9);
    if (result.hit) {
      over = true;
      board.forEach((cell) => { if (cell.mine) cell.revealed = true; });
      status.textContent = "Boom. Ranjau ditemukan — coba pola baru.";
      ctx.complete(0, "Ranjau meledak", "loss");
    } else if (result.won) {
      over = true;
      const score = Math.max(100, 1500 - elapsed * 12);
      status.textContent = `Lapang bersih dalam ${elapsed} detik.`;
      ctx.complete(score, "Minefield selesai", "win");
    }
    render();
  }

  function render() {
    let flags = 0;
    cells.forEach((element, index) => {
      const cell = board[index];
      element.className = `mine-cell${cell.revealed ? " revealed" : ""}${cell.mine && cell.revealed ? " mine" : ""}`;
      element.textContent = cell.flagged ? "⚑" : cell.revealed ? cell.mine ? "✹" : cell.count || "" : "";
      element.setAttribute("aria-label", `Kotak ${index + 1}, ${cell.flagged ? "bendera" : cell.revealed ? cell.mine ? "ranjau" : `${cell.count} ranjau di sekitar` : "tertutup"}`);
      element.disabled = over || cell.revealed;
      if (cell.flagged) flags += 1;
    });
    hud.querySelector(".mine-count").textContent = String(Math.max(0, 10 - flags));
  }

  render();
  shell.append(hud, grid, flagButton, status);
  return () => { over = true; clearInterval(timer); };
}

function slidingPuzzle(ctx) {
  const { shell, status } = baseShell(ctx.mount, "Geser ubin ke ruang kosong hingga urut 1–15.");
  const grid = createElement("div", "slide-grid");
  const movesValue = createElement("strong", "moves-value", "0");
  const hud = createHud([{ label: "Moves", value: "", className: "moves-slot" }]);
  hud.querySelector(".moves-slot").replaceWith(movesValue);
  let board = Array.from({ length: 16 }, (_, index) => (index + 1) % 16);
  let moves = 0;
  let solved = false;
  ctx.start();

  function adjacent(index, blank) {
    const row = Math.floor(index / 4);
    const column = index % 4;
    const blankRow = Math.floor(blank / 4);
    const blankColumn = blank % 4;
    return Math.abs(row - blankRow) + Math.abs(column - blankColumn) === 1;
  }

  function swap(index, countMove = true) {
    const blank = board.indexOf(0);
    if (!adjacent(index, blank)) return;
    [board[index], board[blank]] = [board[blank], board[index]];
    if (countMove) moves += 1;
  }

  function render() {
    grid.replaceChildren(...board.map((value, index) => {
      const tile = createButton(value ? String(value) : "", `slide-tile${value ? "" : " empty"}`);
      tile.addEventListener("click", () => {
        if (solved) return;
        swap(index);
        render();
        if (board.every((value, position) => value === (position + 1) % 16)) {
          solved = true;
          const score = Math.max(100, 1800 - moves * 10);
          status.textContent = `Puzzle selesai dalam ${moves} langkah.`;
          ctx.complete(score, "Sliding Puzzle selesai", "win");
        }
      });
      return tile;
    }));
    movesValue.textContent = String(moves);
  }

  let previousBlank = -1;
  for (let turn = 0; turn < 260; turn += 1) {
    const blank = board.indexOf(0);
    const options = board.map((_, index) => index).filter((index) => adjacent(index, blank) && index !== previousBlank);
    const target = options[Math.floor(Math.random() * options.length)];
    previousBlank = blank;
    swap(target, false);
  }
  if (board.every((value, index) => value === (index + 1) % 16)) swap(14, false);
  render();
  shell.append(hud, grid, status);
  return () => { solved = true; };
}

function memoryCards(ctx) {
  const { shell, status } = baseShell(ctx.mount, "Temukan delapan pasangan simbol.");
  const grid = createElement("div", "memory-grid");
  const movesValue = createElement("strong", "memory-moves", "0");
  const hud = createHud([{ label: "Moves", value: "", className: "memory-slot" }, { label: "Pairs", value: "0/8", className: "pair-count" }]);
  hud.querySelector(".memory-slot").replaceWith(movesValue);
  const symbols = shuffle(["◆","●","▲","✦","☀","☂","♥","♣","◆","●","▲","✦","☀","☂","♥","♣"]);
  const open = [];
  const matched = new Set();
  let locked = false;
  let moves = 0;
  let closeTimer;
  ctx.start();

  const cards = symbols.map((symbol, index) => {
    const card = createButton("?", "memory-card");
    card.setAttribute("aria-label", `Kartu ${index + 1}`);
    card.addEventListener("click", () => flip(index));
    grid.append(card);
    return card;
  });

  function flip(index) {
    if (locked || matched.has(index) || open.includes(index)) return;
    open.push(index);
    render();
    if (open.length < 2) return;
    moves += 1;
    if (symbols[open[0]] === symbols[open[1]]) {
      open.forEach((item) => matched.add(item));
      open.length = 0;
      if (matched.size === 16) {
        const score = Math.max(100, 1400 - moves * 35);
        status.textContent = `Semua pasangan ditemukan dalam ${moves} langkah.`;
        ctx.complete(score, "Memory selesai", "win");
      }
      render();
    } else {
      locked = true;
      closeTimer = setTimeout(() => {
        open.length = 0;
        locked = false;
        render();
      }, 650);
    }
  }

  function render() {
    cards.forEach((card, index) => {
      const visible = open.includes(index) || matched.has(index);
      card.textContent = visible ? symbols[index] : "?";
      card.className = `memory-card${open.includes(index) ? " open" : ""}${matched.has(index) ? " matched" : ""}`;
    });
    movesValue.textContent = String(moves);
    hud.querySelector(".pair-count").textContent = `${matched.size / 2}/8`;
  }

  render();
  shell.append(hud, grid, status);
  return () => { locked = true; clearTimeout(closeTimer); };
}

function lightsOut(ctx) {
  const { shell, status } = baseShell(ctx.mount, "Matikan semua lampu. Satu klik juga mengubah tetangganya.");
  const grid = createElement("div", "light-grid");
  const movesValue = createElement("strong", "light-moves", "0");
  const hud = createHud([{ label: "Moves", value: "", className: "light-slot" }, { label: "Lights", value: "0", className: "lights-left" }]);
  hud.querySelector(".light-slot").replaceWith(movesValue);
  const board = Array(25).fill(false);
  let moves = 0;
  let over = false;
  ctx.start();

  function affected(index) {
    return crossIndexes(index, 5);
  }

  function toggle(index, count = true) {
    affected(index).forEach((target) => { board[target] = !board[target]; });
    if (count) moves += 1;
  }

  const cells = board.map((_, index) => {
    const cell = createButton("", "light-cell");
    cell.setAttribute("aria-label", `Lampu ${index + 1}`);
    cell.addEventListener("click", () => {
      if (over) return;
      toggle(index);
      render();
      if (board.every((value) => !value)) {
        over = true;
        const score = Math.max(100, 1100 - moves * 22);
        status.textContent = `Gelap total dalam ${moves} langkah.`;
        ctx.complete(score, "Lights Out selesai", "win");
      }
    });
    grid.append(cell);
    return cell;
  });

  function render() {
    cells.forEach((cell, index) => { cell.classList.toggle("on", board[index]); cell.setAttribute("aria-pressed", String(board[index])); cell.disabled = over; });
    movesValue.textContent = String(moves);
    hud.querySelector(".lights-left").textContent = String(board.filter(Boolean).length);
  }

  shuffle(Array.from({ length: 25 }, (_, index) => index)).slice(0, 12).forEach((index) => toggle(index, false));
  if (board.every((value) => !value)) toggle(12, false);
  render();
  shell.append(hud, grid, status);
  return () => { over = true; };
}

function simonSays(ctx) {
  const { shell, status } = baseShell(ctx.mount, "Ikuti urutan lampu.");
  const pad = createElement("div", "simon-pad");
  const colors = [
    { id: "green", label: "Hijau", color: "#71d941" },
    { id: "red", label: "Merah", color: "#ff6484" },
    { id: "yellow", label: "Kuning", color: "#ffcf55" },
    { id: "blue", label: "Biru", color: "#55e6ff" },
  ];
  const buttons = colors.map(({ id, label, color }) => {
    const button = createButton(label, `simon-button simon-${id}`);
    button.setAttribute("aria-label", label);
    button.style.setProperty("--simon-color", color);
    pad.append(button);
    return button;
  });
  const startButton = createButton("Mulai", "game-button simon-start");
  let sequence = [];
  let inputIndex = 0;
  let score = 0;
  let phase = "ready";
  let timers = [];
  const maxRounds = 12;
  ctx.start();
  status.textContent = "Hafalkan urutan lampu, lalu ulangi dengan menekan warnanya.";

  function later(callback, delay) {
    const timer = setTimeout(callback, delay);
    timers.push(timer);
  }

  function flash(index) {
    const button = buttons[index];
    button.classList.add("active");
    later(() => button.classList.remove("active"), 330);
  }

  function playSequence(position = 0) {
    phase = "showing";
    if (position >= sequence.length) {
      phase = "input";
      inputIndex = 0;
      status.textContent = `Giliranmu — ulangi ${sequence.length} warna.`;
      return;
    }
    later(() => {
      flash(sequence[position]);
      later(() => playSequence(position + 1), 520);
    }, 220);
  }

  function nextRound() {
    if (sequence.length >= maxRounds) {
      phase = "done";
      status.textContent = `Urutan lengkap! Skor akhir ${score.toLocaleString("id-ID")} poin.`;
      ctx.complete(score, "Simon Says selesai", "win");
      startButton.textContent = "Main lagi";
      return;
    }
    sequence.push(randomInt(0, colors.length - 1));
    status.textContent = `Babak ${sequence.length} dari ${maxRounds} — perhatikan urutannya.`;
    playSequence();
  }

  function begin() {
    timers.forEach(clearTimeout);
    timers = [];
    sequence = [];
    score = 0;
    phase = "ready";
    startButton.disabled = true;
    startButton.textContent = "Perhatikan...";
    later(() => {
      startButton.disabled = false;
      startButton.textContent = "Lihat urutan";
      nextRound();
    }, 350);
  }

  buttons.forEach((button, index) => button.addEventListener("click", () => {
    if (phase !== "input") return;
    flash(index);
    if (sequence[inputIndex] !== index) {
      phase = "done";
      status.textContent = `Belum tepat — kamu menyelesaikan ${sequence.length - 1} babak.`;
      ctx.complete(score, "Urutan Simon terhenti", score ? "complete" : "loss");
      startButton.disabled = false;
      startButton.textContent = "Coba lagi";
      return;
    }
    inputIndex += 1;
    if (inputIndex === sequence.length) {
      score = sequence.length * 100;
      ctx.setScore(score);
      startButton.disabled = false;
      startButton.textContent = "Lanjutkan";
      status.textContent = `Benar! ${sequence.length} babak — tekan lanjutkan.`;
      phase = "between";
    }
  }));
  startButton.addEventListener("click", () => {
    if (phase === "ready" || phase === "done") begin();
    else if (phase === "between") {
      startButton.disabled = true;
      startButton.textContent = "Perhatikan...";
      nextRound();
    }
  });
  shell.append(pad, startButton, status);
  return () => timers.forEach(clearTimeout);
}

export const puzzleGames = [
  { id: "tic-tac-toe", setup: ticTacToe },
  { id: "connect-four", setup: connectFour },
  { id: "2048", setup: game2048 },
  { id: "minesweeper", setup: minesweeper },
  { id: "sliding-puzzle", setup: slidingPuzzle },
  { id: "memory-cards", setup: memoryCards },
  { id: "lights-out", setup: lightsOut },
];
