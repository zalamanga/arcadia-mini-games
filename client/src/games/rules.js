export function createTurnGate(schedule = setTimeout, cancel = clearTimeout) {
  let timer = null;
  let stopped = false;
  return {
    get pending() { return timer !== null; },
    get stopped() { return stopped; },
    queue(action, delay) {
      if (stopped || timer !== null) return false;
      timer = schedule(() => { timer = null; if (!stopped) action(); }, delay);
      return true;
    },
    stop() { stopped = true; if (timer !== null) cancel(timer); timer = null; },
  };
}

export function snakeStep(body, direction, food, columns, rows) {
  const head = { x: body[0].x + direction.x, y: body[0].y + direction.y };
  const ate = food !== null && head.x === food.x && head.y === food.y;
  const occupied = ate ? body : body.slice(0, -1);
  const collision = head.x < 0 || head.x >= columns || head.y < 0 || head.y >= rows
    || occupied.some((part) => part.x === head.x && part.y === head.y);
  if (collision) return { body, collision: true, ate: false, full: false };
  const next = [head, ...body];
  if (!ate) next.pop();
  return { body: next, collision: false, ate, full: next.length === columns * rows };
}

export function snakeFood(body, columns, rows, random = Math.random) {
  const occupied = new Set(body.map((part) => part.y * columns + part.x));
  const empty = [];
  for (let index = 0; index < columns * rows; index++) if (!occupied.has(index)) empty.push(index);
  if (!empty.length) return null;
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("RNG di luar rentang.");
  const chosen = empty[Math.floor(value * empty.length)];
  return { x: chosen % columns, y: Math.floor(chosen / columns) };
}

export function mineNeighbors(index, side) {
  const result = [], row = Math.floor(index / side), column = index % side;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const r = row + dr, c = column + dc;
    if ((dr || dc) && r >= 0 && r < side && c >= 0 && c < side) result.push(r * side + c);
  }
  return result;
}

export function revealMineCells(board, index, side) {
  if (!board[index] || board[index].flagged || board[index].revealed) return { changed: false, hit: false, won: false };
  const pending = [index];
  let hit = false;
  while (pending.length) {
    const current = pending.pop(), cell = board[current];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.mine) { hit = true; continue; }
    if (cell.count === 0) pending.push(...mineNeighbors(current, side));
  }
  return { changed: true, hit, won: !hit && board.every((cell) => cell.mine || cell.revealed) };
}

export function crossIndexes(index, side) {
  const row = Math.floor(index / side), column = index % side;
  return [[row, column], [row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]]
    .filter(([r, c]) => r >= 0 && r < side && c >= 0 && c < side)
    .map(([r, c]) => r * side + c);
}
