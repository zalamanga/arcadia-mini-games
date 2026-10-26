import { webcrypto } from "node:crypto";
export const ids = new Set(["snake", "2048"]);
export const key = "44b6d6f7-b680-4ae7-9588-31f9aaa1e864";
export const actorId = 7;
export const intent = Object.freeze({ gameId: "snake", score: 200, duration: 2500, result: "complete" });
export const saved = Object.freeze({ actorId, score: { id: 1, ...intent, createdAt: 1000 }, unlocked: [] });
export const account = Object.freeze({ id: actorId, username: "qa_player", email: "qa@example.test", avatar: "P1", role: "user", version: 1, createdAt: 1000, emailVerified: false });
export const cryptoObject = { subtle: webcrypto.subtle, randomUUID: () => key };
export function memoryStorage() {
  const values = new Map();
  return { values, getItem: (name) => values.has(name) ? values.get(name) : null, setItem: (name, value) => values.set(name, String(value)), removeItem: (name) => values.delete(name) };
}
export function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
