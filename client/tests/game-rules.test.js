import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTurnGate, crossIndexes, mineNeighbors, revealMineCells, snakeFood, snakeStep } from "../src/games/rules.js";
import { slide2048Line, checkLineWinner } from "../src/games/engine.js";

test("catalog retains exactly thirteen unique games and the original category counts", async () => {
  const games = JSON.parse(await readFile(new URL("../../shared/games.json", import.meta.url), "utf8"));
  assert.equal(games.length, 13);
  assert.equal(new Set(games.map((game) => game.id)).size, 13);
  assert.deepEqual(["Puzzle", "Arcade", "Skill"].map((category) => games.filter((game) => game.category === category).length), [7, 3, 3]);
  assert.equal(games.some((game) => game.id === "simon-says"), false);
});

test("one pending opponent turn rejects another timer and cleanup invalidates a queued callback", () => {
  const tasks = new Map(), cancelled = [];
  let next = 0, moves = 0;
  const gate = createTurnGate((callback) => { const id = ++next; tasks.set(id, callback); return id; }, (id) => cancelled.push(id));
  assert.equal(gate.queue(() => moves++, 350), true);
  assert.equal(gate.pending, true);
  assert.equal(gate.queue(() => moves++, 350), false);
  gate.stop();
  tasks.get(1)();
  assert.equal(moves, 0); assert.deepEqual(cancelled, [1]); assert.equal(gate.pending, false);
  assert.equal(gate.queue(() => moves++, 350), false);
});

test("opponent callback observes its turn released before it renders the next player turn", () => {
  let callback, pendingDuringCpu;
  const gate = createTurnGate((fn) => { callback = fn; return 1; }, () => {});
  gate.queue(() => { pendingDuringCpu = gate.pending; }, 350);
  callback();
  assert.equal(pendingDuringCpu, false); assert.equal(gate.stopped, false);
});

test("2048 merges each input tile once and awards only the merged values", () => {
  assert.deepEqual(slide2048Line([2, 2, 2, 2]), { line: [4, 4, 0, 0], score: 8 });
  assert.deepEqual(slide2048Line([4, 0, 4, 4]), { line: [8, 4, 0, 0], score: 8 });
  assert.deepEqual(slide2048Line([0, 0, 0, 0]), { line: [0, 0, 0, 0], score: 0 });
  assert.deepEqual(slide2048Line([2, 4, 8, 16]), { line: [2, 4, 8, 16], score: 0 });
});

test("winner detection recognizes a diagonal and leaves incomplete or empty lines undecided", () => {
  const lines = [[0, 1, 2], [0, 4, 8]];
  assert.equal(checkLineWinner(["X", "", "", "", "X", "", "", "", "X"], lines), "X");
  assert.equal(checkLineWinner(["X", "O", "", "", "", "", "", "", ""], lines), null);
  assert.equal(checkLineWinner(Array(9).fill(""), lines), null);
});

test("Snake may enter the tail cell that vacates during a non-growing step", () => {
  const body = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 }];
  const next = snakeStep(body, { x: -1, y: 0 }, { x: 2, y: 0 }, 3, 2);
  assert.equal(next.collision, false); assert.equal(next.ate, false); assert.equal(next.body.length, 4);
  assert.deepEqual(next.body[0], { x: 0, y: 0 }); assert.deepEqual(body[0], { x: 1, y: 0 });
});

test("Snake collision, final growth and finite full-board food selection are distinct", () => {
  const body = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
  assert.equal(snakeStep(body, { x: -1, y: 0 }, { x: 1, y: 0 }, 2, 2).collision, true);
  const last = snakeStep(body, { x: 1, y: 0 }, { x: 1, y: 0 }, 2, 2);
  assert.equal(last.ate, true); assert.equal(last.full, true); assert.equal(last.body.length, 4);
  assert.equal(snakeFood(last.body, 2, 2, () => { throw new Error("A full board must not call RNG"); }), null);
  assert.deepEqual(snakeFood(body, 2, 2, () => 0.9), { x: 1, y: 0 });
});

function mineBoard() {
  return Array.from({ length: 9 }, (_, index) => ({ mine: index === 0, flagged: false, revealed: false,
    count: mineNeighbors(index, 3).filter((neighbor) => neighbor === 0).length }));
}

test("flagged Minesweeper mine is a no-op; unflagged mine is an actual hit", () => {
  const board = mineBoard(); board[0].flagged = true;
  assert.deepEqual(revealMineCells(board, 0, 3), { changed: false, hit: false, won: false });
  assert.equal(board[0].revealed, false);
  board[0].flagged = false;
  assert.equal(revealMineCells(board, 0, 3).hit, true);
});

test("Minesweeper flood skips flagged safe cells and wins only after every safe cell opens", () => {
  const board = mineBoard(); board[8].flagged = true;
  assert.equal(revealMineCells(board, 7, 3).won, false);
  assert.equal(board[8].revealed, false); assert.equal(board[0].revealed, false);
  board[8].flagged = false;
  const done = revealMineCells(board, 8, 3);
  assert.equal(done.hit, false); assert.equal(done.won, true); assert.equal(board.filter((cell) => cell.revealed).length, 8);
});

test("Lights Out corner affects three cells and applying the same valid sequence twice restores the board", () => {
  assert.deepEqual(crossIndexes(0, 5), [0, 5, 1]);
  const board = Array(25).fill(false), sequence = [0, 4, 12, 17, 23];
  for (let repeat = 0; repeat < 2; repeat++) for (const index of sequence) for (const cell of crossIndexes(index, 5)) board[cell] = !board[cell];
  assert.deepEqual(board, Array(25).fill(false));
});
