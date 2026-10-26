import { ApiError } from "./transport.js";

export const AVATARS = Object.freeze(["P1", "P2", "PX", "AI", "GG", "XP"]);
export const ACHIEVEMENTS = Object.freeze(["first-run", "getting-warm", "arcade-explorer", "score-hunter", "dedicated", "veteran"]);
export const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const integer = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
export const uuid = (value) => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const fail = () => { throw new ApiError("Bentuk respons atau catatan operasi tidak sesuai. Data lama tetap dipertahankan.", 0, "protocol"); };
export function exact(value, keys) {
  if (!record(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail();
  return value;
}
export function bounded(value, maximum, minimum = 0) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value) || /[\ud800-\udfff]/u.test(value.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ""))) fail();
  return value;
}
export function user(value) {
  exact(value, ["id", "username", "email", "avatar", "role", "version", "createdAt", "emailVerified"]);
  if (!integer(value.id, 1) || !integer(value.version, 1) || !integer(value.createdAt, 1) || !/^[a-zA-Z0-9_-]{3,20}$/.test(bounded(value.username, 20, 3))
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bounded(value.email, 120, 3)) || !AVATARS.includes(value.avatar) || !["user", "admin"].includes(value.role) || value.emailVerified !== false) fail();
  return Object.freeze({ ...value });
}
export function scoreIntent(value, ids) {
  exact(value, ["gameId", "score", "duration", "result"]);
  if (!ids.has(value.gameId) || !integer(value.score, 0, 1000000000) || !integer(value.duration, 0, 86400000) || !["win", "loss", "draw", "complete"].includes(value.result)) fail();
  return Object.freeze({ gameId: value.gameId, score: value.score, duration: value.duration, result: value.result });
}
export function profileIntent(value) {
  exact(value, ["username", "avatar", "expectedVersion"]);
  const name = bounded(value.username, 20, 3).trim();
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(name) || !AVATARS.includes(value.avatar) || !integer(value.expectedVersion, 1, Number.MAX_SAFE_INTEGER - 1)) fail();
  return Object.freeze({ username: name, avatar: value.avatar, expectedVersion: value.expectedVersion });
}
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (record(value)) return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
export async function intentHash(action, actorId, data, cryptoObject = globalThis.crypto) {
  if (!cryptoObject?.subtle) throw new ApiError("Browser belum menyediakan pemeriksaan identitas operasi. Belum ada data dikirim.", 0, "crypto_unavailable");
  const bytes = new TextEncoder().encode(canonical({ action, actorId, data }));
  const digest = await cryptoObject.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
export function receipt(action, value, actorId, ids) {
  if (action === "score.submit") {
    exact(value, ["actorId", "score", "unlocked"]);
    exact(value.score, ["id", "gameId", "score", "duration", "result", "createdAt"]);
    if (value.actorId !== actorId || !integer(value.score.id, 1) || !integer(value.score.createdAt, 1) || !Array.isArray(value.unlocked)
        || value.unlocked.length > 6 || new Set(value.unlocked).size !== value.unlocked.length || value.unlocked.some((id) => !ACHIEVEMENTS.includes(id))) fail();
    scoreIntent(Object.fromEntries(["gameId", "score", "duration", "result"].map((key) => [key, value.score[key]])), ids);
    return Object.freeze({ actorId, score: Object.freeze({ ...value.score }), unlocked: Object.freeze([...value.unlocked]) });
  }
  if (action === "profile.update") {
    exact(value, ["actorId", "profileVersion"]);
    if (value.actorId !== actorId || !integer(value.profileVersion, 1)) fail();
    return Object.freeze({ ...value });
  }
  return fail();
}
