"""GitHub Pages(공개 저장소)용 암호화 빌드
사용: python build_pages.py <입장코드> <출력폴더(비어 있거나 없는 폴더)>
- 앱 파일 전부를 입장 코드에서 유도한 키(PBKDF2-SHA256 → AES-256-GCM)로 암호화해 enc/<해시>.bin 으로 저장
- index.html(입장 화면) + sw.js(서비스워커가 app/* 요청을 받아 복호화해 응답)
저장소에는 암호문만 올라가므로 코드 없이는 내용과 파일 이름을 알 수 없음
"""
import os, re, sys, hashlib, secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SRC = os.path.dirname(os.path.abspath(__file__))
CODE, OUT = sys.argv[1], sys.argv[2]
_cfg = open(os.path.join(SRC, "js", "content.js"), encoding="utf-8").read()
def _site(k, d):
    m = re.search(k + r'\s*:\s*"([^"]*)"', _cfg)
    return m.group(1) if m else d
TITLE, ICON, KEY = _site("title", "공부노트"), _site("icon", "📘"), _site("key", "studynote")
SALT = KEY + "-v1-" + hashlib.sha256(("salt:" + CODE[:2]).encode()).hexdigest()[:8]
ITER = 200000
key = hashlib.pbkdf2_hmac("sha256", CODE.encode("utf-8"), SALT.encode("utf-8"), ITER, 32)
aes = AESGCM(key)
os.makedirs(os.path.join(OUT, "enc"), exist_ok=True)
assert not [f for f in os.listdir(os.path.join(OUT, "enc"))], "출력 폴더의 enc/ 가 비어 있어야 합니다"

def enc_write(rel, data):
    fid = hashlib.sha256((SALT + rel).encode("utf-8")).hexdigest()[:24]
    iv = secrets.token_bytes(12)
    with open(os.path.join(OUT, "enc", fid + ".bin"), "wb") as f:
        f.write(iv + aes.encrypt(iv, data, None))

files = []
for d in ["css", "js", "img", "content", "vendor"]:
    if not os.path.isdir(os.path.join(SRC, d)):
        continue
    for dp, _, fs in os.walk(os.path.join(SRC, d)):
        for f in fs:
            files.append(os.path.relpath(os.path.join(dp, f), SRC).replace("\\", "/"))
for rel in files:
    enc_write(rel, open(os.path.join(SRC, rel), "rb").read())
idx = open(os.path.join(SRC, "index.html"), encoding="utf-8").read()
idx = idx.replace("<head>", '<head>\n<meta name="robots" content="noindex, nofollow">', 1)
enc_write("index.html", idx.encode("utf-8"))
enc_write("__check__", (KEY + "-ok").encode())

SW = r"""/* 공부노트: app/* 요청을 받아 enc/ 의 암호문을 복호화해 응답 */
const SALT = "%SALT%";
const SCOPE = new URL(self.registration.scope);
const TYPES = { webp: "image/webp", gif: "image/gif", html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", svg: "image/svg+xml", glb: "model/gltf-binary", txt: "text/plain; charset=utf-8", json: "application/json" };
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
function idbKey() {
  return new Promise(res => {
    const r = indexedDB.open("%GATE%", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("k");
    r.onerror = () => res(null);
    r.onsuccess = () => { try { const g = r.result.transaction("k").objectStore("k").get("key"); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); } catch (e) { res(null); } };
  });
}
async function fileId(rel) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT + rel));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 24);
}
function locked() { return Response.redirect(new URL("./?locked", SCOPE).href, 302); }
async function serve(rel) {
  const key = await idbKey();
  if (!key) return locked();
  const r = await fetch(new URL("enc/" + (await fileId(rel)) + ".bin", SCOPE));
  if (!r.ok) return new Response("Not found", { status: 404 });
  const buf = await r.arrayBuffer();
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12));
    const ext = rel.split(".").pop().toLowerCase();
    return new Response(plain, { headers: { "Content-Type": TYPES[ext] || "application/octet-stream", "X-Robots-Tag": "noindex" } });
  } catch (e) { return locked(); }
}
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.origin !== SCOPE.origin) return;
  const appBase = SCOPE.pathname + "app/";
  if (!url.pathname.startsWith(appBase)) return;
  let rel = decodeURIComponent(url.pathname.slice(appBase.length));
  if (!rel || rel.endsWith("/")) rel += "index.html";
  e.respondWith(serve(rel));
});
""".replace("%SALT%", SALT).replace("%GATE%", KEY + "-gate")
open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(SW)

GATE = r"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>%TITLE%</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>%ICON%</text></svg>">
<style>
:root { --bg: #f4f6fb; --ink: #1f2430; --sub: #5d6577; --accent: #5b5bd6; --line: #e3e7ef; --err: #c92a2a; color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--ink);
  font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif; padding: 16px; }
form { background: #fff; border-radius: 18px; box-shadow: 0 6px 30px rgba(20,24,40,.10); padding: 28px 26px; width: min(380px, 100%); display: grid; gap: 12px; }
h1 { margin: 0; font-size: 22px; } p { margin: 0; color: var(--sub); font-size: 14px; line-height: 1.5; }
input { height: 48px; border: 1px solid var(--line); border-radius: 12px; padding: 0 14px; font: inherit; font-size: 17px; }
input:focus { outline: 2px solid var(--accent); border-color: transparent; }
button { height: 48px; border: 0; border-radius: 12px; background: var(--accent); color: #fff; font: inherit; font-size: 16px; font-weight: 700; cursor: pointer; }
button:disabled { opacity: .6; }
.msg { min-height: 20px; font-size: 14px; color: var(--sub); } .msg.err { color: var(--err); }
</style></head>
<body>
<form id="f" autocomplete="off">
  <h1>%ICON% %TITLE%</h1>
  <p>전달받은 입장 코드를 입력하세요. 한 번 입력하면 이 기기에서는 다시 묻지 않아요.</p>
  <input id="code" type="password" placeholder="입장 코드" autocapitalize="off" autocorrect="off" spellcheck="false" required>
  <button type="submit" id="go">들어가기</button>
  <div class="msg" id="msg"></div>
</form>
<script>
const SALT = "%SALT%", ITER = %ITER%;
const $ = id => document.getElementById(id);
function say(t, err) { $("msg").textContent = t; $("msg").className = "msg" + (err ? " err" : ""); }
function db() {
  return new Promise((res, rej) => { const r = indexedDB.open("%GATE%", 1); r.onupgradeneeded = () => r.result.createObjectStore("k"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idb(op, val) {
  const d = await db();
  return new Promise((res, rej) => { const st = d.transaction("k", op === "get" ? "readonly" : "readwrite").objectStore("k");
    const q = op === "get" ? st.get("key") : op === "del" ? st.delete("key") : st.put(val, "key"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function fileId(rel) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT + rel));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("").slice(0, 24);
}
async function keyOk(key) {
  const r = await fetch("enc/" + (await fileId("__check__")) + ".bin", { cache: "no-store" });
  const buf = await r.arrayBuffer();
  try { await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, key, buf.slice(12)); return true; } catch (e) { return false; }
}
async function enter() {
  if (!("serviceWorker" in navigator)) { say("이 브라우저는 지원되지 않아요. 크롬·사파리·삼성 인터넷 최신 버전으로 열어 주세요.", true); return; }
  await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  location.replace("app/index.html" + location.hash);
}
$("f").addEventListener("submit", async e => {
  e.preventDefault(); $("go").disabled = true; say("확인 중…");
  try {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode($("code").value.trim()), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: new TextEncoder().encode(SALT), iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    if (!(await keyOk(key))) { say("코드가 맞지 않아요. 다시 확인해 주세요.", true); $("go").disabled = false; return; }
    await idb("put", key); say("열고 있어요…"); await enter();
  } catch (err) { say("열지 못했어요: " + err.message, true); $("go").disabled = false; }
});
(async () => {
  try {
    const k = await idb("get");
    if (k && !location.search.includes("locked") && (await keyOk(k))) { say("열고 있어요…"); await enter(); }
    else if (location.search.includes("locked")) say("입장 코드를 다시 입력해 주세요.");
  } catch (e) {}
})();
</script>
</body></html>""".replace("%SALT%", SALT).replace("%ITER%", str(ITER)).replace("%GATE%", KEY + "-gate").replace("%TITLE%", TITLE).replace("%ICON%", ICON)
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(GATE)
open(os.path.join(OUT, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")
open(os.path.join(OUT, ".nojekyll"), "w").write("")
open(os.path.join(OUT, "README.md"), "w", encoding="utf-8").write(
    "# " + TITLE + " (암호화 배포본)\n\n개인 학습용. 모든 내용은 입장 코드로 암호화되어 있습니다.\n")
n = len(os.listdir(os.path.join(OUT, "enc")))
sz = sum(os.path.getsize(os.path.join(OUT, "enc", f)) for f in os.listdir(os.path.join(OUT, "enc")))
print("encrypted files", n, "MB", round(sz / 1e6, 1), "salt", SALT)
