import test from "node:test";
import assert from "node:assert/strict";
import { OperationController } from "../src/operation-controller.js";
import { OperationStore } from "../src/operation-store.js";
import { ApiError } from "../src/transport.js";
import { actorId, cryptoObject, deferred, ids, intent, key, memoryStorage, saved } from "./helpers.js";
function controller(api, storage = memoryStorage(), extra = {}) {
  return new OperationController({ api, storage, actorId, ids, cryptoObject, isCurrent: () => true, ...extra });
}
test("lost response recovers exact committed receipt without another POST", async () => {
  let posts = 0; const storage = memoryStorage();
  const api = { async mutate() { posts++; throw new ApiError("lost ACK", 0, "timeout", true); }, async operation() { return { action: "score.submit", receipt: saved }; } };
  const first = controller(api, storage); assert.equal(await first.begin("score.submit", intent), false); assert.equal(first.getSnapshot().phase, "unknown");
  const reloaded = controller(api, storage); await reloaded.reconcile();
  assert.equal(posts, 1); assert.equal(reloaded.getSnapshot().phase, "idle"); assert.deepEqual(reloaded.getSnapshot().receipt, saved); assert.equal(storage.getItem("arcadia-operation:" + actorId), null);
});
test("missing receipt never becomes permission to generate a new operation", async () => {
  const sent = [], api = { async mutate(action, body, operationKey) { sent.push({ action, body, operationKey }); throw new ApiError("unknown", 0, "timeout", true); }, async operation() { return null; } };
  const model = controller(api); await model.begin("score.submit", intent); await model.reconcile();
  assert.equal(model.getSnapshot().phase, "unknown"); assert.equal(await model.begin("score.submit", { ...intent, score: 500 }), false);
  await model.retry(); assert.equal(sent.length, 2); assert.deepEqual(sent[0], sent[1]);
});
test("same key with changed-intent conflict remains protected", async () => {
  const model = controller({ async mutate() { throw new ApiError("intent differs", 409, "intent_changed"); } });
  await model.begin("score.submit", intent); assert.equal(model.getSnapshot().phase, "unknown"); assert.equal(model.getSnapshot().record.operationKey, key);
});
test("storage silent write failure blocks POST but retains same unsent key", async () => {
  let posts = 0; const storage = memoryStorage(), actualSet = storage.setItem; storage.setItem = () => {};
  const model = controller({ async mutate() { posts++; return saved; } }, storage);
  await model.begin("score.submit", intent); assert.equal(posts, 0); assert.equal(model.getSnapshot().phase, "unsent");
  storage.setItem = actualSet; assert.equal(await model.retry(), true); assert.equal(posts, 1);
});
test("confirmed local removal fault keeps truthful confirmation and retry has no POST", async () => {
  let posts = 0; const storage = memoryStorage(), remove = storage.removeItem; storage.removeItem = () => { throw new Error("denied"); };
  const model = controller({ async mutate() { posts++; return saved; } }, storage);
  assert.equal(await model.begin("score.submit", intent), true); assert.equal(model.getSnapshot().phase, "confirmed"); assert.match(model.getSnapshot().message, /sudah tersimpan/);
  assert.equal(await model.retry(), false); storage.removeItem = remove; model.finishLocalCleanup(); assert.equal(posts, 1); assert.equal(model.getSnapshot().phase, "idle");
});
test("known rejection with failed local cleanup stays rejected, not unknown or success", async () => {
  const storage = memoryStorage(); storage.removeItem = () => { throw new Error("denied"); };
  const model = controller({ async mutate() { throw new ApiError("invalid", 422, "validation"); } }, storage);
  await model.begin("score.submit", intent); assert.equal(model.getSnapshot().phase, "rejected"); assert.equal(model.getSnapshot().receipt, null); assert.equal(await model.retry(), false);
});
test("account switch after awaited hash prevents stale metadata and POST", async () => {
  let live = true, posts = 0; const digest = deferred(), storage = memoryStorage();
  const model = controller({ async mutate() { posts++; return saved; } }, storage, { isCurrent: () => live, cryptoObject: { randomUUID: () => key, subtle: { digest: () => digest.promise } } });
  const pending = model.begin("score.submit", intent); live = false; digest.resolve(new Uint8Array(32).buffer); await pending;
  assert.equal(posts, 0); assert.equal(storage.values.size, 0);
});
test("hash rejection is a recoverable known-unsent draft state", async () => {
  let posts = 0;
  const model = controller({ async mutate() { posts++; } }, memoryStorage(), { cryptoObject: { randomUUID: () => key, subtle: { async digest() { throw new Error("unavailable"); } } } });
  await model.begin("score.submit", intent); assert.equal(model.getSnapshot().phase, "idle"); assert.equal(model.getSnapshot().busy, false); assert.equal(posts, 0);
});
test("profile reload retains only hash/version; exact reentry recovers immutable original", async () => {
  const storage = memoryStorage(), calls = [];
  const api = { async mutate(action, data, operationKey) { calls.push({ action, data, operationKey }); if (calls.length === 1) throw new ApiError("lost", 0, "timeout", true); return { actorId, profileVersion: 2 }; } };
  const model = controller(api, storage); await model.begin("profile.update", { username: "qa_renamed", avatar: "XP", expectedVersion: 1 });
  assert.equal(storage.getItem("arcadia-operation:" + actorId).includes("qa_renamed"), false);
  const reload = controller(api, storage); assert.equal(reload.getSnapshot().hasIntent, false);
  assert.equal(await reload.reenterProfile({ username: "different", avatar: "XP" }), false);
  assert.equal(await reload.reenterProfile({ username: "qa_renamed", avatar: "XP" }), true);
  assert.equal(await reload.retry(), true); assert.deepEqual(calls[0], calls[1]);
});
test("stale async profile reentry cannot attach payload to another account generation", async () => {
  const storage = memoryStorage();
  const first = controller({ async mutate() { throw new ApiError("lost", 0, "timeout", true); } }, storage);
  await first.begin("profile.update", { username: "qa_renamed", avatar: "XP", expectedVersion: 1 });
  let live = true; const digest = deferred();
  const reload = controller({}, storage, { isCurrent: () => live, cryptoObject: { subtle: { digest: () => digest.promise } } });
  const pending = reload.reenterProfile({ username: "qa_renamed", avatar: "XP" }); live = false; digest.resolve(new Uint8Array(32).buffer); await pending;
  assert.equal(reload.getSnapshot().hasIntent, false);
});
test("server receipt with another score is rejected without dropping pending identity", async () => {
  const model = controller({ async mutate() { return { ...saved, score: { ...saved.score, score: 999 } }; } });
  assert.equal(await model.begin("score.submit", intent), false); assert.equal(model.getSnapshot().phase, "unknown");
});
test("view refresh failure cannot relabel a confirmed server commit", async () => {
  const model = controller({ async mutate() { return saved; } }, memoryStorage(), { onSaved() { throw new Error("view failed"); } });
  assert.equal(await model.begin("score.submit", intent), true); assert.deepEqual(model.getSnapshot().receipt, saved);
});
test("confirmation leaves a different tab's pending identity intact", async () => {
  const storage = memoryStorage(), reply = deferred(), model = controller({ mutate: () => reply.promise }, storage);
  const pending = model.begin("score.submit", intent);
  // Wait for durable identity creation without advancing or replacing the API reply.
  for (let count = 0; count < 50 && model.getSnapshot().phase !== "sending"; count++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(model.getSnapshot().phase, "sending");
  const other = { ...model.getSnapshot().record, operationKey: "87eaf489-177a-4a5b-8209-3b49b865e8b9" };
  storage.setItem("arcadia-operation:" + actorId, JSON.stringify(other)); reply.resolve(saved);
  assert.equal(await pending, true); assert.equal(new OperationStore(storage, actorId, ids).read().operationKey, other.operationKey);
});
