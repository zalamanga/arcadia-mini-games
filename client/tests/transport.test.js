import test from "node:test";
import assert from "node:assert/strict";
import { requestJson } from "../src/transport.js";
import { createApi } from "../src/api.js";
import { deferred, ids } from "./helpers.js";

test("JSON transport preserves auth failure status even when body is malformed", async () => {
  await assert.rejects(requestJson(async () => new Response("not json", { status: 401 }), "/"), (error) => error.status === 401 && error.code === "response_invalid");
});
test("declared oversized and actual oversized bodies are independently rejected", async () => {
  await assert.rejects(requestJson(async () => new Response("{}", { headers: { "content-length": "1048577" } }), "/"), { code: "response_size" });
  let canceled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(600000)); }, cancel() { canceled = true; } });
  await assert.rejects(requestJson(async () => new Response(stream, { headers: { "content-length": "2" } }), "/"), { code: "response_size" });
  assert.equal(canceled, true);
});
test("invalid UTF8 is rejected before JSON interpretation", async () => {
  await assert.rejects(requestJson(async () => new Response(new Uint8Array([123, 34, 120, 34, 58, 34, 0xff, 34, 125])), "/"), { code: "response_invalid" });
});
test("deadline includes a fetch that never resolves and aborts owned transport", async () => {
  let signal;
  await assert.rejects(requestJson(async (_url, init) => { signal = init.signal; return new Promise(() => {}); }, "/", {}, { timeoutMs: 5 }), { code: "timeout", outcomeUnknown: true });
  assert.equal(signal.aborted, true);
});
test("account switch during a delayed chunk cancels stream without publishing data", async () => {
  let current = true, canceled = false; const chunk = deferred(), reading = deferred();
  const stream = new ReadableStream({ async pull(controller) { reading.resolve(); await chunk.promise; controller.enqueue(new TextEncoder().encode("{}")); }, cancel() { canceled = true; } }, { highWaterMark: 0 });
  const pending = requestJson(async () => new Response(stream), "/", {}, { isCurrent: () => current });
  await reading.promise; current = false; chunk.resolve();
  await assert.rejects(pending, { code: "stale" }); assert.equal(canceled, true);
});
test("parent cancellation does not wait for a stalled body", async () => {
  const abort = new AbortController(); let canceled = false; const reading = deferred();
  const stream = new ReadableStream({ pull() { reading.resolve(); return new Promise(() => {}); }, cancel() { canceled = true; } }, { highWaterMark: 0 });
  const pending = requestJson(async () => new Response(stream), "/", {}, { signal: abort.signal });
  await reading.promise; abort.abort();
  await assert.rejects(pending, { code: "aborted" }); assert.equal(canceled, true);
});
test("malformed HTTP200 is never a confirmed score operation", async () => {
  const api = createApi("http://127.0.0.1:8080/index.php", ids, async () => new Response("{}"));
  await assert.rejects(api.mutate("score.submit", { gameId: "snake", score: 0, duration: 0, result: "loss" }, "44b6d6f7-b680-4ae7-9588-31f9aaa1e864", { actorId: 7 }), { code: "protocol" });
});
