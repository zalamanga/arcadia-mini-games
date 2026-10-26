import { useEffect, useState } from "react";

export function useRead(key, load, enabled = true) {
  const [state, setState] = useState({ key: null, status: "loading", value: null, message: "" });
  useEffect(() => {
    if (!enabled) return undefined;
    const abort = new AbortController(); let active = true;
    Promise.resolve().then(() => load(abort.signal)).then((value) => {
      if (active && !abort.signal.aborted) setState({ key, status: "ready", value, message: "" });
    }).catch((error) => {
      if (active && !abort.signal.aborted) setState({ key, status: "error", value: null, message: error?.name === "ApiError" ? error.message : "Data belum dapat dimuat. Coba lagi." });
    });
    return () => { active = false; abort.abort(); };
  }, [key, enabled]);
  return !enabled ? { status: "idle", value: null, message: "" } : state.key === key ? state : { status: "loading", value: null, message: "" };
}
