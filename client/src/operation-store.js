import { bounded, exact, fail, integer, receipt, scoreIntent, uuid } from "./protocol.js";
import { ApiError } from "./transport.js";

export function operationRecord(value, actorId, ids) {
  const action = value?.action;
  if (!["score.submit", "profile.update"].includes(action)) fail();
  const keys = ["version", "actorId", "operationKey", "action", "intentHash", "phase", action === "score.submit" ? "intent" : "expectedVersion"];
  if (value?.phase === "confirmed") keys.push("receipt");
  exact(value, keys);
  if (value.version !== 1 || value.actorId !== actorId || !integer(actorId, 1) || !uuid(value.operationKey)
      || typeof value.intentHash !== "string" || !/^[a-f0-9]{64}$/.test(value.intentHash) || !["pending", "confirmed"].includes(value.phase)) fail();
  const data = action === "score.submit" ? { intent: scoreIntent(value.intent, ids) } : { expectedVersion: value.expectedVersion };
  if (action === "profile.update" && !integer(value.expectedVersion, 1, Number.MAX_SAFE_INTEGER - 1)) fail();
  const saved = value.phase === "confirmed" ? { receipt: receipt(action, value.receipt, actorId, ids) } : {};
  if (value.phase === "confirmed") {
    if (action === "profile.update" && saved.receipt.profileVersion !== value.expectedVersion + 1) fail();
    if (action === "score.submit" && ["gameId", "score", "duration", "result"].some((key) => saved.receipt.score[key] !== data.intent[key])) fail();
  }
  return Object.freeze({ version: 1, actorId, operationKey: value.operationKey, action, intentHash: value.intentHash, phase: value.phase, ...data, ...saved });
}

export const sameOperation = (left, right) => left !== null && right !== null && left.actorId === right.actorId && left.operationKey === right.operationKey && left.action === right.action && left.intentHash === right.intentHash;

export class OperationStore {
  constructor(storage, actorId, ids) { this.storage = storage; this.actorId = actorId; this.ids = ids; this.key = "arcadia-operation:" + actorId; }
  read() {
    if (!this.storage) throw new Error("Penyimpanan pemulihan tidak tersedia.");
    const raw = this.storage.getItem(this.key);
    if (raw === null) return null;
    bounded(raw, 16384, 1);
    return operationRecord(JSON.parse(raw), this.actorId, this.ids);
  }
  write(value) {
    const normalized = operationRecord(value, this.actorId, this.ids);
    const before = this.read();
    if (before !== null && !sameOperation(before, normalized)) throw new Error("Operasi lain masih menunggu konfirmasi.");
    if (before?.phase === "confirmed" && normalized.phase === "pending") throw new ApiError("Operasi sudah terkonfirmasi; cukup bersihkan catatan lokal.", 0, "already_confirmed");
    const raw = JSON.stringify(normalized);
    this.storage.setItem(this.key, raw);
    if (this.storage.getItem(this.key) !== raw) throw new Error("Catatan operasi belum terkonfirmasi tersimpan.");
    return normalized;
  }
  clear(value) {
    try {
      const actual = this.read();
      if (actual === null) return "cleared";
      if (!sameOperation(actual, value)) return "different";
      this.storage.removeItem(this.key);
      return this.storage.getItem(this.key) === null ? "cleared" : "unavailable";
    } catch { return "unavailable"; }
  }
}
