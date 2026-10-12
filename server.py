"""학습노트 로컬 서버
- 노트북에서 실행하면 http://localhost:8780 로 열림
- 같은 와이파이의 아이패드/갤럭시탭은 화면에 표시되는 http://<노트북IP>:8780 로 접속
- 필기·체크리스트는 notes_data/state.json 에 저장되어 모든 기기가 공유
"""
import json, os, socket, sys, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "notes_data")
DATA = os.path.join(DATA_DIR, "state.json")
PORT = int(os.environ.get("STUDY_PORT", "8780"))
lock = threading.Lock()
os.makedirs(DATA_DIR, exist_ok=True)


def load():
    try:
        with open(DATA, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save(state):
    tmp = DATA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, DATA)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        if self.path.startswith("/api/") or self.path.endswith((".html", ".js", ".css")) or self.path == "/":
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/state":
            with lock:
                return self._json(200, load())
        if self.path.startswith("/notes_data"):
            return self._json(403, {"error": "forbidden"})
        return super().do_GET()

    def _update(self):
        if self.path.split("?")[0] != "/api/state":
            return self._json(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        try:
            incoming = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return self._json(400, {"error": "bad json"})
        with lock:
            state = load()
            for k, rec in incoming.items():
                if isinstance(rec, dict) and "t" in rec and (k not in state or rec["t"] >= state[k].get("t", 0)):
                    state[k] = rec
            save(state)
        return self._json(200, {"ok": True})

    do_PUT = _update
    do_POST = _update


def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127."):
                ips.add(ip)
    except Exception:
        pass
    return sorted(ips)


if __name__ == "__main__":
    try:
        srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    except OSError:
        print(f"포트 {PORT}가 이미 사용 중입니다. (이미 서버가 켜져 있을 수 있어요)")
        sys.exit(1)
    print("=" * 56)
    print(" 학습노트 서버 실행 중  (이 창을 닫으면 종료)")
    print(f"  노트북:  http://localhost:{PORT}")
    for ip in lan_ips():
        print(f"  태블릿:  http://{ip}:{PORT}   (같은 와이파이)")
    print("  필기 저장 위치:", DATA)
    print("=" * 56)
    srv.serve_forever()
