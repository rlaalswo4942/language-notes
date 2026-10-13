/* 저장소: 브라우저 저장(localStorage) + 동기화 백엔드
 *  - sync  : 웹 배포판. 동기화 코드로 연결한 기기끼리 Vercel API(Neon DB)로 실시간 공유 (3초 간격 수신, 0.7초 뒤 송신)
 *  - server: server.py(노트북 로컬 서버)로 열었을 때, notes_data/state.json 공유
 *  - local : 그 외, 이 기기에만 저장
 * 각 키는 {t: 수정시각, v: 값}. 더 최근 값이 이김. 동기화 코드는 저장하지 않고 sha256 해시(space)만 보관.
 */
(function () {
  const KEY = (window.SITE && SITE.key) || "studynote";
  const PREFIX = KEY + ":";
  const SPACE_KEY = KEY + "-sync-space";
  const API = window.SITE && SITE.syncApi;
  const LOCAL_ONLY = new Set(["sideOpen", "inkopts", "quizSession", "searchOpen", "searchHist", "searchW"]); // 기기마다 다른 게 자연스러운 설정
  const POLL_MS = 3000;
  const mem = {};
  let mode = "local";
  let space = null, since = 0, pollTimer = null, polling = false;
  const pending = {};
  let flushTimer = null, flushing = false;
  const listeners = [];

  function lsGet(k) {
    try { const s = localStorage.getItem(PREFIX + k); return s ? JSON.parse(s) : mem[k] || null; } catch (e) { return mem[k] || null; }
  }
  function lsSet(k, rec) {
    mem[k] = rec;
    try { localStorage.setItem(PREFIX + k, JSON.stringify(rec)); } catch (e) { /* 저장 불가 환경: 메모리에만 */ }
  }
  function lsKeys() {
    const out = new Set(Object.keys(mem));
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) out.add(k.slice(PREFIX.length)); } } catch (e) {}
    return [...out];
  }
  const remote = () => mode === "sync" || mode === "server";

  /* 진도 초기화: SITE.resetEpoch 값이 바뀌면 각 기기에서 처음 열 때 한 번 진도 기록을 지움 (필기·포스트잇은 유지) */
  (function resetOnce() {
    const epoch = window.SITE && SITE.resetEpoch; if (!epoch) return;
    const EK = KEY + "-reset-epoch";
    if (lsRaw(EK) === epoch) return;
    // resetKeys: "*" = 필기·포스트잇·설정까지 이 사이트의 모든 기록, 생략 = 진도만
    const keys = SITE.resetKeys === "*" ? lsKeys() : (SITE.resetKeys || ["checks", "goals", "quiz", "last", "calc"]);
    // 빈 값을 '지금' 시각으로 기록 → 동기화할 때 서버·다른 기기의 예전 진도보다 최신이라 초기화가 함께 퍼짐
    const now = Date.now();
    keys.forEach(k => lsSet(k, { t: now, v: null }));
    lsRawSet(EK, epoch);
  })();
  function lsRaw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsRawSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }

  const Store = {
    get(k, def) { const r = lsGet(k); return r && r.v != null ? r.v : def; },
    set(k, v) {
      const rec = { t: Date.now(), v };
      lsSet(k, rec);
      if (remote() && !LOCAL_ONLY.has(k)) { pending[k] = rec; scheduleFlush(); }
    },
    mode() { return mode; },
    exportAll() { const o = {}; lsKeys().forEach(k => (o[k] = lsGet(k))); return o; },
    importAll(o) {
      const changed = [];
      Object.keys(o || {}).forEach(k => { const r = o[k]; if (r && typeof r === "object" && "v" in r) { const rec = { t: Date.now(), v: r.v }; lsSet(k, rec); changed.push(k); if (remote() && !LOCAL_ONLY.has(k)) pending[k] = rec; } });
      scheduleFlush();
      return changed.length;
    },
    onRemote(fn) { listeners.push(fn); },
    syncAvailable() { return !!API && !!(window.crypto && crypto.subtle); },
    syncConnected() { return mode === "sync"; },
    /* 동기화 코드 연결: 같은 코드를 입력한 기기끼리 필기·체크·퀴즈 기록 공유 */
    async syncConnect(code) {
      const sp = await sha256hex(KEY + ":" + code.trim());
      lsRawSet(SPACE_KEY, sp);
      stopPoll(); space = null; since = 0;
      const ok = await initSync().catch(() => false);
      if (!ok) { lsRawSet(SPACE_KEY, null); mode = "local"; }
      return ok;
    },
    syncDisconnect() { stopPoll(); flush(); lsRawSet(SPACE_KEY, null); space = null; mode = "local"; setSync("이 기기에만 저장 (동기화 꺼짐)"); },
    async flushNow() { await flush(); },
    async init() {
      if (API && lsRaw(SPACE_KEY)) { const ok = await initSync().catch(() => false); if (ok) return mode; }
      // 로컬 서버(server.py)일 때만 로컬 동기화 API 사용
      if (/^http:\/\/(localhost|127\.|192\.168\.|10\.|172\.)/.test(location.href) && await initServer().catch(() => false)) return (mode = "server");
      return (mode = "local");
    }
  };

  async function sha256hex(s) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }

  function merge(remoteMap) {
    const changed = [];
    Object.keys(remoteMap).forEach(k => {
      if (LOCAL_ONLY.has(k)) return;
      const l = lsGet(k), rr = remoteMap[k];
      if (rr && typeof rr.t === "number" && (!l || rr.t > l.t) && !pending[k]) { lsSet(k, rr); changed.push(k); }
    });
    if (changed.length) listeners.forEach(fn => { try { fn(changed); } catch (e) { console.error(e); } });
    return changed;
  }
  function queueNewerLocal(remoteMap) {
    lsKeys().forEach(k => { if (LOCAL_ONLY.has(k)) return; const l = lsGet(k), rr = remoteMap[k]; if (l && (!rr || l.t > rr.t)) pending[k] = l; });
    scheduleFlush();
  }

  /* ── sync (Vercel API + Neon) ── */
  async function initSync() {
    if (!Store.syncAvailable()) return false;
    space = lsRaw(SPACE_KEY);
    if (!space) return false;
    // 처음 연결: 서버의 전체 기록을 받아 병합 → 이 기기에만 있던 최신 기록은 올림
    const r = await fetch(`${API}?space=${space}&since=0`, { cache: "no-store" });
    if (!r.ok) throw new Error("sync " + r.status);
    const j = await r.json();
    mode = "sync";
    since = j.now || 0;
    merge(j.items || {});
    queueNewerLocal(j.items || {});
    startPoll();
    setSync("실시간 동기화 중");
    return true;
  }
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(() => { if (!document.hidden) poll(); }, POLL_MS);
  }
  function stopPoll() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
  async function poll() {
    if (mode !== "sync" || polling) return;
    polling = true;
    try {
      const r = await fetch(`${API}?space=${space}&since=${since}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      since = Math.max(since, j.now || 0);
      merge(j.items || {});
      setSync("실시간 동기화 중");
    } catch (e) { setSync("동기화 서버 연결 끊김 — 이 기기에 저장 후 다시 보냄"); }
    finally { polling = false; }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && mode === "sync") poll(); });
  window.addEventListener("online", () => { if (mode === "sync") { poll(); scheduleFlush(); } });

  /* ── server (server.py) ── */
  async function initServer() {
    const r = await fetch("api/state", { cache: "no-store" });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) return false;
    const remoteMap = await r.json();
    mode = "server";
    merge(remoteMap);
    queueNewerLocal(remoteMap);
    setInterval(pollServer, 15000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pollServer(); });
    return true;
  }
  async function pollServer() {
    try { const r = await fetch("api/state", { cache: "no-store" }); if (r.ok) merge(await r.json()); setSync("기기 간 동기화 중 (노트북 서버)"); } catch (e) { setSync("서버 연결 끊김 — 이 기기에 임시 저장"); }
  }

  function scheduleFlush() { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 700); }
  async function flush() {
    const keys = Object.keys(pending);
    if (!keys.length || !remote()) return;
    if (flushing) { scheduleFlush(); return; }
    flushing = true;
    const body = {}; keys.forEach(k => (body[k] = pending[k]));
    const url = mode === "sync" ? `${API}?space=${space}` : "api/state";
    try {
      const r = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: JSON.stringify(body).length < 60000 });
      if (r.ok) { keys.forEach(k => { if (pending[k] === body[k]) delete pending[k]; }); setSync(mode === "sync" ? "실시간 동기화 중" : "기기 간 동기화 중 (노트북 서버)"); }
      else { setSync("저장 실패 — 이 기기에 임시 저장, 잠시 후 다시 보냄"); setTimeout(scheduleFlush, 4000); }
    } catch (e) { setSync("연결 끊김 — 이 기기에 임시 저장, 잠시 후 다시 보냄"); setTimeout(scheduleFlush, 4000); }
    finally { flushing = false; }
  }
  function setSync(text) { const el = document.getElementById("sync-state"); if (el) el.textContent = text; }
  window.addEventListener("pagehide", () => { if (Object.keys(pending).length) flush(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && Object.keys(pending).length) flush(); });
  window.Store = Store;
})();
