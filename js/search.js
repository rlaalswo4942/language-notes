/* 학습노트 엔진 - 검색 터미널 (모든 학습 사이트 공용, app.js / lang.js 다음에 불러옴)
 * 오른쪽 사이드바. 입력하면 구글 검색 탭을 연다 → 브라우저에 로그인된 본인 구글 계정 그대로 사용, 같은 탭 재사용.
 * 인터넷 연결 상태(Wi‑Fi/모바일/오프라인) 표시, 본문과의 경계를 끌어 너비 조절. 열림·너비·최근 검색어는 이 기기에만 저장.
 */
(function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pane = document.createElement("aside"); pane.id = "searchpane";
  pane.innerHTML = `<div class="sp-grip" title="끌어서 너비 조절"></div><div class="sp-head"><b>검색</b><span class="sp-net"></span><button class="icon-btn" data-close title="닫기">✕</button></div>
    <div class="sp-log"></div>
    <form class="sp-in"><span>G</span><input type="search" placeholder="구글에서 검색" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></form>`;
  document.getElementById("app").append(pane);
  const btn = document.createElement("button");
  btn.className = "icon-btn"; btn.id = "search-toggle"; btn.title = "검색 열기/닫기"; btn.textContent = "검색";
  document.querySelector("#topbar .icon-btn[onclick]").before(btn);
  const log = pane.querySelector(".sp-log"), input = pane.querySelector("input"), netEl = pane.querySelector(".sp-net");
  const online = () => navigator.onLine !== false;

  function net() {
    const c = navigator.connection, on = online();
    const kind = c && c.type && { wifi: "Wi‑Fi", cellular: "모바일 데이터", ethernet: "유선" }[c.type];
    netEl.textContent = on ? "온라인" + (kind ? " · " + kind : "") : "오프라인 — 연결 후 검색";
    netEl.classList.toggle("off", !on);
  }
  window.addEventListener("online", net); window.addEventListener("offline", net);
  if (navigator.connection && navigator.connection.addEventListener) navigator.connection.addEventListener("change", net);
  net();

  let hist = Store.get("searchHist", []) || [];
  function render() {
    log.innerHTML = `<div class="ln dim">검색어를 입력하면 <b>구글</b>이 새 탭으로 열립니다. 브라우저에 로그인된 내 구글 계정 그대로 쓰고, 다음 검색도 같은 탭에서 열립니다.</div>`
      + (hist.length ? `<div class="ln dim">최근 검색 <button class="lk" data-clear>지우기</button></div>` + hist.map(h => `<button class="hit" data-q="${esc(h)}"><b>${esc(h)}</b></button>`).join("") : "");
  }
  function google(q) {
    q = q.trim(); if (!q) return;
    if (!online()) return App.toast("인터넷에 연결되어 있지 않아요");
    hist = [q].concat(hist.filter(h => h !== q)).slice(0, 20); Store.set("searchHist", hist); render();
    const w = window.open("https://www.google.com/search?q=" + encodeURIComponent(q), "study-google");
    if (w) w.focus(); else App.toast("팝업이 막혔어요 — 브라우저에서 이 사이트의 팝업을 허용해 주세요");
  }
  pane.querySelector("form").addEventListener("submit", e => { e.preventDefault(); google(input.value); input.value = ""; });
  log.addEventListener("click", e => {
    const h = e.target.closest("[data-q]"); if (h) return google(h.dataset.q);
    if (e.target.closest("[data-clear]")) { hist = []; Store.set("searchHist", hist); render(); }
  });
  function setOpen(open) {
    document.body.classList.toggle("search-open", open); btn.classList.toggle("on", open);
    Store.set("searchOpen", open); setTimeout(App.fit, 280);
    if (open && window.innerWidth >= 900) input.focus({ preventScroll: true });
  }
  // 본문과의 경계(왼쪽 가장자리)를 끌어 너비 조절 — 이 기기에만 저장
  const root = document.documentElement.style;
  const clampW = w => Math.round(Math.max(240, Math.min(window.innerWidth * 0.7, w)));
  const setW = w => root.setProperty("--search-w", clampW(w) + "px");
  const sw = Store.get("searchW", 0); if (sw) setW(sw);
  const grip = pane.querySelector(".sp-grip");
  let gd = null, raf = 0;
  grip.addEventListener("pointerdown", e => {
    e.preventDefault(); grip.setPointerCapture(e.pointerId);
    gd = { x: e.clientX, w: pane.offsetWidth, id: e.pointerId }; document.body.classList.add("sp-resizing");
  });
  grip.addEventListener("pointermove", e => {
    if (!gd || e.pointerId !== gd.id) return;
    setW(gd.w - (e.clientX - gd.x));
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; App.fit(); });
  });
  const gEnd = e => {
    if (!gd || e.pointerId !== gd.id) return;
    gd = null; document.body.classList.remove("sp-resizing");
    Store.set("searchW", pane.offsetWidth); App.fit();
  };
  grip.addEventListener("pointerup", gEnd); grip.addEventListener("pointercancel", gEnd);
  btn.addEventListener("click", () => setOpen(!document.body.classList.contains("search-open")));
  pane.querySelector("[data-close]").addEventListener("click", () => setOpen(false));
  render();
  if (Store.get("searchOpen", false) && window.innerWidth >= 900) setOpen(true);
})();
