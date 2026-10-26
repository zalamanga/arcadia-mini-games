export class ApiError extends Error {
  constructor(message, status = 0, code = "transport", outcomeUnknown = false) {
    super(message); this.name = "ApiError"; this.status = status; this.code = code; this.outcomeUnknown = outcomeUnknown;
  }
}

export function current(options) {
  if (options.signal?.aborted) throw new ApiError("Pembacaan dibatalkan.", 0, "aborted");
  if (options.isCurrent && !options.isCurrent()) throw new ApiError("Akun atau halaman berubah. Respons lama tidak digunakan.", 0, "stale");
}

export async function requestJson(fetcher, url, init = {}, options = {}) {
  current(options);
  const abort = new AbortController();
  let reader, timer, onAbort, complete = false;
  const check = () => { current(options); if (abort.signal.aborted) throw new ApiError("Permintaan dihentikan.", 0, "aborted"); };
  const read = async () => {
    const response = await fetcher(url, { ...init, signal: abort.signal, redirect: "error", credentials: "include", cache: "no-store", referrerPolicy: "same-origin" });
    check();
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1048576)) throw new ApiError("Respons melampaui batas pemeriksaan.", response.status, "response_size");
    if (!response.body) throw new ApiError("Isi respons belum lengkap.", response.status, "response_invalid");
    reader = response.body.getReader();
    const chunks = []; let bytes = 0;
    while (true) {
      const part = await reader.read(); check();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1048576) throw new ApiError("Respons melampaui batas pemeriksaan.", response.status, "response_size");
      chunks.push(part.value);
    }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    let value;
    try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)); }
    catch { throw new ApiError("Respons server belum dapat dibaca.", response.status, "response_invalid", response.status >= 500); }
    check();
    if (!response.ok) {
      const message = typeof value?.error?.message === "string" && value.error.message.length <= 600 ? value.error.message : "Permintaan belum dapat dikonfirmasi.";
      const code = typeof value?.error?.code === "string" && /^[a-z0-9_]{1,60}$/.test(value.error.code) ? value.error.code : "request_failed";
      throw new ApiError(message, response.status, code, value?.outcomeUnknown === true || response.status >= 500);
    }
    complete = true; return value;
  };
  try {
    return await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new ApiError("Batas waktu15 detik terlewati. Periksa status sebelum mengirim ulang.", 0, "timeout", true)); }, options.timeoutMs ?? 15000);
      onAbort = () => { abort.abort(); reject(new ApiError("Permintaan dibatalkan. Hasil mutasi mungkin belum pasti.", 0, "aborted", true)); };
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
    })]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener("abort", onAbort);
    if (!complete) { abort.abort(); if (reader) void reader.cancel().catch(() => undefined); }
    try { reader?.releaseLock(); } catch { /* The owned pending read is canceled above. */ }
  }
}
