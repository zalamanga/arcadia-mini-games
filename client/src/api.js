import { requestJson, ApiError, current } from "./transport.js";
import { ACHIEVEMENTS, bounded, exact, fail, integer, receipt, record, user } from "./protocol.js";

export function createApi(endpoint, ids, fetcher = globalThis.fetch.bind(globalThis)) {
  const base = new URL(endpoint);
  if (!["http:", "https:"].includes(base.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)
      || base.username || base.password || base.search || base.hash || !base.pathname.endsWith("/index.php")) throw new ApiError("Atur VITE_API_URL ke index.php pada API demo loopback.");
  const request = async (route, { method = "GET", body, operationKey, ...options } = {}) => {
    current(options);
    const url = new URL(base); url.searchParams.set("route", route);
    if (route === "operations") url.searchParams.set("operationKey", operationKey);
    const headers = new Headers({ Accept: "application/json" });
    if (options.actorId !== undefined && options.actorId !== null) headers.set("X-Arcadia-Actor", String(options.actorId));
    if (method !== "GET") { headers.set("Content-Type", "application/json"); headers.set("X-Arcadia-Intent", "mutate-v1"); }
    if (operationKey) headers.set("X-Arcadia-Operation", operationKey);
    return requestJson(fetcher, url.href, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, options);
  };
  return {
    async session(options = {}) { const value = await request("auth/me", options); exact(value, ["user"]); return value.user === null ? null : user(value.user); },
    async authenticate(mode, body, options = {}) { const value = await request("auth/" + mode, { ...options, method: "POST", body }); exact(value, ["user"]); return user(value.user); },
    async logout(options) { const value = await request("auth/logout", { ...options, method: "POST", body: {} }); exact(value, ["signedOut", "serverRevoked", "cookieCleared"]); if (value.signedOut !== true || value.serverRevoked !== true || value.cookieCleared !== false) fail(); return value; },
    async games(options = {}) {
      const value = await request("games", options); exact(value, ["games", "scoreTrust"]);
      if (!Array.isArray(value.games) || value.games.length > 13 || value.scoreTrust !== "client-reported-demo") fail();
      const seen = new Set();
      return value.games.map((item) => {
        exact(item, ["id", "name", "category", "difficulty", "description", "plays", "topScore", "slug"]);
        if (!ids.has(item.id) || seen.has(item.id) || item.slug !== item.id || !["Puzzle", "Arcade", "Skill"].includes(item.category) || !["Easy", "Medium", "Hard"].includes(item.difficulty)
            || !integer(item.plays, 0, 20000) || !integer(item.topScore, 0, 1000000000)) fail();
        seen.add(item.id); bounded(item.name, 80, 1); bounded(item.description, 255); return Object.freeze({ ...item });
      });
    },
    async leaderboard(gameId, options = {}) {
      if (gameId !== "all" && !ids.has(gameId)) fail();
      const value = await request(gameId === "all" ? "leaderboard" : "leaderboard/" + gameId, options);
      exact(value, gameId === "all" ? ["leaderboard", "scoreTrust"] : ["gameId", "leaderboard"]);
      if ((gameId !== "all" && value.gameId !== gameId) || (gameId === "all" && value.scoreTrust !== "client-reported-demo") || !Array.isArray(value.leaderboard) || value.leaderboard.length > 25) fail();
      const seen = new Set();
      return value.leaderboard.map((row, index) => {
        exact(row, gameId === "all" ? ["userId", "username", "avatar", "score", "gamesPlayed", "rank"] : ["userId", "username", "avatar", "score", "rank"]);
        if (!integer(row.userId, 1) || row.rank !== index + 1 || seen.has(row.userId) || !integer(row.score, 0, gameId === "all" ? 13000000000 : 1000000000)) fail();
        if (gameId === "all" && !integer(row.gamesPlayed, 1, 13)) fail();
        bounded(row.username, 20, 3); bounded(row.avatar, 2, 2); seen.add(row.userId); return Object.freeze({ ...row });
      });
    },
    async achievements(options = {}) {
      const value = await request("achievements", options); exact(value, ["achievements"]);
      if (!Array.isArray(value.achievements) || value.achievements.length !== 6 || new Set(value.achievements.map((item) => item.id)).size !== 6) fail();
      return value.achievements.map((item) => {
        exact(item, ["id", "name", "description", "requirement", "unlocked", "unlockedAt"]);
        if (!ACHIEVEMENTS.includes(item.id) || typeof item.unlocked !== "boolean" || (item.unlockedAt !== null && !integer(item.unlockedAt, 1)) || item.unlocked !== (item.unlockedAt !== null)) fail();
        bounded(item.name, 80, 1); bounded(item.description, 255); bounded(item.requirement, 100); return Object.freeze({ ...item });
      });
    },
    async profile(options) {
      const value = await request("profile", options); exact(value, ["user", "stats", "history"]); const account = user(value.user);
      if (account.id !== options.actorId) fail();
      exact(value.stats, ["sessions", "gamesPlayed", "totalScore", "bestScore", "totalDuration"]);
      if (Object.values(value.stats).some((number) => !integer(number)) || !Array.isArray(value.history) || value.history.length > 20) fail();
      const seen = new Set();
      const history = value.history.map((item) => {
        exact(item, ["id", "gameId", "gameName", "result", "score", "duration", "createdAt"]);
        if (!integer(item.id, 1) || seen.has(item.id) || !ids.has(item.gameId) || !integer(item.score, 0, 1000000000) || !integer(item.duration, 0, 86400000)
            || !integer(item.createdAt, 1) || !["win", "loss", "draw", "complete"].includes(item.result)) fail();
        bounded(item.gameName, 80, 1); seen.add(item.id); return Object.freeze({ ...item });
      });
      return { user: account, stats: Object.freeze({ ...value.stats }), history: Object.freeze(history) };
    },
    async mutate(action, intent, key, options) {
      const value = await request(action === "score.submit" ? "scores" : "profile", { ...options, method: action === "score.submit" ? "POST" : "PATCH", body: intent, operationKey: key });
      if (!record(value)) fail();
      const { operationKey, replayed, ...metadata } = value;
      if (operationKey !== key || typeof replayed !== "boolean") fail();
      return receipt(action, metadata, options.actorId, ids);
    },
    async operation(key, options) {
      const value = await request("operations", { ...options, operationKey: key });
      if (value?.found === false) { exact(value, ["found", "operationKey"]); if (value.operationKey !== key) fail(); return null; }
      exact(value, ["found", "operationKey", "action", "status", "response"]);
      if (value.found !== true || value.operationKey !== key || !["score.submit", "profile.update"].includes(value.action) || value.status !== (value.action === "score.submit" ? 201 : 200)) fail();
      return { action: value.action, receipt: receipt(value.action, value.response, options.actorId, ids) };
    },
  };
}
