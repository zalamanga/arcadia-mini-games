import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.ARCADIA_WEB_BASE || "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@arcadia-games": path.resolve(here, "src/games/catalog.js"),
    },
  },
  server: {
    fs: { allow: [path.resolve(here, "..")] },
  },
});
