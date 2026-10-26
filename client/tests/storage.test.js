import test from "node:test";
import assert from "node:assert/strict";
import { readLocalBest, writeLocalBest } from "../src/local-best.js";
import { OperationStore } from "../src/operation-store.js";
import { intentHash } from "../src/protocol.js";
import { actorId, cryptoObject, ids, intent, key, memoryStorage, saved } from "./helpers.js";
async function pending(action = "score.submit") { return { version: 1, actorId, operationKey: key, action, intentHash: await intentHash(action, actorId, intent, cryptoObject), phase: "pending", ...(action === "score.submit" ? { intent } : { expectedVersion: 1 }) }; }

test("local best storage denial never throws or reports a durable score", () => {
  assert.deepEqual(writeLocalBest(null, "snake", 200), { value: null, available: false });
  assert.deepEqual(readLocalBest({ getItem() { throw new Error("denied"); } }, "snake"), { value: null, available: false });
});
test("corrupt best remains raw and a smaller score cannot replace a larger best", () => {
  const storage = memoryStorage(); storage.setItem("arcadia-best:snake", "broken");
  assert.equal(writeLocalBest(storage, "snake", 200).available, false); assert.equal(storage.getItem("arcadia-best:snake"), "broken");
  storage.setItem("arcadia-best:snake", "300"); assert.equal(writeLocalBest(storage, "snake", 200).value, 300);
});
test("silent setItem failure is not a successful local write", () => {
  const storage = memoryStorage(); storage.setItem = () => {};
  assert.equal(writeLocalBest(storage, "snake", 200).available, false);
});
test("metadata rejects coerced hashes, extra PII, and another actor without overwriting raw", async () => {
  const storage = memoryStorage(), store = new OperationStore(storage, actorId, ids), value = await pending();
  for (const bad of [{ ...value, intentHash: [value.intentHash] }, { ...value, email: "qa@example.test" }, { ...value, actorId: 8 }]) {
    const raw = JSON.stringify(bad); storage.setItem(store.key, raw); assert.throws(() => store.read()); assert.equal(storage.getItem(store.key), raw);
  }
});
test("profile metadata deliberately contains no editable profile text", async () => {
  const storage = memoryStorage(), store = new OperationStore(storage, actorId, ids); store.write(await pending("profile.update"));
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(store.key))).sort(), ["action", "actorId", "expectedVersion", "intentHash", "operationKey", "phase", "version"].sort());
});
test("confirmed receipt cannot be downgraded by a stale pending retry", async () => {
  const store = new OperationStore(memoryStorage(), actorId, ids), value = await pending();
  store.write({ ...value, phase: "confirmed", receipt: saved });
  assert.throws(() => store.write(value), { code: "already_confirmed" }); assert.equal(store.read().phase, "confirmed");
});
test("remove landing with unreadable acknowledgement can be retried as local-only absence", async () => {
  const storage = memoryStorage(), store = new OperationStore(storage, actorId, ids), value = await pending(); store.write(value);
  const get = storage.getItem; let removed = false;
  storage.removeItem = (name) => { storage.values.delete(name); removed = true; };
  storage.getItem = (name) => { if (removed) { removed = false; throw new Error("readback denied"); } return get(name); };
  assert.equal(store.clear(value), "unavailable"); assert.equal(store.clear(value), "cleared");
});
test("local cleanup preserves a valid different operation", async () => {
  const store = new OperationStore(memoryStorage(), actorId, ids), value = await pending();
  const other = { ...value, operationKey: "87eaf489-177a-4a5b-8209-3b49b865e8b9" }; store.write(other);
  assert.equal(store.clear(value), "different"); assert.equal(store.read().operationKey, other.operationKey);
});
