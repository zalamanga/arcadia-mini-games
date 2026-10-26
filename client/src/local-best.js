export function readLocalBest(storage, gameId) {
  try {
    const raw = storage?.getItem("arcadia-best:" + gameId);
    if (raw === null) return { value: null, available: true };
    if (typeof raw !== "string" || !/^(0|[1-9][0-9]{0,9})$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > 1000000000) return { value: null, available: false };
    return { value: Number(raw), available: true };
  } catch { return { value: null, available: false }; }
}

export function writeLocalBest(storage, gameId, score) {
  if (!Number.isSafeInteger(score) || score < 0 || score > 1000000000 || !storage) return { value: null, available: false };
  const prior = readLocalBest(storage, gameId);
  if (!prior.available) return prior;
  const next = Math.max(prior.value ?? 0, score);
  try {
    storage.setItem("arcadia-best:" + gameId, String(next));
    const actual = readLocalBest(storage, gameId);
    return actual.available && actual.value === next ? actual : { value: prior.value, available: false };
  } catch { return { value: prior.value, available: false }; }
}
