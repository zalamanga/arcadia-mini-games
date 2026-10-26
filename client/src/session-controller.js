export class SessionController {
  constructor(api) {
    this.api = api; this.listeners = new Set(); this.generation = 0; this.readTicket = 0; this.authPending = false;
    this.state = Object.freeze({ status: "loading", user: null, busy: false, message: "Memeriksa sesi akun.", generation: 0 });
  }
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.state;
  set(status, user, busy, message = "", newSession = false) {
    if (newSession || this.state.user?.id !== user?.id) this.generation++;
    this.state = Object.freeze({ status, user, busy, message, generation: this.generation });
    for (const listener of this.listeners) listener();
  }
  capture() {
    const actorId = this.state.user?.id ?? null, generation = this.generation;
    return { ...(actorId === null ? {} : { actorId }), isCurrent: () => this.generation === generation && (this.state.user?.id ?? null) === actorId };
  }
  async refresh({ discover = false } = {}) {
    if (this.authPending) return;
    const ticket = ++this.readTicket, captured = this.capture();
    this.readAbort?.abort(); this.readAbort = new AbortController();
    try {
      const account = await this.api.session({ ...(discover ? { isCurrent: captured.isCurrent } : captured), signal: this.readAbort.signal });
      if (ticket !== this.readTicket || !captured.isCurrent()) return;
      this.set(account ? "authenticated" : "guest", account, false);
    } catch {
      if (ticket === this.readTicket && captured.isCurrent()) this.set("error", this.state.user, false, "Sesi belum dapat diperiksa. Akun lama tidak dianggap keluar dan skor baru hanya lokal.");
    }
  }
  async authenticate(mode, body) {
    if (this.authPending || this.state.busy || this.state.user || !["guest"].includes(this.state.status)) return false;
    this.authPending = true; this.readTicket++; this.readAbort?.abort();
    const captured = this.capture(); this.set("guest", null, true, "Memeriksa akun.");
    try {
      const account = await this.api.authenticate(mode, body, captured);
      if (!captured.isCurrent()) return false;
      this.set("authenticated", account, false, "", true); return true;
    } catch (error) {
      if (!captured.isCurrent()) return false;
      if (error.status >= 400 && error.status < 500 && !error.outcomeUnknown) this.set("guest", null, false, error.message);
      else this.set("auth-unknown", null, false, "Hasil login/pendaftaran belum pasti. Periksa sesi sebelum mengirim password lagi.");
      return false;
    } finally { this.authPending = false; }
  }
  async logout() {
    if (this.authPending || !this.state.user) return;
    this.authPending = true; this.readTicket++; this.readAbort?.abort();
    const captured = this.capture(); this.set(this.state.status, this.state.user, true, "Mencabut sesi yang dikirim.");
    try {
      await this.api.logout(captured);
      if (captured.isCurrent()) this.set("guest", null, false, "Sesi yang dikirim sudah dicabut.", true);
    } catch {
      if (captured.isCurrent()) this.set("error", this.state.user, false, "Logout belum dapat dikonfirmasi. Periksa sesi; cookie akun yang lebih baru tidak dihapus.");
    } finally { this.authPending = false; }
  }
  close() { this.readTicket++; this.readAbort?.abort(); this.listeners.clear(); }
}
