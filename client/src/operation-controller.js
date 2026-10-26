import { ApiError } from "./transport.js";
import { intentHash, profileIntent, scoreIntent } from "./protocol.js";
import { OperationStore, sameOperation } from "./operation-store.js";

export class OperationController {
  constructor({ api, storage, actorId, ids, isCurrent, cryptoObject = globalThis.crypto, onSaved = () => {} }) {
    this.api = api; this.actorId = actorId; this.ids = ids; this.isCurrent = isCurrent;
    this.crypto = cryptoObject; this.onSaved = onSaved; this.store = new OperationStore(storage, actorId, ids);
    this.listeners = new Set(); this.epoch = 0; this.intent = null; this.record = null; this.abort = null;
    this.state = Object.freeze({ phase: "idle", busy: false, record: null, receipt: null, message: "", hasIntent: false });
    this.load();
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getSnapshot = () => this.state;
  live(epoch = this.epoch) { return this.epoch === epoch && this.isCurrent(); }
  update(phase, message = "", saved = this.state.receipt) {
    this.state = Object.freeze({ phase, busy: ["preparing", "sending", "checking"].includes(phase), record: this.record, receipt: saved, message, hasIntent: this.intent !== null });
    for (const listener of this.listeners) listener();
  }
  load() {
    try {
      this.record = this.store.read();
      this.intent = this.record?.action === "score.submit" ? this.record.intent : null;
      if (this.record?.phase === "confirmed") this.update("confirmed", "Operasi sudah tersimpan. Selesaikan pembersihan catatan lokal tanpa mengirim ulang.", this.record.receipt);
      else if (this.record) this.update("unknown", "Ada operasi yang belum dikonfirmasi. Periksa status kunci yang sama sebelum mengirim hasil lain.", null);
      else this.update("idle", "", null);
    } catch { this.record = null; this.intent = null; this.update("blocked", "Catatan pemulihan tidak dapat dibaca. Data mentah dipertahankan; operasi baru belum dikirim.", null); }
  }
  invalidate() { this.epoch++; this.abort?.abort(); this.intent = null; this.listeners.clear(); }
  normalize(action, value) { if (!["score.submit", "profile.update"].includes(action)) throw new Error("Unknown action."); return action === "score.submit" ? scoreIntent(value, this.ids) : profileIntent(value); }
  async begin(action, value) {
    if (!this.live() || this.state.phase !== "idle") return false;
    const epoch = this.epoch;
    let intent;
    try { intent = this.normalize(action, value); } catch { this.update("idle", "Isi operasi belum valid. Belum ada data dikirim."); return false; }
    this.update("preparing", "Menyiapkan identitas operasi.", null);
    try {
      if (!this.crypto?.randomUUID) throw new Error("Crypto unavailable.");
      const key = this.crypto.randomUUID();
      const hash = await intentHash(action, this.actorId, intent, this.crypto);
      if (!this.live(epoch)) return false;
      let existing;
      try { existing = this.store.read(); }
      catch { this.update("blocked", "Catatan pemulihan tidak dapat dibaca. Belum ada data dikirim dan catatan lama tidak ditimpa.", null); return false; }
      if (existing !== null) { this.load(); return false; }
      this.record = { version: 1, actorId: this.actorId, operationKey: key, action, intentHash: hash, phase: "pending",
        ...(action === "score.submit" ? { intent } : { expectedVersion: intent.expectedVersion }) };
      this.intent = intent;
      try { this.record = this.store.write(this.record); }
      catch { this.update("unsent", "Belum dikirim. Catatan pemulihan belum dapat disimpan; pulihkan akses penyimpanan lalu coba kunci yang sama.", null); return false; }
      return this.send();
    } catch {
      if (this.live(epoch)) this.update("idle", "Identitas operasi belum dapat dibuat. Belum ada data dikirim.", null);
      return false;
    }
  }
  async reenterProfile(value) {
    if (!this.live() || this.state.busy || this.record?.action !== "profile.update" || this.record.phase !== "pending") return false;
    const epoch = this.epoch, captured = this.record;
    this.update("preparing", "Mencocokkan isi dengan operasi profil awal.");
    try {
      const intent = profileIntent({ ...value, expectedVersion: captured.expectedVersion });
      const hash = await intentHash("profile.update", this.actorId, intent, this.crypto);
      if (!this.live(epoch) || !sameOperation(this.record, captured)) return false;
      if (hash !== captured.intentHash) { this.update("unknown", "Perubahan yang dimasukkan berbeda dari operasi awal. Kunci lama tetap dipertahankan."); return false; }
      this.intent = intent;
      this.update("unknown", "Isi cocok dengan operasi awal. Periksa status atau kirim ulang kunci yang sama secara eksplisit.");
      return true;
    } catch { if (this.live(epoch)) this.update("unknown", "Isi awal belum dapat dicocokkan. Belum ada data dikirim."); return false; }
  }
  async retry() {
    if (!this.live() || this.state.busy || !["unknown", "unsent"].includes(this.state.phase) || !this.record) return false;
    if (!this.intent) { this.update("unknown", "Masukkan kembali perubahan profil yang sama untuk memulihkan isi. Password atau teks profil tidak disimpan dalam metadata."); return false; }
    const epoch = this.epoch, captured = this.record, oldPhase = this.state.phase;
    this.update("preparing", "Memeriksa ulang identitas operasi sebelum pengiriman.");
    try {
      const hash = await intentHash(captured.action, this.actorId, this.intent, this.crypto);
      if (!this.live(epoch) || !sameOperation(this.record, captured)) return false;
      if (hash !== captured.intentHash) { this.update("unknown", "Isi catatan tidak cocok dengan hash awal. Data mentah tidak diganti dan belum dikirim."); return false; }
      this.record = this.store.write(this.record);
    }
    catch (error) { if (this.live(epoch)) { if (error?.code === "already_confirmed") this.load(); else this.update(oldPhase, "Catatan pemulihan belum dapat diperiksa. Belum ada permintaan ulang."); } return false; }
    return this.send();
  }
  options(epoch) { return { actorId: this.actorId, signal: this.abort.signal, isCurrent: () => this.live(epoch) }; }
  profileDraft() { return this.record?.action === "profile.update" && this.intent !== null ? { ...this.intent } : null; }
  async send() {
    if (!this.live() || !this.record || !this.intent) return false;
    const epoch = this.epoch, captured = this.record, payload = this.intent;
    this.abort = new AbortController(); this.update("sending", "Mengirim operasi dengan kunci yang disimpan.");
    try {
      const saved = await this.api.mutate(captured.action, payload, captured.operationKey, this.options(epoch));
      if (!this.live(epoch) || !sameOperation(this.record, captured)) return false;
      return this.confirm(saved);
    } catch (error) {
      if (!this.live(epoch)) return false;
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && !error.outcomeUnknown && error.code !== "intent_changed") {
        const cleared = this.store.clear(captured);
        if (cleared === "unavailable") this.update("rejected", "Permintaan ditolak server. Catatan lokal belum bersih; ulangi pembersihan lokal tanpa POST.");
        else { this.record = null; this.intent = null; this.update("idle", error.message, null); }
      } else this.update("unknown", "Hasil belum pasti. Periksa status operasi yang sama; jangan membuat pengiriman baru.");
      return false;
    }
  }
  async reconcile() {
    if (!this.live() || this.state.busy || !this.record || !["unknown", "unsent"].includes(this.state.phase)) return;
    const epoch = this.epoch, captured = this.record;
    this.abort = new AbortController(); this.update("checking", "Memeriksa catatan operasi milik akun ini.");
    try {
      const found = await this.api.operation(captured.operationKey, this.options(epoch));
      if (!this.live(epoch) || !sameOperation(this.record, captured)) return;
      if (!found) { this.update("unknown", "Catatan belum ditemukan. Hasil tetap belum pasti; pengiriman ulang hanya memakai isi dan kunci yang sama."); return; }
      if (found.action !== captured.action) { this.update("unknown", "Kunci merujuk jenis operasi berbeda. Catatan lama dipertahankan untuk pemeriksaan."); return; }
      if (captured.action === "score.submit") {
        const { id, createdAt, ...intent } = found.receipt.score;
        const hash = await intentHash(captured.action, this.actorId, intent, this.crypto);
        if (!this.live(epoch) || !sameOperation(this.record, captured)) return;
        if (hash !== captured.intentHash) { this.update("unknown", "Isi catatan server berbeda. Kunci tidak diganti dan tidak dikirim ulang."); return; }
      }
      this.confirm(found.receipt);
    } catch { if (this.live(epoch)) this.update("unknown", "Status belum dapat dibaca. Catatan operasi tetap dipertahankan."); }
  }
  confirm(saved) {
    if (!this.record) return false;
    if ((this.record.action === "profile.update" && saved.profileVersion !== this.record.expectedVersion + 1)
        || (this.record.action === "score.submit" && ["gameId", "score", "duration", "result"].some((key) => saved.score[key] !== this.record.intent[key]))) {
      this.update("unknown", "Konfirmasi server tidak cocok dengan isi operasi. Catatan awal tetap dipertahankan."); return false;
    }
    this.record = { ...this.record, phase: "confirmed", receipt: saved };
    this.intent = null;
    this.update("confirmed", "Operasi sudah tersimpan di server.", saved);
    try { this.onSaved(this.record.action, saved); } catch { /* A view refresh cannot change a known committed result. */ }
    try { this.record = this.store.write(this.record); }
    catch { this.update("confirmed", "Operasi sudah tersimpan. Catatan lokal belum terkonfirmasi; ulangi pembersihan lokal tanpa POST.", saved); return true; }
    this.finishLocalCleanup();
    return true;
  }
  finishLocalCleanup() {
    if (!this.live() || !this.record || !["confirmed", "rejected"].includes(this.state.phase)) return;
    const saved = this.state.receipt, phase = this.state.phase, status = this.store.clear(this.record);
    if (status === "unavailable") { this.update(phase, phase === "confirmed" ? "Operasi sudah tersimpan. Pembersihan lokal belum berhasil; tidak perlu kirim ulang." : "Permintaan sudah ditolak. Pembersihan catatan lokal belum berhasil.", saved); return; }
    this.record = null; this.intent = null;
    if (status === "different") this.load();
    else this.update("idle", phase === "confirmed" ? "Operasi tersimpan dan catatan pemulihan lokal sudah bersih." : "Catatan permintaan yang ditolak sudah dibersihkan.", saved);
  }
}
