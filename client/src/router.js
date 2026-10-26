export function normalizeBase(base) {
  if (typeof base !== "string" || !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error("Base path tidak valid.");
  return base;
}
export function appPath(pathname, base = "/") {
  normalizeBase(base);
  if (pathname === base.slice(0, -1)) return "/";
  if (!pathname.startsWith(base)) return null;
  return "/" + pathname.slice(base.length).replace(/\/+$/, "");
}
export function gameSlug(route) {
  if (typeof route !== "string" || !route.startsWith("/games/")) return null;
  try {
    const slug = decodeURIComponent(route.slice(7));
    return /^[a-z0-9-]{1,40}$/.test(slug) ? slug : null;
  } catch { return null; }
}
export function appHref(path, base = "/") {
  normalizeBase(base);
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("?") || path.includes("#") || path.includes("\\")) throw new Error("Path aplikasi tidak valid.");
  return base + path.slice(1);
}
