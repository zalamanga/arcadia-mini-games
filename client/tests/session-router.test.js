import test from "node:test";
import assert from "node:assert/strict";
import { SessionController } from "../src/session-controller.js";
import { appHref, appPath, gameSlug, normalizeBase } from "../src/router.js";
import { ApiError } from "../src/transport.js";
import { account, deferred } from "./helpers.js";

test("stale parallel auth GET cannot replace a newer session", async () => {
  const old = deferred(); let count = 0;
  const model = new SessionController({ session() { return ++count === 1 ? old.promise : Promise.resolve(account); } });
  const first = model.refresh({ discover: true }); await model.refresh({ discover: true }); old.resolve(null); await first;
  assert.equal(model.getSnapshot().user.id, account.id); assert.equal(model.getSnapshot().status, "authenticated");
});
test("unknown login requires authenticated discovery before another password submission", async () => {
  let posts = 0; const model = new SessionController({ async session() { return null; }, async authenticate() { posts++; throw new ApiError("lost", 0, "timeout", true); } });
  await model.refresh({ discover: true }); await model.authenticate("login", { identity: "qa", password: "synthetic-only" });
  assert.equal(model.getSnapshot().status, "auth-unknown"); await model.authenticate("login", {}); assert.equal(posts, 1);
  await model.refresh({ discover: true }); assert.equal(model.getSnapshot().status, "guest");
});
test("read failure keeps existing actor and captured intent remains scoped", async () => {
  let failed = false; const model = new SessionController({ async session() { if (failed) throw new Error("offline"); return account; } });
  await model.refresh({ discover: true }); const captured = model.capture(); failed = true; await model.refresh();
  assert.equal(model.getSnapshot().status, "error"); assert.equal(model.getSnapshot().user.id, account.id); assert.equal(captured.isCurrent(), true);
});
test("logout sends captured actor and a new session invalidates old capture", async () => {
  let sent; const model = new SessionController({ async session() { return account; }, async logout(options) { sent = options.actorId; } });
  await model.refresh({ discover: true }); const captured = model.capture(); await model.logout();
  assert.equal(sent, account.id); assert.equal(captured.isCurrent(), false); assert.equal(model.getSnapshot().status, "guest");
});
test("base path strips only its own prefix and preserves correct links", () => {
  assert.equal(appPath("/arcadia/games/snake", "/arcadia/"), "/games/snake"); assert.equal(appPath("/arcadia", "/arcadia/"), "/");
  assert.equal(appPath("/other/games/snake", "/arcadia/"), null); assert.equal(appHref("/games/snake", "/arcadia/"), "/arcadia/games/snake");
  for (const base of ["arcadia", "//evil/", "/../"]) assert.throws(() => normalizeBase(base));
});
test("malformed encoded slugs and external-looking links fail closed", () => {
  assert.equal(gameSlug("/games/%E0%A4%A"), null); assert.equal(gameSlug("/games/%2Fsnake"), null); assert.equal(gameSlug("/games/snake"), "snake");
  for (const to of ["//evil.test", "/games?x=1", "/games#x", "/games\\snake"]) assert.throws(() => appHref(to));
});
