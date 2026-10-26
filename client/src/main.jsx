import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { createApi } from "./api.js";
import { SessionController } from "./session-controller.js";
import { normalizeBase } from "./router.js";
import { gameMap } from "./games/catalog.js";

function Bootstrap() {
  const [setup] = useState(() => {
    try {
      const endpoint = import.meta.env.VITE_API_URL || "http://127.0.0.1:8080/index.php";
      const url = new URL(endpoint);
      if (url.hostname !== location.hostname || url.protocol !== location.protocol) throw new Error("Origin mismatch.");
      const api = createApi(endpoint, new Set(gameMap.keys()));
      return { api, session: new SessionController(api), base: normalizeBase(import.meta.env.BASE_URL) };
    } catch { return { error: "Konfigurasi API belum cocok. Gunakan hostname dan scheme yang sama untuk frontend/API, lalu atur VITE_API_URL dan base path sebelum build." }; }
  });
  if (setup.error) return <main className="wrap section"><h1>Arcadia belum dapat dimuat</h1><p role="alert">{setup.error}</p><button onClick={() => location.reload()}>Muat ulang halaman</button></main>;
  return <App {...setup} />;
}

createRoot(document.getElementById("root")).render(<Bootstrap />);
