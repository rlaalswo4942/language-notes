/* 필기 엔진: 펜 · 형광펜 · 가림펜(탭하면 보임) · 지우개 + 스냅
 * 좌표는 1000px 고정폭 페이지 기준으로 저장 → 노트북/태블릿 어디서 봐도 같은 위치
 */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const PEN_COLORS = ["#1f2937", "#e03131", "#1971c2", "#2f9e44", "#7048e8", "#f08c00", "#d6336c", "#0c8599", "#868e96"];
  const HL_COLORS = ["#ffe066", "#8ce99a", "#ffa8c5", "#a5d8ff", "#ffc078", "#d0bfff"];
  const MASK_COLORS = ["#3a3a3c", "#6c5ce7", "#e8590c", "#0c8599"];
  const WIDTHS = { pen: [2, 3.5, 6], hl: [12, 20, 30], mask: [14, 22, 34] };
  const RANGES = { pen: [1, 16, 0.5], hl: [6, 44, 1], mask: [8, 48, 1] }; // 굵기 슬라이더 최소·최대·간격
  // 무채색 선 아이콘 (stroke = currentColor)
  const svg = d => `<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICO = {
    read: svg('<path d="M5 3l12 7-5.5 1.5L9 17z"/><path d="M11.5 11.5L16 18"/>'),
    pen: svg('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'),
    hl: svg('<path d="M9 15l-3 3h5l1-1"/><path d="M9 15l6-10 4 2.5-5 10z"/><path d="M4 21h16" stroke-width="2.6" opacity=".35"/>'),
    mask: svg('<rect x="3.5" y="8" width="17" height="8" rx="2"/><path d="M7 12h10" stroke-width="3" opacity=".35"/>'),
    eraser: svg('<path d="M7 19l-3-3 9.5-9.5a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L12 18"/><path d="M7 19h12"/><path d="M8.5 11l5 5"/>'),
    undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-4"/>'),
    redo: svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h4"/>'),
    snap: svg('<path d="M6 4v7a6 6 0 0012 0V4"/><path d="M6 8h4M14 8h4"/>'),
    penOnly: svg('<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M3 3l18 18" opacity=".5"/>'),
    reveal: svg('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>'),
    clear: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    collapse: svg('<path d="M8 9l4-4 4 4M8 15l4 4 4-4"/>'),
    note: svg('<path d="M5 4h14v10l-5 6H5z"/><path d="M14 20v-6h5"/><path d="M8.5 9h7M8.5 12h4"/>')
  };
  const TOOLS = [
    { id: "read", ico: ICO.read, lab: "읽기", key: "v" },
    { id: "pen", ico: ICO.pen, lab: "펜", key: "p" },
    { id: "hl", ico: ICO.hl, lab: "형광펜", key: "h" },
    { id: "mask", ico: ICO.mask, lab: "가림펜", key: "m" },
    { id: "eraser", ico: ICO.eraser, lab: "지우개", key: "e" }
  ];
  const defOpts = { tool: "read", pen: { c: PEN_COLORS[0], w: 3.5 }, hl: { c: HL_COLORS[0], w: 20 }, mask: { c: MASK_COLORS[0], w: 22 }, snap: true, penOnly: false, collapsed: false };
  let opts = Object.assign({}, defOpts, Store.get("inkopts", {}));
  opts.tool = "read";

  let C = null; // 현재 페이지 컨텍스트
  let N = null; // 포스트잇 { layer, items, drag }
  let bar, pop, dot;
  let saveTimer = null;

  /* ── 툴바 ── */
  function buildBar() {
    bar = document.createElement("div"); bar.id = "drawbar"; bar.className = "hidden";
    pop = document.createElement("div"); pop.id = "drawopts";
    dot = document.createElement("div"); dot.className = "eraser-dot";
    let h = "";
    TOOLS.forEach(t => (h += `<button class="tb" data-tool="${t.id}" title="${t.lab} (${t.key.toUpperCase()})">${t.ico}<small>${t.lab}</small>${t.id === "pen" || t.id === "hl" || t.id === "mask" ? '<i class="cdot"></i>' : ""}</button>`));
    h += `<button class="tb" data-act="note" title="포스트잇 붙이기 — 위 막대를 끌어 이동, 가장자리를 끌어 크기 조절">${ICO.note}<small>포스트잇</small></button>`;
    h += `<hr><button class="tb" data-act="undo" title="실행취소 (Ctrl+Z)">${ICO.undo}<small>취소</small></button>
      <button class="tb" data-act="redo" title="다시실행 (Ctrl+Y)">${ICO.redo}<small>재실행</small></button><hr>
      <button class="tb toggle" data-act="snap" title="형광펜·가림펜을 글자/그림 크기에 맞춤">${ICO.snap}<small>스냅</small></button>
      <button class="tb toggle" data-act="penOnly" title="손가락은 스크롤, 펜으로만 필기 (아이패드/갤럭시탭)">${ICO.penOnly}<small>펜전용</small></button>
      <button class="tb" data-act="reveal" title="이 페이지의 가림 전체 보기/가리기">${ICO.reveal}<small>전체보기</small></button>
      <button class="tb" data-act="clear" title="이 페이지 필기 모두 지우기">${ICO.clear}<small>전체삭제</small></button><hr>
      <button class="tb keep" data-act="collapse" title="툴바 접기/펼치기">${ICO.collapse}<small>접기</small></button>`;
    bar.innerHTML = h;
    document.body.append(bar, pop);
    bar.addEventListener("click", e => {
      const b = e.target.closest(".tb"); if (!b) return;
      if (b.dataset.tool) {
        const t = b.dataset.tool;
        if (t === opts.tool && (t === "pen" || t === "hl" || t === "mask")) { togglePop(); return; }
        setTool(t);
        if (t === "pen" || t === "hl" || t === "mask") showPop(); else hidePop();
        return;
      }
      const a = b.dataset.act;
      if (a === "undo") undo();
      else if (a === "redo") redo();
      else if (a === "snap") { opts.snap = !opts.snap; saveOpts(); syncBar(); App.toast(opts.snap ? "스냅 켜짐: 형광펜·가림펜이 글자/그림 크기에 맞춰집니다" : "스냅 꺼짐: 그린 모양 그대로"); }
      else if (a === "penOnly") { opts.penOnly = !opts.penOnly; saveOpts(); syncBar(); App.toast(opts.penOnly ? "펜 전용: 손가락으로는 스크롤, 펜으로만 필기" : "펜 전용 꺼짐: 손가락으로도 필기"); }
      else if (a === "note") addNote();
      else if (a === "reveal") revealAll();
      else if (a === "clear") clearPage();
      else if (a === "collapse") { opts.collapsed = !opts.collapsed; saveOpts(); syncBar(); hidePop(); }
    });
    pop.addEventListener("click", e => {
      const sw = e.target.closest("[data-c]"), wd = e.target.closest("[data-w]");
      const o = opts[opts.tool]; if (!o || (!sw && !wd)) return; // 슬라이더·색 고르기 클릭은 다시 그리지 않음
      if (sw) o.c = sw.dataset.c;
      if (wd) o.w = +wd.dataset.w;
      saveOpts(); renderPop(); syncBar();
    });
    // 굵기 슬라이더·자유 색상: 드래그 중엔 미리보기만 갱신, 손을 떼면 저장
    pop.addEventListener("input", e => {
      const o = opts[opts.tool]; if (!o) return;
      if (e.target.matches("[data-range]")) o.w = +e.target.value;
      else if (e.target.matches("[data-pick]")) o.c = e.target.value;
      else return;
      const p = pop.querySelector(".prev path"); if (p) { p.setAttribute("stroke-width", o.w); p.setAttribute("stroke", o.c); }
      const wv = pop.querySelector(".wv"); if (wv) wv.textContent = o.w;
      pop.querySelectorAll(".wd").forEach(b => b.classList.toggle("on", +b.dataset.w === o.w));
      syncBar();
    });
    pop.addEventListener("change", e => { if (e.target.matches("[data-range], [data-pick]")) { saveOpts(); renderPop(); } });
    document.addEventListener("keydown", e => {
      if (!C || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") { setTool("read"); hidePop(); return; }
      const t = TOOLS.find(t => t.key === e.key.toLowerCase());
      if (t) { setTool(t.id); hidePop(); }
    });
    document.addEventListener("pointerdown", e => { if (pop.classList.contains("show") && !pop.contains(e.target) && !bar.contains(e.target)) hidePop(); }, true);
    syncBar();
  }
  function syncBar() {
    bar.querySelectorAll("[data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === opts.tool));
    bar.querySelector('[data-act="snap"]').classList.toggle("on", opts.snap);
    bar.querySelector('[data-act="penOnly"]').classList.toggle("on", opts.penOnly);
    ["pen", "hl", "mask"].forEach(t => { const d = bar.querySelector(`[data-tool="${t}"] .cdot`); if (d) d.style.background = opts[t].c; });
    bar.classList.toggle("collapsed", opts.collapsed);
    const cb = bar.querySelector('[data-act="collapse"] small'); cb.textContent = opts.collapsed ? "펼치기" : "접기";
    if (opts.collapsed) { const cur = bar.querySelector(`[data-tool="${opts.tool}"]`); bar.querySelectorAll(".tb").forEach(b => b.classList.toggle("keep", b === cur || b.dataset.act === "collapse")); }
    else bar.querySelectorAll(".tb").forEach(b => b.classList.toggle("keep", b.dataset.act === "collapse"));
    document.body.className = document.body.className.replace(/\btool-\w+\b/g, "").trim();
    document.body.classList.add("tool-" + opts.tool);
    document.body.classList.toggle("drawing", !!C && opts.tool !== "read");
  }
  function renderPop() {
    const t = opts.tool, o = opts[t]; if (!o) return;
    const cols = t === "pen" ? PEN_COLORS : t === "hl" ? HL_COLORS : MASK_COLORS;
    const custom = !cols.includes(o.c), [rmin, rmax, rstep] = RANGES[t];
    let h = `<div class="lab">${t === "pen" ? "펜" : t === "hl" ? "형광펜" : "가림펜 (탭하면 보였다/가렸다)"} 색상</div><div class="row">`;
    cols.forEach(c => (h += `<button class="sw ${o.c === c ? "on" : ""}" data-c="${c}" style="background:${c}"></button>`));
    h += `<label class="sw pick ${custom ? "on" : ""}" title="원하는 색 고르기" style="${custom ? "background:" + o.c : ""}"><input type="color" data-pick value="${o.c}"></label>`;
    h += `</div><div class="lab">굵기 <b class="wv">${o.w}</b>${t !== "pen" ? " <small>(스냅 꺼졌을 때)</small>" : ""}</div><div class="row">`;
    WIDTHS[t].forEach(w => (h += `<button class="wd ${o.w === w ? "on" : ""}" data-w="${w}"><i style="height:${Math.max(2, Math.min(14, w / (t === "pen" ? 1 : 2.4)))}px;${t === "hl" ? "background:" + o.c : ""}"></i></button>`));
    h += `</div><input class="wr" type="range" data-range min="${rmin}" max="${rmax}" step="${rstep}" value="${o.w}">
      <div class="prev"><svg viewBox="0 0 160 30"><path d="M8 20 Q 45 4 80 15 T 152 10" fill="none" stroke="${o.c}" stroke-width="${o.w}" stroke-linecap="round" opacity="${t === "hl" ? 0.5 : 1}"/></svg></div>`;
    pop.innerHTML = h;
    const b = bar.querySelector(`[data-tool="${t}"]`).getBoundingClientRect();
    pop.style.top = Math.max(60, b.top - 10) + "px";
  }
  function showPop() { renderPop(); pop.classList.add("show"); }
  function hidePop() { pop.classList.remove("show"); }
  function togglePop() { pop.classList.contains("show") ? hidePop() : showPop(); }
  function saveOpts() { const o = Object.assign({}, opts); delete o.tool; Store.set("inkopts", o); }
  function setTool(t) { opts.tool = t; syncBar(); }

  /* ── 페이지 연결 ── */
  function attach(page, key, getScale, scroller) {
    detach();
    if (!bar) buildBar();
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "ink");
    const cap = document.createElement("div"); cap.className = "ink-capture";
    const layer = document.createElement("div"); layer.className = "postit-layer";
    page.append(svg, cap, dot, layer);
    C = { page, svg, cap, key, getScale, scroller, items: load(key), undo: [], redo: [], cur: null, erasing: null, scroll: null, anchors: [], amap: {} };
    N = { layer, items: [], drag: null };
    buildAnchors(); migrate();
    N.items = loadNotes();
    layer.addEventListener("pointermove", onNoteMove);
    layer.addEventListener("pointerup", onNoteUp);
    layer.addEventListener("pointercancel", onNoteUp);
    cap.addEventListener("pointerdown", onDown);
    cap.addEventListener("pointermove", onMove);
    cap.addEventListener("pointerup", onUp);
    cap.addEventListener("pointercancel", onUp);
    cap.addEventListener("contextmenu", e => e.preventDefault());
    svg.addEventListener("click", e => {
      const g = e.target.closest(".mask"); if (!g) return;
      e.stopPropagation();
      const it = C.items.find(i => i.id === g.dataset.id); if (it) { it.open = !it.open; renderAll(); save(); }
    });
    bar.classList.remove("hidden");
    resize(); renderAll(); syncBar();
  }
  function detach() {
    if (!C) return;
    flushSave(); flushNotes();
    C.svg.remove(); C.cap.remove();
    if (N) N.layer.remove();
    C = null; N = null;
    if (bar) { bar.classList.add("hidden"); hidePop(); }
    document.body.classList.remove("drawing");
  }
  function resize() {
    if (!C) return;
    const h = C.page.offsetHeight;
    C.svg.setAttribute("width", 1000); C.svg.setAttribute("height", h);
    C.svg.setAttribute("viewBox", `0 0 1000 ${h}`);
    buildAnchors(); renderAll(); renderNotes(); // 레이아웃이 바뀌면 비율 좌표를 다시 계산해 제자리에
  }
  function load(key) { return (Store.get("ink:" + key, []) || []).slice(); }
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 350); }
  function flushSave() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; if (C) Store.set("ink:" + C.key, C.items); } }
  function reloadRemote(keys) {
    if (!C) return;
    if (keys.includes("ink:" + C.key) && !C.cur) { C.items = load(C.key); renderAll(); }
    if (N && keys.includes("notes:" + C.key) && !N.drag && !(document.activeElement && N.layer.contains(document.activeElement))) { N.items = loadNotes(); renderNotes(); }
  }

  /* ── 비율 좌표: 필기·포스트잇은 '들어 있는 섹션 상자' 기준 0~1 비율로 저장
   *    → 기기마다 글꼴·줄바꿈이 달라 섹션 높이가 변해도 섹션 안의 같은 자리에 표시 ── */
  const R5 = v => Math.round(v * 100000) / 100000;
  function buildAnchors() {
    const list = [];
    for (const el of C.page.children) {
      if (!el.id || el === C.svg || el === C.cap) continue;
      list.push({ id: el.id, x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth || 1, h: el.offsetHeight || 1 });
    }
    C.anchors = list; C.amap = {}; list.forEach(a => (C.amap[a.id] = a));
  }
  function anchorAt(p) {
    let best = null, bd = Infinity;
    for (const a of C.anchors) {
      const d = p[1] < a.y ? a.y - p[1] : p[1] > a.y + a.h ? p[1] - a.y - a.h : 0;
      if (d < bd) { bd = d; best = a; }
      if (!d) break;
    }
    return best || { id: "", x: 0, y: 0, w: 1000, h: C.page.offsetHeight };
  }
  const pageBox = () => ({ x: 0, y: 0, w: 1000, h: C.page.offsetHeight || 1 });
  const boxOf = id => (id && C.amap[id]) || pageBox(); // 기준 섹션이 없어졌으면 페이지 전체 기준
  const relPts = (a, pts) => pts.map(p => [R5((p[0] - a.x) / a.w), R5((p[1] - a.y) / a.h)]);
  const relRects = (a, rs) => rs.map(r => [R5((r[0] - a.x) / a.w), R5((r[1] - a.y) / a.h), R5(r[2] / a.w), R5(r[3] / a.h)]);
  // 저장된 항목 → 지금 화면의 페이지 좌표 (a 없는 예전 형식은 절대 좌표 그대로)
  function geo(it) {
    if (!("a" in it)) return it;
    const a = boxOf(it.a);
    return { pts: it.pts && it.pts.map(p => [a.x + p[0] * a.w, a.y + p[1] * a.h]), rects: it.rects && it.rects.map(r => [a.x + r[0] * a.w, a.y + r[1] * a.h, r[2] * a.w, r[3] * a.h]) };
  }
  // 예전(절대 좌표) 필기는 처음 열 때 현재 레이아웃 기준 비율로 바꿔 저장
  function migrate() {
    let n = 0;
    C.items.forEach(it => {
      if ("a" in it) return;
      const src = it.pts ? it.pts[0] : it.rects && it.rects[0];
      if (!src) return;
      const a = anchorAt(src);
      if (it.pts) it.pts = relPts(a, it.pts);
      if (it.rects) it.rects = relRects(a, it.rects);
      it.a = a.id; n++;
    });
    if (n) save();
  }

  /* ── 렌더 ── */
  function smooth(pts) {
    if (!pts.length) return "";
    if (pts.length < 3) return `M${pts[0][0]} ${pts[0][1]} L${pts[pts.length - 1][0] + 0.01} ${pts[pts.length - 1][1]}`;
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += ` Q${pts[i][0]} ${pts[i][1]} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    const l = pts[pts.length - 1];
    return d + ` L${l[0]} ${l[1]}`;
  }
  function el(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
  const GEO = new WeakMap(); // 항목 → 이번 렌더의 페이지 좌표 (지우개·가림 탭 판정용)
  function renderItem(item) {
    const gp = geo(item); GEO.set(item, gp);
    const it = { ...item, pts: gp.pts, rects: gp.rects };
    const g = el("g", { "data-id": it.id });
    if (it.k === "pen") {
      g.append(el("path", { d: smooth(it.pts), fill: "none", stroke: it.c, "stroke-width": it.w, "stroke-linecap": "round", "stroke-linejoin": "round" }));
    } else if (it.k === "hl") {
      g.setAttribute("class", "hl");
      g.append(el("path", { d: smooth(it.pts), fill: "none", stroke: it.c, "stroke-width": it.w, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.5 }));
    } else if (it.k === "hlr") {
      g.setAttribute("class", "hl");
      it.rects.forEach(r => g.append(el("rect", { x: r[0], y: r[1], width: r[2], height: r[3], rx: 3, fill: it.c, opacity: 0.55 })));
    } else if (it.k === "mask") {
      g.setAttribute("class", "mask" + (it.open ? " open" : ""));
      g.append(el("path", { d: smooth(it.pts), fill: "none", stroke: it.c, "stroke-width": it.w, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: it.open ? 0.16 : 1, "stroke-dasharray": it.open ? "2 6" : "none" }));
      // 터치 영역 확보
      g.append(el("path", { d: smooth(it.pts), fill: "none", stroke: "transparent", "stroke-width": it.w + 10 }));
    } else if (it.k === "maskr") {
      g.setAttribute("class", "mask" + (it.open ? " open" : ""));
      it.rects.forEach(r => {
        if (it.open) g.append(el("rect", { x: r[0], y: r[1], width: r[2], height: r[3], rx: 4, fill: it.c, "fill-opacity": 0.1, stroke: it.c, "stroke-width": 1.5, "stroke-dasharray": "5 4" }));
        else {
          g.append(el("rect", { x: r[0], y: r[1], width: r[2], height: r[3], rx: 4, fill: it.c }));
          if (r[2] > 26 && r[3] > 14) { const tx = el("text", { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 + 5, "text-anchor": "middle", fill: "rgba(255,255,255,.75)", "font-size": Math.min(15, r[3] * 0.8), "font-weight": 800 }); tx.textContent = "?"; g.append(tx); }
        }
      });
    }
    return g;
  }
  function renderAll() {
    if (!C) return;
    const live = C.svg.querySelector(".live");
    C.svg.innerHTML = "";
    // 형광펜 → 가림 → 펜 순으로 쌓기
    const order = { hl: 0, hlr: 0, mask: 1, maskr: 1, pen: 2 };
    C.items.slice().sort((a, b) => order[a.k] - order[b.k]).forEach(it => C.svg.append(renderItem(it)));
    if (live) C.svg.append(live);
  }

  /* ── 입력 ── */
  function toPage(e) {
    const r = C.page.getBoundingClientRect(), s = C.getScale();
    return [Math.round((e.clientX - r.left) / s * 10) / 10, Math.round((e.clientY - r.top) / s * 10) / 10];
  }
  function onDown(e) {
    if (!C) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    C.cap.setPointerCapture(e.pointerId);
    if (opts.penOnly && e.pointerType === "touch") { C.scroll = { y: e.clientY, top: C.scroller.scrollTop, id: e.pointerId }; return; }
    if (C.cur || C.erasing) return;
    const p = toPage(e);
    if (opts.tool === "eraser") { C.erasing = { removed: [] }; eraseAt(p); moveDot(p); return; }
    const o = opts[opts.tool];
    C.cur = { pts: [p], t0: performance.now(), id: e.pointerId, path: null };
    const live = el("path", { class: "live", fill: "none", stroke: o.c, "stroke-width": o.w, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: opts.tool === "pen" ? 1 : opts.tool === "hl" ? 0.5 : 0.85 });
    if (opts.tool === "hl") live.style.mixBlendMode = "multiply";
    C.svg.append(live); C.cur.path = live;
  }
  function onMove(e) {
    if (!C) return;
    if (C.scroll && e.pointerId === C.scroll.id) { C.scroller.scrollTop = C.scroll.top - (e.clientY - C.scroll.y); return; }
    if (C.erasing) { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; evs.forEach(ev => eraseAt(toPage(ev))); moveDot(toPage(e)); return; }
    if (opts.tool === "eraser" && e.pointerType === "mouse") moveDot(toPage(e));
    if (!C.cur || e.pointerId !== C.cur.id) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    const s = C.getScale();
    evs.forEach(ev => {
      const p = toPage(ev), l = C.cur.pts[C.cur.pts.length - 1];
      if (Math.hypot(p[0] - l[0], p[1] - l[1]) * s >= 1.5) C.cur.pts.push(p);
    });
    C.cur.path.setAttribute("d", smooth(C.cur.pts));
  }
  function onUp(e) {
    if (!C) return;
    if (C.scroll && e.pointerId === C.scroll.id) { C.scroll = null; return; }
    if (C.erasing) {
      if (C.erasing.removed.length) { C.undo.push({ op: "del", items: C.erasing.removed }); C.redo = []; save(); }
      C.erasing = null; if (e.pointerType !== "mouse") dot.style.display = "none"; return;
    }
    if (!C.cur || e.pointerId !== C.cur.id) return;
    const cur = C.cur; C.cur = null; cur.path.remove();
    if (e.type === "pointercancel" && cur.pts.length < 3) return;
    const pts = cur.pts, tool = opts.tool, o = opts[tool];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * C.getScale();
    const isTap = span < 8 && performance.now() - cur.t0 < 400;
    if (isTap && (tool === "mask" || tool === "hl")) { if (!toggleAt(pts[0]) && tool === "hl") return; return; }
    let item;
    const a = anchorAt(pts[0]); // 획이 시작된 섹션 기준 비율로 저장
    if (tool === "pen") item = { k: "pen", c: o.c, w: o.w, a: a.id, pts: relPts(a, simplify(pts, 0.6)) };
    else {
      let rects = opts.snap ? Snap.compute(pts, o.w) : null;
      if (rects && rects.length) item = { k: tool === "hl" ? "hlr" : "maskr", c: o.c, a: a.id, rects: relRects(a, rects) };
      else item = { k: tool, c: o.c, w: o.w, a: a.id, pts: relPts(a, simplify(pts, 0.8)) };
    }
    item.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    C.items.push(item); C.undo.push({ op: "add", item }); C.redo = [];
    renderAll(); save();
  }
  function moveDot(p) {
    const s = C.getScale(), r = 14;
    dot.style.display = "block"; dot.style.width = dot.style.height = r * 2 + "px";
    dot.style.left = p[0] - r + "px"; dot.style.top = p[1] - r + "px";
    void s;
  }
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) { const l = out[out.length - 1]; if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) > tol) out.push(pts[i]); }
    out.push(pts[pts.length - 1]); return out;
  }

  /* ── 지우개/토글 히트테스트 ── */
  function distSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function hit(item, p, r) {
    const gp = GEO.get(item) || geo(item), it = { w: item.w, pts: gp.pts, rects: gp.rects };
    if (it.rects) return it.rects.some(q => p[0] >= q[0] - r && p[0] <= q[0] + q[2] + r && p[1] >= q[1] - r && p[1] <= q[1] + q[3] + r);
    const pts = it.pts, rr = it.w / 2 + r;
    if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) <= rr;
    for (let i = 0; i < pts.length - 1; i++) if (distSeg(p, pts[i], pts[i + 1]) <= rr) return true;
    return false;
  }
  function eraseAt(p) {
    const keep = [];
    C.items.forEach(it => { if (hit(it, p, 12)) C.erasing.removed.push(it); else keep.push(it); });
    if (keep.length !== C.items.length) { C.items = keep; renderAll(); }
  }
  function toggleAt(p) {
    for (let i = C.items.length - 1; i >= 0; i--) {
      const it = C.items[i];
      if ((it.k === "mask" || it.k === "maskr") && hit(it, p, 4)) { it.open = !it.open; renderAll(); save(); return true; }
    }
    return false;
  }
  function undo() {
    if (!C) return; const op = C.undo.pop(); if (!op) return App.toast("되돌릴 작업이 없어요");
    if (op.op === "add") C.items = C.items.filter(i => i !== op.item);
    else C.items.push(...op.items);
    C.redo.push(op); renderAll(); save();
  }
  function redo() {
    if (!C) return; const op = C.redo.pop(); if (!op) return;
    if (op.op === "add") C.items.push(op.item);
    else C.items = C.items.filter(i => !op.items.includes(i));
    C.undo.push(op); renderAll(); save();
  }
  function revealAll() {
    if (!C) return;
    const masks = C.items.filter(i => i.k === "mask" || i.k === "maskr");
    if (!masks.length) return App.toast("이 페이지에 가림펜 필기가 없어요");
    const anyClosed = masks.some(m => !m.open);
    masks.forEach(m => (m.open = anyClosed));
    renderAll(); save();
    App.toast(anyClosed ? "모든 가림을 열었어요" : "모든 가림을 다시 가렸어요");
  }
  function clearPage() {
    if (!C || !C.items.length) return App.toast("지울 필기가 없어요");
    // 브라우저 확인창 대신: 3초 안에 한 번 더 누르면 삭제
    const now = Date.now();
    if (!clearPage.armed || now - clearPage.armed > 3000) { clearPage.armed = now; return App.toast("한 번 더 누르면 이 페이지 필기를 모두 지워요 (취소 ↶로 복구 가능)"); }
    clearPage.armed = 0;
    C.undo.push({ op: "del", items: C.items }); C.items = []; renderAll(); save();
  }

  /* ── 스냅: 텍스트는 글자/단어 경계, 그림은 내용 영역에 맞춤 ── */
  const Snap = {
    compute(pts, w) {
      const page = C.page, s = C.getScale(), pr = page.getBoundingClientRect();
      const toClient = p => [pr.left + p[0] * s, pr.top + p[1] * s];
      const toPageRect = r => [(r.left - pr.left) / s, (r.top - pr.top) / s, r.width / s, r.height / s];
      const samples = resample(pts, 3);
      C.cap.style.display = "none"; C.svg.style.display = "none";
      const hits = new Map(); let textHits = 0, img = null;
      try {
        for (const p of samples) {
          const [cx, cy] = toClient(p);
          const c = caretAt(cx, cy);
          if (!c || !c.node || c.node.nodeType !== 3 || !page.contains(c.node)) continue;
          const node = c.node, len = node.length;
          let idx = -1;
          for (const o of [c.offset, c.offset - 1]) {
            if (o < 0 || o >= len) continue;
            const r = charRect(node, o);
            if (r && cx >= r.left - 2 && cx <= r.right + 2 && cy >= r.top - 3 && cy <= r.bottom + 3) { idx = o; break; }
          }
          if (idx < 0) continue;
          textHits++;
          const h = hits.get(node) || { min: Infinity, max: -1 };
          h.min = Math.min(h.min, idx); h.max = Math.max(h.max, idx); hits.set(node, h);
        }
        const mid = samples[Math.floor(samples.length / 2)], [mx, my] = toClient(mid);
        img = document.elementsFromPoint(mx, my).find(e => e.tagName === "IMG" && page.contains(e));
      } finally { C.cap.style.display = ""; C.svg.style.display = ""; }

      if (textHits >= Math.max(2, samples.length * 0.3)) {
        let rects = [];
        hits.forEach((h, node) => {
          const t = node.data; let a = h.min, b = h.max + 1;
          while (a < b && /\s/.test(t[a])) a++;
          while (b > a && /\s/.test(t[b - 1])) b--;
          if (a >= b) return;
          a = extendLeft(t, a); b = extendRight(t, b);
          const range = document.createRange(); range.setStart(node, a); range.setEnd(node, b);
          for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5) rects.push(toPageRect(r));
        });
        return mergeRects(rects).map(r => [+(r[0] - 2).toFixed(1), +(r[1] - 1).toFixed(1), +(r[2] + 4).toFixed(1), +(r[3] + 2).toFixed(1)]);
      }
      // 그림 위: 획의 범위를 그림 안으로 자르고, 가능하면 글자/선 픽셀 영역에 맞춰 조임
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      let box = [Math.min(...xs) - w * 0.3, Math.min(...ys) - w * 0.3, Math.max(...xs) + w * 0.3, Math.max(...ys) + w * 0.3];
      if (img) {
        const ir = toPageRect(img.getBoundingClientRect());
        box = [Math.max(box[0], ir[0]), Math.max(box[1], ir[1]), Math.min(box[2], ir[0] + ir[2]), Math.min(box[3], ir[1] + ir[3])];
        const tight = tightenOnImage(img, ir, box);
        if (tight) box = tight;
      }
      if (box[2] - box[0] < 4 || box[3] - box[1] < 4) return null;
      return [[+box[0].toFixed(1), +box[1].toFixed(1), +(box[2] - box[0]).toFixed(1), +(box[3] - box[1]).toFixed(1)]];
    }
  };
  function resample(pts, step) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = step; t < d; t += step) out.push([a[0] + (b[0] - a[0]) * t / d, a[1] + (b[1] - a[1]) * t / d]);
      out.push(b);
    }
    return out;
  }
  function caretAt(x, y) {
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); return p && { node: p.offsetNode, offset: p.offset }; }
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); return r && { node: r.startContainer, offset: r.startOffset }; }
    return null;
  }
  function charRect(node, o) {
    const r = document.createRange(); r.setStart(node, o); r.setEnd(node, o + 1);
    const rs = r.getClientRects(); return rs.length ? rs[0] : null;
  }
  const isB = ch => !ch || /[\s,·/()\[\]:;=+→←↔|]/.test(ch);
  function extendLeft(t, a) {
    let ws = a; while (ws > 0 && !isB(t[ws - 1])) ws--;
    let we = a; while (we < t.length && !isB(t[we])) we++;
    return (a - ws) <= Math.max(1, (we - ws) * 0.5) ? ws : a;
  }
  function extendRight(t, b) {
    let we = b; while (we < t.length && !isB(t[we])) we++;
    let ws = b; while (ws > 0 && !isB(t[ws - 1])) ws--;
    return (we - b) <= Math.max(1, (we - ws) * 0.5) ? we : b;
  }
  function mergeRects(rs) {
    rs.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const out = [];
    rs.forEach(r => {
      const l = out.find(o => Math.abs((o[1] + o[3] / 2) - (r[1] + r[3] / 2)) < Math.min(o[3], r[3]) * 0.5 && r[0] <= o[0] + o[2] + 8 && r[0] + r[2] >= o[0] - 8);
      if (l) { const x1 = Math.min(l[0], r[0]), y1 = Math.min(l[1], r[1]), x2 = Math.max(l[0] + l[2], r[0] + r[2]), y2 = Math.max(l[1] + l[3], r[1] + r[3]); l[0] = x1; l[1] = y1; l[2] = x2 - x1; l[3] = y2 - y1; }
      else out.push(r.slice());
    });
    return out;
  }
  function tightenOnImage(img, ir, box) {
    try {
      if (!img.complete || !img.naturalWidth) return null;
      const kx = img.naturalWidth / ir[2], ky = img.naturalHeight / ir[3];
      const pad = 4;
      const sx = Math.max(0, (box[0] - pad - ir[0]) * kx), sy = Math.max(0, (box[1] - pad - ir[1]) * ky);
      const sw = Math.min(img.naturalWidth - sx, (box[2] - box[0] + pad * 2) * kx), sh = Math.min(img.naturalHeight - sy, (box[3] - box[1] + pad * 2) * ky);
      if (sw < 3 || sh < 3) return null;
      const cw = Math.min(500, Math.round(sw)), ch = Math.max(1, Math.round(sh * cw / sw));
      const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
      const g = cv.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
      const d = g.getImageData(0, 0, cw, ch).data; // file:// 에서는 보안상 실패 → 사각형 그대로 사용
      // 배경색 = 가장자리 픽셀의 중앙값
      const border = [];
      for (let x = 0; x < cw; x++) { border.push(x * 4, ((ch - 1) * cw + x) * 4); }
      for (let y = 0; y < ch; y++) { border.push(y * cw * 4, (y * cw + cw - 1) * 4); }
      const med = ch2 => { const v = border.map(i => d[i + ch2]).sort((a, b) => a - b); return v[v.length >> 1]; };
      const bg = [med(0), med(1), med(2)];
      let x1 = cw, y1 = ch, x2 = -1, y2 = -1, n = 0;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const i = (y * cw + x) * 4;
        if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 90) { n++; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
      }
      if (n < 6) return null;
      const k = sw / cw;
      const toP = (px, py) => [ir[0] + (sx + px * k) / kx, ir[1] + (sy + py * (sh / ch)) / ky];
      const a = toP(x1, y1), b = toP(x2 + 1, y2 + 1);
      return [a[0] - 3, a[1] - 3, b[0] + 3, b[1] + 3];
    } catch (e) { return null; }
  }

  /* ── 포스트잇: 페이지 위 메모지. 위치는 섹션 기준 비율, 크기는 1000px 페이지 기준(화면 배율과 무관)
   *    위 막대 = 끌어서 이동 + 불투명도 조절바(카카오톡 채팅방 조절바 모양) / 왼쪽·오른쪽·아래 가장자리 = 끌어서 크기 조절 ── */
  const NOTE_COLORS = ["#fff6a8", "#ffffff", "#e8e8ed", "#ffdfe6", "#dcecff"];
  const NOTE_MIN = { w: 140, h: 80 };
  let noteTimer = null;
  function loadNotes() { return (Store.get("notes:" + C.key, []) || []).map(n => Object.assign({}, n)); }
  function saveNotes() { clearTimeout(noteTimer); noteTimer = setTimeout(flushNotes, 400); }
  function flushNotes() { if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; if (C && N) Store.set("notes:" + C.key, N.items); } }
  function noteAbs(n) { const a = boxOf(n.a); return [a.x + n.x * a.w, a.y + n.y * a.h]; }
  function setNoteRel(n, x, y) { const a = anchorAt([x, y]); n.a = a.id; n.x = R5((x - a.x) / a.w); n.y = R5((y - a.y) / a.h); }
  function paper(hex, op) { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${op})`; }
  const topZ = () => N.items.reduce((m, n) => Math.max(m, n.z || 1), 1);

  function renderNotes() {
    if (!C || !N) return;
    const seen = new Set();
    N.items.forEach(n => {
      seen.add(n.id);
      let el = N.layer.querySelector(`.postit[data-id="${n.id}"]`);
      if (!el) { el = noteEl(n); N.layer.append(el); }
      if (N.drag && N.drag.n === n) return;
      const [x, y] = noteAbs(n);
      Object.assign(el.style, { left: x + "px", top: y + "px", width: n.w + "px", height: n.h + "px", zIndex: n.z || 1, background: paper(n.c, n.op) });
      el.querySelector("[data-op]").value = Math.round(n.op * 100);
      el.querySelector("[data-color]").style.background = n.c;
      const ta = el.querySelector("textarea"); if (document.activeElement !== ta && ta.value !== n.text) ta.value = n.text;
    });
    N.layer.querySelectorAll(".postit").forEach(el => { if (!seen.has(el.dataset.id)) el.remove(); });
  }
  function noteEl(n) {
    const el = document.createElement("div");
    el.className = "postit"; el.dataset.id = n.id;
    el.innerHTML = `<div class="pbar" title="끌어서 이동">
        <span class="grip"><svg viewBox="0 0 12 16" width="10" height="14"><g fill="currentColor"><circle cx="3" cy="3" r="1.3"/><circle cx="9" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="9" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="9" cy="13" r="1.3"/></g></svg></span>
        <input class="kslider" type="range" min="15" max="100" step="1" data-op title="불투명도" aria-label="불투명도">
        <button class="pc" data-color title="종이 색 바꾸기" aria-label="종이 색"></button>
        <button class="px" data-del title="포스트잇 삭제" aria-label="삭제">✕</button></div>
      <textarea placeholder="메모를 입력하세요" spellcheck="false"></textarea>
      <i class="rz l" data-rz="l"></i><i class="rz r" data-rz="r"></i><i class="rz b" data-rz="b"></i><i class="rz bl" data-rz="bl"></i><i class="rz br" data-rz="br"></i>`;
    const item = () => N && N.items.find(x => x.id === n.id);
    const front = () => { const it = item(); if (it && (it.z || 1) < topZ()) { it.z = topZ() + 1; el.style.zIndex = it.z; saveNotes(); } };
    el.addEventListener("pointerdown", e => {
      front();
      const it = item(); if (!it) return;
      const rz = e.target.closest("[data-rz]");
      if (rz) return startDrag(e, it, el, rz.dataset.rz);
      if (e.target.closest(".pbar") && !e.target.closest("input, button")) return startDrag(e, it, el, "move");
    });
    const ta = el.querySelector("textarea");
    ta.addEventListener("input", () => { const it = item(); if (it) { it.text = ta.value; saveNotes(); } });
    ta.addEventListener("blur", flushNotes);
    const sl = el.querySelector("[data-op]");
    sl.addEventListener("input", () => { const it = item(); if (!it) return; it.op = +sl.value / 100; el.style.background = paper(it.c, it.op); saveNotes(); });
    el.querySelector("[data-color]").addEventListener("click", () => {
      const it = item(); if (!it) return;
      it.c = NOTE_COLORS[(NOTE_COLORS.indexOf(it.c) + 1) % NOTE_COLORS.length];
      el.style.background = paper(it.c, it.op); el.querySelector("[data-color]").style.background = it.c; saveNotes();
    });
    el.querySelector("[data-del]").addEventListener("click", () => {
      const it = item(); if (!it) return;
      const now = Date.now();
      if (it.text.trim() && (!el._armed || now - el._armed > 3000)) { el._armed = now; return App.toast("한 번 더 누르면 이 포스트잇을 지워요"); }
      N.items = N.items.filter(x => x !== it); el.remove(); saveNotes();
    });
    return el;
  }
  function startDrag(e, n, el, mode) {
    e.preventDefault(); e.stopPropagation();
    const [x0, y0] = noteAbs(n);
    N.drag = { mode, n, el, cx: e.clientX, cy: e.clientY, x0, y0, w0: n.w, h0: n.h, x: x0, y: y0, id: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    el.classList.add("dragging");
  }
  function onNoteMove(e) {
    const d = N && N.drag; if (!d || e.pointerId !== d.id) return;
    const s = C.getScale(), dx = (e.clientX - d.cx) / s, dy = (e.clientY - d.cy) / s;
    let x = d.x0, y = d.y0, w = d.w0, h = d.h0;
    if (d.mode === "move") { x += dx; y += dy; }
    else {
      if (d.mode.includes("r")) w = Math.min(1000, Math.max(NOTE_MIN.w, d.w0 + dx));
      if (d.mode.includes("l")) { w = Math.min(d.x0 + d.w0, Math.max(NOTE_MIN.w, d.w0 - dx)); x = d.x0 + d.w0 - w; }
      if (d.mode.includes("b")) h = Math.max(NOTE_MIN.h, d.h0 + dy);
    }
    const ph = C.page.offsetHeight;
    w = Math.min(w, 1000); h = Math.min(h, ph);
    x = Math.max(0, Math.min(1000 - w, x)); y = Math.max(0, Math.min(ph - h, y));
    d.x = x; d.y = y; d.n.w = Math.round(w); d.n.h = Math.round(h);
    Object.assign(d.el.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
  }
  function onNoteUp(e) {
    const d = N && N.drag; if (!d || e.pointerId !== d.id) return;
    N.drag = null; d.el.classList.remove("dragging");
    setNoteRel(d.n, d.x, d.y); saveNotes();
  }
  function addNote() {
    if (!C || !N) return;
    const s = C.getScale(), pr = C.page.getBoundingClientRect(), mr = C.scroller.getBoundingClientRect();
    const w = 260, h = 170, ph = C.page.offsetHeight;
    const x = Math.max(0, Math.min(1000 - w, (mr.left + mr.width / 2 - pr.left) / s - w / 2));
    const y = Math.max(0, Math.min(ph - h, (mr.top + mr.height * 0.3 - pr.top) / s));
    const n = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), w, h, text: "", op: 1, c: NOTE_COLORS[0], z: topZ() + 1 };
    setNoteRel(n, x, y);
    N.items.push(n); renderNotes(); saveNotes();
    setTool("read"); hidePop();
    const ta = N.layer.querySelector(`.postit[data-id="${n.id}"] textarea`); if (ta) ta.focus({ preventScroll: true });
  }

  Store.onRemote(reloadRemote);
  window.Ink = { attach, detach, resize, setTool, flushSave: () => { flushSave(); flushNotes(); } };
})();
