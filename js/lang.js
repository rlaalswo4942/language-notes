/* 언어 학습노트 - 앱 본체
 * 공용 엔진(store.js 저장·동기화, draw.js 필기·포스트잇, style.css 무채색)은 학습사이트_프레임과 동일하게 두고, 언어 학습 화면만 이 파일에서 그림
 * 라우트: #home(언어 선택) #guide
 *         #<언어>            오늘의 학습       #<언어>/lesson/<레슨id>  레슨
 *         #<언어>/review     복습(간격 반복)   #<언어>/wrong            오답노트
 *         #<언어>/log(/날짜) 학습 기록 달력    #<언어>/words            단어장
 *         #<언어>/lib(/과정) 레슨 목록         #<언어>/src              출처
 * 저장 키(언어별): prefs:<언어> 설정 · done:<언어> 완료 레슨 · att:<언어> 문제 기록 · srs:<언어> 복습 일정 · log:<언어> 날짜별 기록 · out:<언어> 직접 쓴 문장
 */
(function () {
  const SITE = window.SITE, LANGS = window.LANGS;
  const LG = {}; LANGS.forEach(l => (LG[l.id] = l));
  const main = document.getElementById("main"), crumb = document.getElementById("crumb"), tabbar = document.getElementById("tabbar");
  const DAILY = SITE.daily || { minutes: 15, reviewCap: 15, plan: "" }; // 하루 15분 고정
  const OFF = [1, 3, 7, 14, 30, 60, 120];     // 복습 간격(일) — 설계서의 초기값 D+1·3·7·14·30, 이후 연장
  const MAX_S = OFF.length - 1;
  const DATA = {};                              // 언어별 { courses:{과정:[레슨]}, lessons:{id:레슨}, items:{sid:카드}, qs:{qid:{q,L}}, sources:[] }
  let scale = 1, page = null, scaler = null, ro = null, wideNow = null;
  let RS = null;                                // 복습 세션 { lang, list:[sid], i, flip, n, again:Set }

  document.title = SITE.title;
  document.head.insertAdjacentHTML("beforeend", `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${SITE.icon}</text></svg>">`);

  /* ───────── 공통 ───────── */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = () => KST.format(new Date());                       // 하루 경계는 한국 시간 자정
  const toUTC = d => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y, m - 1, dd); };
  const addDays = (d, n) => new Date(toUTC(d) + n * 864e5).toISOString().slice(0, 10);
  const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const wday = d => new Date(toUTC(d)).getUTCDay();
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function shuffled(n, seed) { // 같은 문제는 항상 같은 순서 (새로고침해도 보기 위치 유지)
    const a = [...Array(n).keys()]; let x = hash(seed) || 1;
    for (let i = n - 1; i > 0; i--) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const norm = s => String(s || "").normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ").replace(/[.!?。]+$/, "");
  let tt; function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2400); }
  window.App = { toast, fit };

  /* 일본어 표기: '漢字{かんじ}' → 루비(후리가나) */
  function jtext(s) { return esc(s).replace(/([㐀-鿿々〆ヵヶ]+)\{([^}]+)\}/g, "<ruby>$1<rt>$2</rt></ruby>"); }
  const plain = s => String(s || "").replace(/\{[^}]*\}/g, "");
  function tx(lang, s) { return lang === "ja" ? `<span class="jp" lang="ja">${jtext(s)}</span>` : `<span lang="en">${esc(s)}</span>`; }

  /* 발음: 브라우저 음성 합성(TTS) — 공인 발음이 아니라 자동 음성임을 표시 */
  const TTS = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  function speak(lang, text) {
    if (!TTS) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain(text)); u.lang = LG[lang].tts; u.rate = 0.9;
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.replace("_", "-").startsWith(LG[lang].tts.slice(0, 2)));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  const sayBtn = (text) => TTS ? `<button class="say" data-say="${esc(plain(text))}" title="자동 음성(TTS)으로 듣기" aria-label="듣기">듣기</button>` : "";

  /* ───────── 기록 ───────── */
  const get = (k, lang, d) => Store.get(k + ":" + lang, d);
  const put = (k, lang, v) => Store.set(k + ":" + lang, v);
  function prefs(lang) {
    const p = get("prefs", lang, {}) || {}, L = LG[lang];
    return { course: p.course || L.courses[0].id, romaji: p.romaji != null ? p.romaji : true, furi: p.furi != null ? p.furi : true };
  }
  function setPref(lang, k, v) { const p = get("prefs", lang, {}) || {}; p[k] = v; put("prefs", lang, p); }
  function logDay(lang, d, fn) { const g = get("log", lang, {}) || {}; const e = g[d] || { L: [], rv: 0, ok: 0, n: 0 }; fn(e); g[d] = e; put("log", lang, g); }

  /* ───────── 데이터 불러오기 · 정규화 ───────── */
  const STATUS = {
    verified: { k: "ok", lab: "내부 검토" }, published: { k: "ok", lab: "검수 완료" },
    draft: { k: "draft", lab: "AI 초안 · 자동 검사 통과" }, linguistic_review_pending: { k: "draft", lab: "검수 전 초안" },
    needs_review: { k: "hide", lab: "검토 필요" }
  };
  const TYPE = { new: "새 학습", practice: "적용", checkpoint: "점검", review: "복습" };
  async function load(lang) {
    if (DATA[lang]) return DATA[lang].ready;
    const D = (DATA[lang] = { courses: {}, lessons: {}, items: {}, qs: {}, sources: [], ready: null });
    D.ready = (async () => {
      const getJ = u => fetch(u, { cache: "no-cache" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
      const idx = await getJ(`content/${lang}/index.json`), has = idx && idx.courses ? idx.courses : null; // 과정 목록 (tools/validate.py 가 만듦)
      const plusSet = new Set((idx && idx.plus) || []);
      const [files, srcs, pluses] = await Promise.all([Promise.all(LG[lang].courses.map(c => !has || has[c.id] ? getJ(`content/${lang}/${c.id}.json`) : null)), !idx || idx.sources ? getJ(`content/${lang}/sources.json`) : null,
        Promise.all(LG[lang].courses.map(c => plusSet.has(c.id) ? getJ(`content/${lang}/${c.id}.plus.json`) : null))]);
      const seen = {};
      if (srcs) Object.entries(srcs).forEach(([id, s]) => { if (!seen[s.url]) { seen[s.url] = 1; D.sources.push({ id, u: s.url, p: s.purpose || "", s: s.reuse || "" }); } });
      LG[lang].courses.forEach((c, i) => {
        const add = (pluses[i] && pluses[i].lessons) || {};
        const raw = ((files[i] && files[i].lessons) || []).map(r => withPlus(lang, r, add[r.id]));
        const list = raw.map(r => normalize(lang, r, c.id, srcs || {})).filter(L => L.status.k !== "hide").sort((a, b) => a.day - b.day);
        D.courses[c.id] = list;
        list.forEach(L => {
          D.lessons[L.id] = L;
          L.items.forEach(it => { if (!D.items[it.sid]) D.items[it.sid] = Object.assign({ L: L.id }, it); });
          L.qs.forEach(q => (D.qs[q.id] = { q, L }));
          L.sources.forEach(s => { if (s.u && !seen[s.u]) { seen[s.u] = 1; D.sources.push(s); } });
        });
      });
    })();
    return D.ready;
  }
  /* 보강 파일(<과정>.plus.json)의 단어·예문·문제를 원본 레슨 뒤에 덧붙임 (원본 파일은 그대로) */
  function withPlus(lang, r, add) {
    if (!add) return r;
    const o = Object.assign({}, r), mark = a => (a || []).map(x => Object.assign({ _plus: true }, x));
    o.examples = (r.examples || []).concat(mark(add.examples));
    if (lang === "ja") o.exercises = (r.exercises || []).concat(add.exercises || []);
    else { o.vocabulary = (r.vocabulary || []).concat(mark(add.vocabulary)); o.questions = (r.questions || []).concat(add.questions || []); }
    o._plus = true;
    return o;
  }
  function normalize(lang, r, course, srcs) {
    const st = STATUS[r.review_status || r.content_status] || STATUS.draft;
    const L = {
      id: r.id, lang, course, day: r.day_index || r.day || 0, type: r.lesson_type || "new", title: r.title_ko || r.id, objective: r.objective_ko || "",
      minutes: r.estimated_minutes || null, status: st, prereq: r.prerequisite_lesson_ids || [], editor: r.editor_note_ko || "",
      explain: null, mistake: null, notes: [], items: [], examples: [], qs: [], output: null, sources: [], rev: r.revision || null, plus: !!r._plus
    };
    if (lang === "ja") {
      L.explain = r.explanation_ko || null;
      L.notes = [].concat(r.usage_notes || [], r.common_mistakes || []);
      (r.new_items || []).forEach(it => L.items.push({ sid: (it.kind === "kana" ? "k:" : "w:") + it.text, kind: it.kind || "word", text: it.text, reading: it.reading_kana || "", roma: it.reading_romanized || "", meaning: it.meaning_ko || "", pos: it.part_of_speech || "" }));
      (r.examples || []).forEach(e => {
        L.examples.push({ t: e.japanese, roma: e.reading_romanized || "", reading: e.reading_kana || "", ko: e.meaning_ko || "", note: e.explanation_ko || "", plus: !!e._plus });
        if (e.meaning_ko && !/[。、？！\s]/.test(plain(e.japanese)) && plain(e.japanese).length <= 8) // 단어 예시는 복습 카드로
          L.items.push({ sid: "w:" + plain(e.japanese), kind: "word", text: e.japanese, reading: e.reading_kana || "", roma: e.reading_romanized || "", meaning: e.meaning_ko, pos: "", fromEx: true });
      });
      (r.exercises || []).forEach(q => L.qs.push({ id: q.id, type: q.type === "typing" ? "typing" : "choice", prompt: q.prompt_ko, options: q.options || [], answer: q.answer_index, accepted: [q.answer_text].concat(q.accepted_answers || []).filter(Boolean), expl: q.explanation_ko || "", tag: q.error_tag || "" }));
      (r.source_refs || []).forEach(id => { const s = srcs[id]; if (s) L.sources.push({ id, u: s.url, p: s.purpose || id, s: s.reuse || "" }); });
    } else {
      const g = r.grammar || {};
      L.explain = g.explanation_ko || null; L.mistake = g.common_mistake_ko || null;
      (r.vocabulary || []).forEach(v => L.items.push({ sid: "w:" + v.word, kind: "word", text: v.word, reading: v.ipa || "", roma: "", meaning: v.meaning_ko || "", pos: v.part_of_speech || "", ex: v.example_en || "", exKo: v.example_ko || "", plus: !!v._plus }));
      (r.examples || []).forEach(e => L.examples.push({ t: e.en, ko: e.ko || "", note: e.note_ko || "", plus: !!e._plus }));
      (r.questions || []).forEach(q => L.qs.push({ id: q.id, type: q.type === "typing" ? "typing" : "choice", prompt: q.stem, options: q.choices || [], answer: q.answer_index, accepted: [].concat(q.answer_text || [], q.accepted_answers || []), expl: q.explanation_ko || "", tag: q.error_tag || "" }));
      if (r.output_task) L.output = { prompt: r.output_task.prompt_ko, example: r.output_task.example_answer_en || "", note: r.output_task.note_ko || "" };
      (r.reference_sources || []).forEach(s => L.sources.push({ u: s.url, p: `${s.publisher || ""}${s.supports ? " — " + s.supports : ""}`, s: s.checked_at ? "확인 " + s.checked_at : "" }));
    }
    return L;
  }

  /* ───────── 진도 계산 ───────── */
  function nextLesson(lang, course) {
    const done = get("done", lang, {}) || {};
    return (DATA[lang].courses[course] || []).find(L => !done[L.id]) || null;
  }
  function doneToday(lang, course) {
    const done = get("done", lang, {}) || {}, d = today();
    return (DATA[lang].courses[course] || []).filter(L => done[L.id] && done[L.id].d === d);
  }
  function dueList(lang) {
    const s = get("srs", lang, {}) || {}, d = today();
    return Object.keys(s).filter(k => s[k].due <= d && DATA[lang].items[k]).sort((a, b) => (s[a].due < s[b].due ? -1 : s[a].due > s[b].due ? 1 : s[a].s - s[b].s));
  }
  function wrongList(lang) { const a = get("att", lang, {}) || {}; return Object.keys(a).filter(k => !a[k].ok && DATA[lang].qs[k]).sort((x, y) => a[y].t - a[x].t); }
  function stats(lang) {
    const g = get("log", lang, {}) || {}, d = today();
    const days = Object.keys(g).filter(k => (g[k].L || []).length || g[k].rv);
    let streak = 0, cur = (g[d] && ((g[d].L || []).length || g[d].rv)) ? d : addDays(d, -1);
    while (g[cur] && ((g[cur].L || []).length || g[cur].rv)) { streak++; cur = addDays(cur, -1); }
    let ok = 0, n = 0; for (let i = 0; i < 7; i++) { const e = g[addDays(d, -i)]; if (e) { ok += e.ok || 0; n += e.n || 0; } }
    return { days: days.length, streak, ok, n, acc: n ? Math.round(ok / n * 100) : null, items: Object.keys(get("srs", lang, {}) || {}).length };
  }

  /* ───────── 사이드바: 언어 폴더 → 하위 메뉴 ───────── */
  const FOLD_KEY = SITE.key + "-fold";
  function folds() { try { return JSON.parse(localStorage.getItem(FOLD_KEY)) || {}; } catch (e) { return {}; } }
  function setFold(lang, open) { const f = folds(); f[lang] = open; try { localStorage.setItem(FOLD_KEY, JSON.stringify(f)); } catch (e) {} }
  const MENU = [["", "오늘의 학습"], ["review", "복습"], ["wrong", "오답노트"], ["log", "학습 기록"], ["words", "단어장"], ["lib", "레슨 목록"], ["src", "출처"]];
  function renderSide() {
    const [a, b] = parts(), f = folds();
    let h = `<div class="side-group">언어 선택</div>`;
    LANGS.forEach(L => {
      const open = f[L.id] != null ? f[L.id] : a === L.id, D = DATA[L.id];
      const due = D && D.items ? dueList(L.id).length : 0, wr = D && D.qs ? wrongList(L.id).length : 0;
      h += `<button class="side-item fold ${open ? "open" : ""} ${a === L.id && !open ? "active" : ""}" data-fold="${L.id}"><span class="chev" aria-hidden="true"></span><span class="txt"><small>${esc(L.native)}</small><span>${esc(L.name)}</span></span></button>`;
      if (open) {
        h += `<div class="side-sub">`;
        MENU.forEach(([id, t]) => {
          const cnt = id === "review" && due ? `<em>${due}</em>` : id === "wrong" && wr ? `<em>${wr}</em>` : "";
          h += `<button class="side-item child ${a === L.id && (b || "") === id ? "active" : ""}" data-go="#${L.id}${id ? "/" + id : ""}"><span class="txt"><span>${t}</span></span>${cnt}</button>`;
        });
        h += `</div>`;
      }
    });
    h += `<div class="side-group">도움말</div><button class="side-item ${a === "guide" ? "active" : ""}" data-go="#guide"><span class="txt"><span>사용법 · 동기화</span></span></button>`;
    document.getElementById("side-nav").innerHTML = h;
  }
  document.getElementById("side-nav").addEventListener("click", e => {
    const fb = e.target.closest("[data-fold]");
    if (fb) {
      const id = fb.dataset.fold, open = !fb.classList.contains("open");
      setFold(id, open);
      if (open) { load(id).then(renderSide); if (parts()[0] !== id) location.hash = "#" + id; }
      renderSide(); return;
    }
    const b = e.target.closest("[data-go]"); if (!b) return;
    location.hash = b.dataset.go;
    if (window.innerWidth < 900) setSide(false);
  });
  function setSide(open) { document.body.classList.toggle("side-closed", !open); Store.set("sideOpen", open); setTimeout(fit, 280); }
  document.getElementById("side-toggle").addEventListener("click", () => setSide(document.body.classList.contains("side-closed")));
  document.getElementById("side-close").addEventListener("click", () => setSide(false));

  /* 휴대폰: 아래 탭 */
  function renderTabs(lang, sub) {
    if (!lang) { tabbar.hidden = true; document.body.classList.remove("has-tabs"); return; }
    const due = dueList(lang).length;
    tabbar.hidden = false; document.body.classList.add("has-tabs");
    tabbar.innerHTML = [["", "오늘"], ["review", "복습"], ["log", "기록"], ["words", "단어장"], ["lib", "목록"]]
      .map(([id, t]) => `<button class="${(sub || "") === id ? "on" : ""}" data-go="#${lang}${id ? "/" + id : ""}">${t}${id === "review" && due ? `<em>${due}</em>` : ""}</button>`).join("");
  }
  tabbar.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) location.hash = b.dataset.go; });

  /* ───────── 홈: 언어 선택 ───────── */
  function renderHome() {
    let h = `<div class="home lhome"><p class="eyebrow">영어 · 일본어</p><h1>${esc(SITE.title)}</h1>
      <p class="sub">공부할 언어를 고르세요. 과정(난이도)을 정하면 매일 새 레슨이 이어지고, 배운 내용은 간격 반복으로 다시 나옵니다.</p><div class="lang-grid">`;
    LANGS.forEach(L => {
      const p = prefs(L.id), c = L.courses.find(c => c.id === p.course), s = stats(L.id), due = DATA[L.id] && DATA[L.id].items ? dueList(L.id).length : null;
      h += `<button class="lang-card" data-go="#${L.id}"><span class="native" lang="${L.id}">${esc(L.native)}</span><b>${esc(L.name)}</b>
        <span class="meta">${esc(c ? c.t : "")} 과정 · 하루 ${DAILY.minutes}분</span>
        <span class="mini"><span>연속 ${s.streak}일</span><span>익힌 항목 ${s.items}</span>${due != null ? `<span>복습 ${due}</span>` : ""}</span></button>`;
    });
    h += `</div><div class="notice">${SITE.autoUpdate ? "새 레슨은 매일 자동으로 추가됩니다." : "지금은 준비된 레슨을 순서대로 공부합니다. 매일 새 레슨 자동 추가는 연결 준비 중입니다."} 학습 기록은 이 기기에 자동 저장되고, 동기화 코드로 노트북·태블릿·휴대폰을 이을 수 있어요.</div></div>`;
    main.innerHTML = h;
  }

  /* ───────── 언어별 오늘의 학습 ───────── */
  function renderToday(lang) {
    const L = LG[lang], p = prefs(lang), D = DATA[lang], d = today();
    const course = L.courses.find(c => c.id === p.course), list = D.courses[p.course] || [];
    const nx = nextLesson(lang, p.course), td = doneToday(lang, p.course), due = dueList(lang), s = stats(lang), cap = DAILY.reviewCap;
    const heavy = due.length > 30 || (s.n >= 5 && s.acc < 70);
    const total = list.length, doneN = list.filter(x => (get("done", lang, {}) || {})[x.id]).length;
    let h = `<div class="home lhome"><p class="eyebrow" lang="${lang}">${esc(L.native)}</p><h1>${esc(L.name)}</h1>
      <p class="sub">${d.slice(5).replace("-", "월 ")}일 (${WD[wday(d)]}) · ${esc(L.week[(wday(d) + 6) % 7])}</p>
      <div class="pick"><span class="lab">과정</span><div class="chips">${L.courses.map(c => `<button class="${c.id === p.course ? "on" : ""}" data-course="${c.id}">${esc(c.t)}${(D.courses[c.id] || []).length ? "" : "<small> 준비 중</small>"}</button>`).join("")}</div></div>
      <p class="plan"><b>하루 ${DAILY.minutes}분</b> ${esc(DAILY.plan)}</p>`;
    if (heavy) h += `<div class="notice">밀린 복습이 ${due.length}개${s.acc != null && s.acc < 70 ? `, 최근 7일 정답률 ${s.acc}%` : ""}예요. 오늘은 새 레슨보다 <b>복습을 먼저</b> 하는 걸 권해요.</div>`;
    h += `<div class="today">`;
    if (td.length) {
      h += `<div class="tcard done"><span class="tag">오늘의 레슨 · 완료</span>${td.map(x => `<b>${esc(x.title)}</b>`).join("")}<p>오늘 분량을 마쳤어요. 내일 새 레슨이 열립니다.</p>
        <div class="acts"><button class="pill ghost" data-go="#${lang}/lesson/${td[0].id}">다시 보기</button>${nx ? `<button class="pill ghost" data-go="#${lang}/lesson/${nx.id}">다음 레슨 미리 하기 ›</button>` : ""}</div></div>`;
    } else if (nx) {
      h += `<div class="tcard"><span class="tag">오늘의 레슨 · ${esc(course.t)} ${nx.day}일차 · ${TYPE[nx.type] || nx.type}</span><b>${esc(nx.title)}</b><p>${esc(nx.objective)}</p>
        <span class="badge ${nx.status.k}">${esc(nx.status.lab)}</span><div class="acts"><button class="pill" data-go="#${lang}/lesson/${nx.id}">시작하기</button></div></div>`;
    } else {
      h += `<div class="tcard empty"><span class="tag">오늘의 레슨</span><b>${total ? "준비된 레슨을 모두 마쳤어요" : `${esc(course.t)} 과정은 추후 추가 예정`}</b>
        <p>${total ? "새 레슨이 추가되면 여기에 나타나요. 그동안 복습과 오답노트로 다져 두세요." : "아직 이 과정의 레슨이 없어요. 다른 과정을 고르거나 복습을 하세요."}</p></div>`;
    }
    h += `<div class="tcard"><span class="tag">복습</span><b>${due.length ? `오늘 복습할 카드 ${due.length}장` : "오늘 복습할 카드 없음"}</b>
      <p>${due.length ? `오늘 권장 ${Math.min(cap, due.length)}장(약 4분) · 간격 1·3·7·14·30일` : "레슨을 마치면 배운 글자·단어가 다음 날부터 복습 카드로 나와요."}</p>
      <div class="acts">${due.length ? `<button class="pill" data-go="#${lang}/review">복습 시작</button>` : ""}${wrongList(lang).length ? `<button class="pill ghost" data-go="#${lang}/wrong">오답 ${wrongList(lang).length}개 다시 풀기</button>` : ""}</div></div></div>`;
    h += `<div class="stats st4"><div><small>연속 학습</small><b>${s.streak}일</b><span>누적 ${s.days}일</span></div><div><small>과정 진도</small><b>${doneN}/${total}</b><span>${esc(course.t)} 레슨</span></div>
      <div><small>익힌 항목</small><b>${s.items}</b><span>복습 카드</span></div><div><small>최근 7일 정답률</small><b>${s.acc != null ? s.acc + "%" : "—"}</b><span>${s.n ? `${s.ok}/${s.n}문항` : "기록 없음"}</span></div></div>`;
    if (L.romaji) h += `<div class="pick"><span class="lab">표시</span><div class="chips"><button class="${p.romaji ? "on" : ""}" data-pref="romaji">로마자</button><button class="${p.furi ? "on" : ""}" data-pref="furi" title="한자 위 읽기와 단어 읽기 줄을 히라가나로 표시">히라가나</button></div></div>`;
    h += `<div class="notice small">${esc(L.notice)}${TTS ? " 듣기 버튼은 브라우저 자동 음성(TTS)이라 실제 원어민 발음과 다를 수 있어요." : ""}</div></div>`;
    main.innerHTML = h;
  }

  /* ───────── 레슨 ───────── */
  function lessonHtml(lang, L) {
    const p = prefs(lang), done = (get("done", lang, {}) || {})[L.id], att = get("att", lang, {}) || {}, course = LG[lang].courses.find(c => c.id === L.course);
    const answered = L.qs.filter(q => att[q.id]).length;
    let h = `<div class="hero lhero" id="top"><div class="k">${esc(course.t)} · ${L.day}일차 · ${TYPE[L.type] || esc(L.type)} · 하루 ${DAILY.minutes}분</div>
      <h1>${esc(L.title)}</h1><div class="en">${esc(L.objective)}</div>
      <div class="hero-row"><span class="badge ${L.status.k}">${esc(L.status.lab)}</span>${L.plus ? `<span class="badge draft">보강 예문·문제 포함 (AI 초안)</span>` : ""}${done ? `<span class="badge ok">완료 ${esc(done.d)}${done.sc ? ` · ${done.sc[0]}/${done.sc[1]}` : ""}</span>` : ""}</div></div>`;
    if (L.status.k === "draft") h += `<div class="card warnbox" id="draft"><b>${esc(L.status.lab)}</b> — 전문가 검수를 거치지 않은 교육용 자료예요. 의심스러운 부분은 출처 링크로 확인하세요.${L.editor ? `<small>${esc(L.editor)}</small>` : ""}</div>`;
    if (L.items.filter(i => !i.fromEx).length) {
      const its = L.items.filter(i => !i.fromEx);
      h += `<section class="card" id="items"><h2>새로 배우는 ${its.every(i => i.kind === "kana") ? "글자" : "단어"} <small>${its.length}개</small></h2><div class="kgrid ${its.every(i => i.kind === "kana") ? "kana" : ""}">`;
      its.forEach(i => (h += `<div class="kcard"><div class="big">${tx(lang, i.text)}</div>${i.reading ? `<div class="rd jp" lang="ja">${esc(i.reading)}</div>` : ""}${i.roma && p.romaji ? `<div class="rm">${esc(i.roma)}</div>` : ""}
        ${i.meaning ? `<div class="mn">${i.pos ? `<i>${esc(i.pos)}</i> ` : ""}${esc(i.meaning)}</div>` : ""}${i.ex ? `<div class="ex">${tx(lang, i.ex)}<small>${esc(i.exKo)}</small></div>` : ""}${sayBtn(i.text)}${i.plus ? `<small class="plus">보강 · AI 초안</small>` : ""}</div>`));
      h += `</div></section>`;
    }
    if (L.explain || L.mistake || L.notes.length) {
      h += `<section class="card" id="explain"><h2>핵심 설명</h2>${L.explain ? `<p class="lead">${esc(L.explain)}</p>` : ""}${L.mistake ? `<div class="tip mistake">${esc(L.mistake)}</div>` : ""}${L.notes.map(n => `<p>${esc(n)}</p>`).join("")}</section>`;
    }
    if (L.examples.length) {
      h += `<section class="card" id="examples"><h2>예문 <small>${L.examples.length}개 · 소리 내어 읽어 보세요</small></h2><div class="exlist">`;
      L.examples.forEach(e => (h += `<div class="exrow"><div class="t">${tx(lang, e.t)}${e.reading ? `<small class="jp rd" lang="ja">${esc(e.reading)}</small>` : ""}${e.roma && p.romaji ? `<small class="rm">${esc(e.roma)}</small>` : ""}</div><div class="ko">${esc(e.ko)}${e.note && !/^(읽기와 뜻을 함께 확인하고|소리 내어 읽고 뜻과)/.test(e.note) ? `<small>${esc(e.note)}</small>` : ""}${e.plus ? `<small class="plus">보강 · AI 초안</small>` : ""}</div>${sayBtn(e.t)}</div>`));
      h += `</div></section>`;
    }
    if (L.qs.length) {
      h += `<section class="card" id="quiz"><h2>확인 문제 <small>${answered}/${L.qs.length} 풀이</small></h2>`;
      L.qs.forEach((q, i) => (h += qHtml(lang, q, i + 1, att[q.id])));
      h += `</section>`;
    }
    if (L.output) {
      const out = (get("out", lang, {}) || {})[L.id] || "";
      h += `<section class="card" id="output"><h2>직접 써 보기</h2><p>${esc(L.output.prompt)}</p><textarea class="otext" data-out="${L.id}" lang="${lang}" rows="3" placeholder="여기에 문장을 써 보세요 (자동 저장)">${esc(out)}</textarea>
        ${L.output.example ? `<details><summary>예시 답 보기</summary>${tx(lang, L.output.example)}</details>` : ""}${L.output.note ? `<small class="note">${esc(L.output.note)}</small>` : ""}</section>`;
    }
    if (L.sources.length) h += `<section class="card src" id="srcs"><b>참고 출처</b><ul>${L.sources.map(s => `<li><a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.p || s.u)}</a>${s.s ? ` <small>${esc(s.s)}</small>` : ""}</li>`).join("")}</ul><small>출처는 주제·형식의 근거이며, 예문과 문제는 이 사이트에서 새로 만든 연습용입니다.</small></section>`;
    const list = DATA[lang].courses[L.course], idx = list.indexOf(L), next = list[idx + 1];
    h += `<div class="finish" id="finish">${done ? `<p>이 레슨은 <b>${esc(done.d)}</b>에 완료했어요. 다시 풀어도 완료 기록은 그대로예요.</p>` : `<button class="pill big-pill" data-finish="${L.id}">레슨 완료하기</button><p>${L.qs.length ? `문제 ${L.qs.length - answered}개 남음 · ` : ""}완료하면 배운 항목이 내일부터 복습 카드로 나와요.</p>`}
      <div class="acts"><button class="pill ghost" data-go="#${lang}">오늘의 학습으로</button>${next && done ? `<button class="pill ghost" data-go="#${lang}/lesson/${next.id}">다음 레슨 ›</button>` : ""}</div></div>`;
    return h;
  }
  function qHtml(lang, q, n, a, retry) {
    let h = `<div class="qblock" data-q="${esc(q.id)}"><div class="qn">${n ? `문제 ${n}` : ""}${q.tag ? ` <small>${esc(q.tag)}</small>` : ""}</div><h3>${esc(q.prompt).replace(/「([^」]+)」/g, "「<span class=\"jp\" lang=\"ja\">$1</span>」")}</h3>`;
    const show = a && !retry;
    if (q.type === "choice") {
      h += `<div class="choices">`;
      shuffled(q.options.length, q.id).forEach((oi, k) => {
        const cls = show ? (oi === q.answer ? "right" : String(a.a) === String(oi) ? "wrong" : "dim") : "";
        h += `<button class="choice ${cls}" data-opt="${oi}" ${show ? "disabled" : ""}><b>${k + 1}</b> ${tx(lang, q.options[oi])}</button>`;
      });
      h += `</div>`;
    } else {
      h += `<form class="typing" data-type="${esc(q.id)}"><input lang="${lang === "ja" ? "en" : lang}" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="답 입력" value="${show ? esc(a.a) : ""}" ${show ? "disabled" : ""}><button class="pill" ${show ? "disabled" : ""}>확인</button></form>`;
    }
    if (show) {
      const right = q.type === "choice" ? q.options[q.answer] : q.accepted[0];
      h += `<div class="result ${a.ok ? "ok" : "no"}">${a.ok ? "정답" : `오답 · 정답: ${esc(plain(right))}`}</div>${q.expl ? `<div class="expl">${esc(q.expl)}</div>` : ""}<button class="retry" data-retry="${esc(q.id)}">다시 풀기</button>`;
    }
    return h + `</div>`;
  }
  function renderLesson(lang, id) {
    const L = DATA[lang].lessons[id];
    if (!L) { main.innerHTML = `<div class="home"><h1>레슨을 찾을 수 없어요</h1><p class="sub">목록에서 다시 골라 주세요.</p><button class="pill" data-go="#${lang}/lib">레슨 목록</button></div>`; return; }
    crumb.innerHTML = `${esc(LG[lang].name)} · ${esc(L.title)}`;
    const wide = main.clientWidth >= 700; wideNow = wide;
    const body = lessonHtml(lang, L);
    if (wide) { // 노트북·태블릿: 1000px 고정폭 페이지 + 필기·포스트잇
      main.innerHTML = `<div class="scaler"><div class="page lesson" id="page" data-lang="${lang}">${body}</div></div>`;
      scaler = main.querySelector(".scaler"); page = main.querySelector(".page");
      ro = new ResizeObserver(() => fit()); ro.observe(page); fit();
      Ink.attach(page, `${lang}-${L.id}`, () => scale, main);
    } else {   // 휴대폰: 화면 폭에 맞춘 레이아웃 (필기는 태블릿·노트북에서)
      main.innerHTML = `<div class="lpage lesson" data-lang="${lang}">${body}</div>`;
    }
  }
  function fit() {
    if (!page || !page.isConnected || !scaler) return;
    const avail = main.clientWidth - (window.innerWidth >= 1000 ? 84 : 12);
    scale = Math.max(0.3, Math.min(1.25, avail / 1000));
    page.style.transform = `scale(${scale})`;
    scaler.style.width = 1000 * scale + "px";
    scaler.style.height = page.offsetHeight * scale + "px";
    Ink.resize();
  }
  window.addEventListener("resize", () => {
    fit();
    const [a, b] = parts();
    if (LG[a] && b === "lesson" && wideNow != null && (main.clientWidth >= 700) !== wideNow) route();
  });

  /* 문제 채점 · 기록 */
  function answer(lang, qid, given) {
    const D = DATA[lang], hit = D.qs[qid]; if (!hit) return;
    const q = hit.q;
    const ok = q.type === "choice" ? Number(given) === q.answer : q.accepted.some(x => norm(x) === norm(given));
    const att = get("att", lang, {}) || {}, prev = att[qid];
    att[qid] = { ok, a: given, n: (prev ? prev.n : 0) + 1, first: prev ? prev.first : ok, t: Date.now(), L: hit.L.id };
    put("att", lang, att);
    logDay(lang, today(), e => { e.n = (e.n || 0) + 1; if (ok) e.ok = (e.ok || 0) + 1; });
    return { q, a: att[qid] };
  }
  function redrawQ(block, lang, q, a, retry) {
    const n = (block.querySelector(".qn").textContent.match(/\d+/) || [""])[0];
    block.outerHTML = qHtml(lang, q, n, a, retry);
    if (page) { fit(); }
    const h2 = main.querySelector("#quiz h2 small"), L = DATA[lang].qs[q.id].L;
    if (h2) { const att = get("att", lang, {}) || {}; h2.textContent = `${L.qs.filter(x => att[x.id]).length}/${L.qs.length} 풀이`; }
  }
  function finish(lang, id) {
    const L = DATA[lang].lessons[id], att = get("att", lang, {}) || {}, done = get("done", lang, {}) || {};
    if (done[id]) return toast("이미 완료한 레슨이에요");
    const left = L.qs.filter(q => !att[q.id]).length;
    if (left) { toast(`문제를 모두 풀어 주세요 (${left}개 남음)`); const el = main.querySelector(`.qblock[data-q="${CSS.escape(L.qs.find(q => !att[q.id]).id)}"]`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const d = today(), sc = [L.qs.filter(q => att[q.id] && att[q.id].first).length, L.qs.length];
    done[id] = { d, sc }; put("done", lang, done);
    const s = get("srs", lang, {}) || {}; let added = 0;
    L.items.forEach(it => { if (!s[it.sid]) { s[it.sid] = { s: 0, due: addDays(d, 1), ok: 0, ng: 0, at: d, L: id }; added++; } });
    put("srs", lang, s);
    logDay(lang, d, e => { e.L = (e.L || []).concat(id); });
    toast(`레슨 완료! ${added ? `복습 카드 ${added}장이 내일부터 나와요` : ""}`);
    Ink.flushSave(); route();
  }

  /* ───────── 복습 (간격 반복) ───────── */
  function startReview(lang) {
    const due = dueList(lang), cap = DAILY.reviewCap;
    RS = { lang, list: due.slice(0, cap), rest: due.length - Math.min(cap, due.length), i: 0, flip: false, n: 0, again: new Set() };
  }
  function renderReview(lang) {
    if (!RS || RS.lang !== lang) startReview(lang);
    const D = DATA[lang], p = prefs(lang);
    let h = `<div class="home lhome review"><h1>복습</h1>`;
    if (!RS.list.length) {
      h += `<p class="sub">오늘 복습할 카드가 없어요.</p><div class="tcard empty"><b>잘하고 있어요</b><p>레슨을 마치면 배운 항목이 다음 날부터 1·3·7·14·30일 간격으로 다시 나옵니다.</p><div class="acts"><button class="pill ghost" data-go="#${lang}">오늘의 학습</button><button class="pill ghost" data-go="#${lang}/words">단어장</button></div></div></div>`;
      main.innerHTML = h; return;
    }
    if (RS.i >= RS.list.length) {
      h += `<p class="sub">이번 복습 ${RS.n}장 완료</p><div class="tcard done"><b>복습 끝!</b><p>${RS.rest > 0 ? `아직 ${RS.rest}장이 더 있어요. 시간이 되면 이어서 하세요.` : "오늘 예정된 카드를 모두 봤어요."}</p>
        <div class="acts">${RS.rest > 0 ? `<button class="pill" data-rv="more">${Math.min(RS.rest, DAILY.reviewCap)}장 더 하기</button>` : ""}<button class="pill ghost" data-go="#${lang}">오늘의 학습</button></div></div></div>`;
      main.innerHTML = h; return;
    }
    const sid = RS.list[RS.i], it = D.items[sid], st = (get("srs", lang, {}) || {})[sid] || { s: 0 };
    h += `<p class="sub">${RS.i + 1} / ${RS.list.length}${RS.rest ? ` · 남은 카드 ${RS.rest}` : ""}</p><div class="prog-line"><i style="width:${Math.round(RS.i / RS.list.length * 100)}%"></i></div>
      <div class="flash ${RS.flip ? "flip" : ""}"><div class="front">${tx(lang, it.text)}</div>`;
    if (RS.flip) {
      h += `<div class="back">${it.reading ? `<div class="rd jp" lang="ja">${esc(it.reading)}</div>` : ""}${it.roma ? `<div class="rm">${esc(it.roma)}</div>` : ""}${it.meaning ? `<div class="mn">${it.pos ? `<i>${esc(it.pos)}</i> ` : ""}${esc(it.meaning)}</div>` : ""}${it.ex ? `<div class="ex">${tx(lang, it.ex)}<small>${esc(it.exKo)}</small></div>` : ""}${sayBtn(it.text)}<small class="lvl">단계 ${st.s + 1}/${MAX_S + 1}</small></div>`;
    }
    h += `</div>${RS.flip ? `<div class="rate"><button data-rate="again">다시<small>내일</small></button><button data-rate="hard">어려움<small>${Math.max(1, Math.round(OFF[st.s] / 2))}일</small></button><button data-rate="good">보통<small>${OFF[Math.min(st.s + 1, MAX_S)]}일</small></button><button data-rate="easy">쉬움<small>${OFF[Math.min(st.s + 2, MAX_S)]}일</small></button></div>`
      : `<div class="rate one"><button class="pill" data-rv="flip">정답 보기</button></div><p class="hint">먼저 머릿속으로 읽기·뜻을 떠올린 뒤 정답을 보세요.</p>`}</div>`;
    main.innerHTML = h;
  }
  function rate(lang, how) {
    const sid = RS.list[RS.i], s = get("srs", lang, {}) || {}, e = s[sid] || { s: 0, ok: 0, ng: 0 }, d = today();
    if (how === "again") { e.s = 0; e.ng = (e.ng || 0) + 1; e.due = addDays(d, 1); if (!RS.again.has(sid)) { RS.again.add(sid); RS.list.push(sid); } } // 틀린 카드는 이번 세션 끝에 한 번 더
    else if (how === "hard") { e.due = addDays(d, Math.max(1, Math.round(OFF[e.s] / 2))); e.ok = (e.ok || 0) + 1; }
    else { e.s = Math.min(MAX_S, e.s + (how === "easy" ? 2 : 1)); e.due = addDays(d, OFF[e.s]); e.ok = (e.ok || 0) + 1; }
    e.last = d; s[sid] = e; put("srs", lang, s);
    logDay(lang, d, x => { x.rv = (x.rv || 0) + 1; });
    RS.i++; RS.n++; RS.flip = false; renderReview(lang); renderSide(); renderTabs(lang, "review");
  }

  /* ───────── 오답노트 ───────── */
  function renderWrong(lang) {
    const D = DATA[lang], list = wrongList(lang), att = get("att", lang, {}) || {};
    let h = `<div class="home lhome wrong"><h1>오답노트</h1><p class="sub">${list.length ? `최근 답이 틀린 문제 ${list.length}개 · 다시 맞히면 목록에서 빠져요` : "틀린 문제가 없어요."}</p>`;
    list.forEach(qid => {
      const { q, L } = D.qs[qid], a = att[qid];
      const mine = q.type === "choice" ? q.options[a.a] : a.a;
      h += `<div class="qcard wq"><div class="qmeta"><span>${esc(L.title)}</span><span>내 답: ${esc(mine == null ? "" : plain(mine))}</span><span>시도 ${a.n}회</span></div>${qHtml(lang, q, 0, a, true)}</div>`;
    });
    main.innerHTML = h + `</div>`;
  }

  /* ───────── 학습 기록 (달력) ───────── */
  function renderLog(lang, sel) {
    const g = get("log", lang, {}) || {}, d = today(), D = DATA[lang];
    sel = /^\d{4}-\d{2}-\d{2}$/.test(sel || "") ? sel : d;
    const ym = sel.slice(0, 7), first = ym + "-01", start = wday(first);
    const nextMonth = (() => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; })();
    const prevMonth = (() => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`; })();
    const days = diffDays(first, nextMonth), s = stats(lang);
    let h = `<div class="home lhome log"><h1>학습 기록</h1><p class="sub">연속 ${s.streak}일 · 누적 ${s.days}일 공부했어요</p>
      <div class="cal-head"><button class="icon-btn" data-go="#${lang}/log/${prevMonth}" aria-label="이전 달">‹</button><b>${ym.replace("-", "년 ")}월</b><button class="icon-btn" data-go="#${lang}/log/${nextMonth}" aria-label="다음 달">›</button></div>
      <div class="cal">${WD.map(w => `<span class="wd">${w}</span>`).join("")}${"<span></span>".repeat(start)}`;
    for (let i = 0; i < days; i++) {
      const k = addDays(first, i), e = g[k], les = e && (e.L || []).length, rv = e && e.rv;
      h += `<button class="day ${les ? "les" : rv ? "rv" : ""} ${k === sel ? "sel" : ""} ${k === d ? "is-today" : ""}" data-go="#${lang}/log/${k}">${i + 1}</button>`;
    }
    h += `</div><p class="legend"><span class="les"></span>레슨 완료 <span class="rv"></span>복습만</p>`;
    const e = g[sel];
    h += `<div class="tcard"><span class="tag">${sel.slice(5).replace("-", "월 ")}일 (${WD[wday(sel)]})</span>`;
    if (e && ((e.L || []).length || e.rv || e.n)) {
      h += `${(e.L || []).map(id => { const L = D.lessons[id]; return L ? `<button class="lrow" data-go="#${lang}/lesson/${id}"><b>${esc(L.title)}</b><small>${esc((LG[lang].courses.find(c => c.id === L.course) || {}).t || "")} ${L.day}일차 · 다시 보기 ›</small></button>` : ""; }).join("")}
        <p>${e.rv ? `복습 카드 ${e.rv}장` : "복습 없음"}${e.n ? ` · 문제 ${e.ok || 0}/${e.n} 정답` : ""}</p>`;
    } else h += `<p>이날은 기록이 없어요.</p>`;
    main.innerHTML = h + `</div></div>`;
  }

  /* ───────── 단어장 ───────── */
  function renderWords(lang, filter, qtext) {
    const D = DATA[lang], s = get("srs", lang, {}) || {}, d = today(), p = prefs(lang);
    filter = filter || "all"; qtext = qtext || "";
    let ids = Object.keys(s).filter(k => D.items[k]);
    const cnt = { all: ids.length, due: ids.filter(k => s[k].due <= d).length, strong: ids.filter(k => s[k].s >= 4).length };
    if (filter === "due") ids = ids.filter(k => s[k].due <= d); else if (filter === "strong") ids = ids.filter(k => s[k].s >= 4);
    const nq = norm(qtext);
    if (nq) ids = ids.filter(k => { const it = D.items[k]; return [it.text, plain(it.text), it.reading, it.roma, it.meaning].some(x => norm(x).includes(nq)); });
    ids.sort((a, b) => (s[b].at || "").localeCompare(s[a].at || "") || a.localeCompare(b));
    let h = `<div class="home lhome words"><h1>단어장</h1><p class="sub">레슨에서 익힌 글자·단어 ${cnt.all}개</p>
      <input class="search" type="search" placeholder="검색 (글자·읽기·뜻)" value="${esc(qtext)}" data-wsearch>
      <div class="chips">${[["all", "전체"], ["due", "복습 예정"], ["strong", "잘 외움"]].map(([k, t]) => `<button class="${filter === k ? "on" : ""}" data-wf="${k}">${t} ${cnt[k]}</button>`).join("")}</div><div class="wlist">`;
    if (!ids.length) h += `<p class="empty">${cnt.all ? "조건에 맞는 항목이 없어요." : "아직 익힌 항목이 없어요. 레슨을 완료하면 여기에 쌓여요."}</p>`;
    ids.forEach(k => {
      const it = D.items[k], e = s[k];
      h += `<div class="wrow"><div class="w">${tx(lang, it.text)}</div><div class="m">${it.reading ? `<span class="jp rd" lang="ja">${esc(it.reading)}</span> ` : ""}${it.roma && p.romaji ? `<span class="rm">${esc(it.roma)}</span> ` : ""}${esc(it.meaning || "")}
        <small>${e.due <= d ? "오늘 복습" : `다음 복습 ${e.due.slice(5).replace("-", "/")}`} · 단계 ${e.s + 1}/${MAX_S + 1}</small><span class="lvbar"><i style="width:${Math.round((e.s + 1) / (MAX_S + 1) * 100)}%"></i></span></div>${sayBtn(it.text)}</div>`;
    });
    main.innerHTML = h + `</div></div>`;
  }

  /* ───────── 레슨 목록 ───────── */
  function renderLib(lang, cid) {
    const L = LG[lang], D = DATA[lang], done = get("done", lang, {}) || {};
    cid = L.courses.some(c => c.id === cid) ? cid : prefs(lang).course;
    const list = D.courses[cid] || [], c = L.courses.find(c => c.id === cid);
    let h = `<div class="home lhome lib"><h1>레슨 목록</h1><p class="sub">${esc(c.t)} · ${esc(c.d)}</p>
      <div class="chips">${L.courses.map(x => `<button class="${x.id === cid ? "on" : ""}" data-go="#${lang}/lib/${x.id}">${esc(x.t)} <small>${(D.courses[x.id] || []).length}</small></button>`).join("")}</div><div class="llist">`;
    if (!list.length) h += `<p class="empty">${esc(c.t)} 과정은 추후 추가 예정이에요.</p>`;
    list.forEach(x => (h += `<button class="lrow ${done[x.id] ? "done" : ""}" data-go="#${lang}/lesson/${x.id}"><span class="d">${x.day}</span><span class="t"><b>${esc(x.title)}</b><small>${TYPE[x.type] || esc(x.type)} · ${esc(x.status.lab)}${done[x.id] ? ` · 완료 ${esc(done[x.id].d)}` : ""}</small></span><span class="ck">${done[x.id] ? "✓" : ""}</span></button>`));
    h += `</div>${cid === prefs(lang).course ? "" : `<button class="pill ghost" data-course="${cid}" data-back="1">이 과정으로 공부하기</button>`}</div>`;
    main.innerHTML = h;
  }

  /* ───────── 출처 ───────── */
  function renderSrc(lang) {
    const D = DATA[lang];
    let h = `<div class="home lhome srcs"><h1>출처</h1><p class="sub">레슨의 주제·형식 근거가 되는 공식 자료입니다. 원문·시험문항·음원은 복제하지 않고 링크로만 연결해요.</p><div class="howto"><ul>`;
    D.sources.forEach(s => (h += `<li><a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.p || s.u)}</a><br><small>${esc(s.u)}${s.s ? " · " + esc(s.s) : ""}</small></li>`));
    main.innerHTML = h + `</ul></div><p class="notice small">${esc(LG[lang].notice)}</p></div>`;
  }

  /* ───────── 사용법 ───────── */
  function renderGuide() {
    main.innerHTML = `<div class="home guide"><h1>사용법</h1>
      <div class="howto"><h3>하루 공부 순서</h3>왼쪽 목차(휴대폰은 ☰)에서 <b>언어</b>를 누르면 그 언어의 메뉴가 펼쳐집니다.<br>
      1. <b>오늘의 학습</b>에서 과정(난이도)을 고릅니다. 하루 분량은 15분(복습 4분·새 단어 4분·예문 2분·문제 4분·쓰기 1분)으로 고정돼 있어요.<br>2. <b>복습</b> 카드부터 넘기고(밀린 게 많으면 복습 먼저 권해요), <b>오늘의 레슨</b>을 시작합니다.<br>
      3. 레슨의 글자·단어·예문을 보고 <b>확인 문제</b>를 모두 푼 뒤 <b>레슨 완료하기</b>를 누르면, 배운 항목이 내일부터 1·3·7·14·30일 간격으로 복습 카드에 나옵니다.<br>
      4. 하루에 새 레슨은 하나씩 열립니다. 빠진 날의 레슨이 한꺼번에 몰려오지 않고 다음 날 이어서 나옵니다.</div>
      <div class="howto"><h3>기록 확인 · 복습</h3><b>학습 기록</b> 달력에서 날짜를 누르면 그날 공부한 레슨을 다시 열 수 있어요. <b>단어장</b>에는 익힌 항목과 다음 복습일이, <b>오답노트</b>에는 틀린 문제가 모여 있어 다시 풀 수 있어요.</div>
      <div class="howto"><h3>자료 표시</h3><b>내부 검토</b>: 이 사이트에서 정답·문법을 점검한 자료 · <b>검수 전 초안</b> / <b>AI 초안</b>: 전문가 검수 전 교육용 자료입니다. 레벨은 사이트 자체 학습 단계이며 CEFR·JLPT 공식 등급이나 시험 점수가 아닙니다. 듣기 버튼은 브라우저 자동 음성(TTS)입니다.</div>
      <div class="howto"><h3>기기 간 동기화</h3>목차 아래 <b>동기화 설정</b>에 같은 동기화 코드(6자 이상)를 노트북·태블릿·휴대폰에 입력하면 진도·복습 일정·오답·필기가 공유됩니다. 동기화 없이도 <b>백업 저장 / 불러오기</b>로 옮길 수 있어요.</div>
      <div class="howto"><h3>필기 · 포스트잇 (노트북·태블릿)</h3>화면이 넓은 기기에서 레슨을 열면 필기 툴바(펜·형광펜·가림펜·지우개·포스트잇)가 나옵니다. 휴대폰에서는 글씨를 크게 보여 주기 위해 필기 없이 표시되고, 태블릿에서 쓴 필기는 태블릿·노트북에서 보입니다.</div></div>`;
  }

  /* ───────── 클릭 · 입력 ───────── */
  main.addEventListener("click", e => {
    const t = e.target;
    if (t.closest(".postit")) return;
    if (t.closest("a[href^='http']")) return;
    const [lang] = parts();
    const say = t.closest("[data-say]"); if (say) { speak(lang, say.dataset.say); return; }
    const go = t.closest("[data-go]"); if (go && !go.dataset.course) { location.hash = go.dataset.go; return; }
    const crs = t.closest("[data-course]"); if (crs) { setPref(lang, "course", crs.dataset.course); if (crs.dataset.back) location.hash = "#" + lang; else route(); return; }
    const pf = t.closest("[data-pref]"); if (pf) { const k = pf.dataset.pref; setPref(lang, k, !prefs(lang)[k]); applyPrefs(); route(); return; }
    const op = t.closest(".choice[data-opt]");
    if (op && !op.disabled) { const block = op.closest(".qblock"), r = answer(lang, block.dataset.q, Number(op.dataset.opt)); if (r) { redrawQ(block, lang, r.q, r.a); if (parts()[1] === "wrong") renderSide(); } return; }
    const rt = t.closest("[data-retry]"); if (rt) { const block = rt.closest(".qblock"), hit = DATA[lang].qs[rt.dataset.retry]; redrawQ(block, lang, hit.q, null, true); return; }
    const fin = t.closest("[data-finish]"); if (fin) { finish(lang, fin.dataset.finish); return; }
    const rv = t.closest("[data-rv]");
    if (rv) { if (rv.dataset.rv === "flip") { RS.flip = true; renderReview(lang); const f = main.querySelector(".back [data-say]"); if (f && prefs(lang).autoSay) speak(lang, f.dataset.say); } else { startReview(lang); renderReview(lang); } return; }
    const rr = t.closest("[data-rate]"); if (rr) { rate(lang, rr.dataset.rate); return; }
    const wf = t.closest("[data-wf]"); if (wf) { const q = main.querySelector("[data-wsearch]"); renderWords(lang, wf.dataset.wf, q ? q.value : ""); return; }
    if (t.closest(".flash") && RS && !RS.flip) { RS.flip = true; renderReview(lang); }
  });
  main.addEventListener("submit", e => {
    const f = e.target.closest("form.typing"); if (!f) return;
    e.preventDefault();
    const [lang] = parts(), v = f.querySelector("input").value;
    if (!v.trim()) return toast("답을 입력해 주세요");
    const block = f.closest(".qblock"), r = answer(lang, f.dataset.type, v.trim());
    if (r) redrawQ(block, lang, r.q, r.a);
  });
  let outT = null;
  main.addEventListener("input", e => {
    const [lang] = parts();
    const o = e.target.closest("[data-out]");
    if (o) { clearTimeout(outT); outT = setTimeout(() => { const m = get("out", lang, {}) || {}; m[o.dataset.out] = o.value; put("out", lang, m); }, 500); return; }
    const ws = e.target.closest("[data-wsearch]");
    if (ws) { const pos = ws.selectionStart, f = (main.querySelector("[data-wf].on") || {}).dataset; renderWords(lang, f ? f.wf : "all", ws.value); const n = main.querySelector("[data-wsearch]"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) {} }
  });
  document.addEventListener("keydown", e => {
    if (!RS || parts()[1] !== "review" || e.target.closest("input, textarea")) return;
    const lang = parts()[0];
    if (!RS.flip && (e.key === " " || e.key === "Enter")) { e.preventDefault(); RS.flip = true; renderReview(lang); }
    else if (RS.flip && ["1", "2", "3", "4"].includes(e.key)) rate(lang, ["again", "hard", "good", "easy"][+e.key - 1]);
  });
  function applyPrefs() { const p = prefs("ja"); document.body.classList.toggle("no-furi", !p.furi); }

  /* ───────── 백업 · 동기화 ───────── */
  document.getElementById("btn-export").addEventListener("click", () => {
    Ink.flushSave();
    const blob = new Blob([JSON.stringify(Store.exportAll())], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${SITE.title.replace(/\s+/g, "")}_백업_${today()}.json`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("백업 파일을 저장했어요");
  });
  const fImp = document.getElementById("file-import");
  document.getElementById("btn-import").addEventListener("click", () => fImp.click());
  fImp.addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (!o || typeof o !== "object" || Array.isArray(o) || !Object.values(o).every(r => r && typeof r === "object" && "t" in r && "v" in r)) throw new Error("형식");
      const n = Store.importAll(o); RS = null; toast(`백업을 불러왔어요 (${n}개 항목)`); route();
    } catch (err) { toast(`이 파일은 ${SITE.title} 백업 파일이 아니에요`); }
    e.target.value = "";
  });
  const modal = document.getElementById("sync-modal");
  document.getElementById("btn-sync").addEventListener("click", () => {
    const on = Store.syncConnected();
    modal.querySelector(".state").innerHTML = on ? "이 기기는 동기화 중입니다." : Store.syncAvailable() ? "이 기기는 아직 동기화되지 않았어요." : "이 주소에서는 동기화를 쓸 수 없어요 (https 웹 주소에서 열어 주세요).";
    modal.querySelector("[data-off]").style.display = on ? "" : "none";
    modal.querySelector("input").value = "";
    modal.classList.add("show");
    setTimeout(() => modal.querySelector("input").focus(), 50);
  });
  modal.addEventListener("click", e => { if (e.target === modal || e.target.closest("[data-close]")) modal.classList.remove("show"); });
  modal.querySelector("form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = modal.querySelector("input").value.trim();
    if (code.length < 6) { toast("코드는 6자 이상으로 정해 주세요"); return; }
    const btn = modal.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "연결 중…";
    const ok = await Store.syncConnect(code);
    btn.disabled = false; btn.textContent = "연결";
    if (ok) { modal.classList.remove("show"); RS = null; toast("동기화 연결! 다른 기기에서도 같은 코드를 입력하세요"); route(); }
    else toast("동기화 서버에 연결하지 못했어요. 인터넷을 확인해 주세요");
  });
  modal.querySelector("[data-off]").addEventListener("click", () => { Store.syncDisconnect(); modal.classList.remove("show"); toast("동기화를 껐어요. 이 기기 기록은 그대로 남아요"); });

  /* ───────── 라우팅 ───────── */
  function parts() { return decodeURIComponent(location.hash).replace(/^#\/?/, "").split("/"); }
  let routeN = 0;
  async function route() {
    const n = ++routeN, [a, b, c] = parts();
    Ink.detach();
    if (ro) { ro.disconnect(); ro = null; }
    page = null; scaler = null; wideNow = null;
    main.scrollTop = 0;
    applyPrefs();
    if (LG[a]) {
      if (b !== "review") RS = null;
      if (!DATA[a] || !DATA[a].items || !DATA[a].courses[LG[a].courses[0].id]) main.innerHTML = `<div class="home"><p class="sub">${esc(LG[a].name)} 자료를 불러오는 중…</p></div>`;
      await load(a);
      if (n !== routeN) return;
      if (folds()[a] == null) setFold(a, true);
      const name = esc(LG[a].name);
      if (b === "lesson") renderLesson(a, c);
      else if (b === "review") { crumb.innerHTML = `${name} · 복습`; renderReview(a); }
      else if (b === "wrong") { crumb.innerHTML = `${name} · 오답노트`; renderWrong(a); }
      else if (b === "log") { crumb.innerHTML = `${name} · 학습 기록`; renderLog(a, c); }
      else if (b === "words") { crumb.innerHTML = `${name} · 단어장`; renderWords(a); }
      else if (b === "lib") { crumb.innerHTML = `${name} · 레슨 목록`; renderLib(a, c); }
      else if (b === "src") { crumb.innerHTML = `${name} · 출처`; renderSrc(a); }
      else { crumb.innerHTML = `${name} · 오늘의 학습`; renderToday(a); }
      renderTabs(a, b === "lesson" ? "" : b);
    } else {
      RS = null; renderTabs(null);
      if (a === "guide") { crumb.innerHTML = "사용법"; renderGuide(); }
      else { crumb.innerHTML = esc(SITE.title); renderHome(); }
    }
    renderSide();
  }
  window.addEventListener("hashchange", route);
  Store.onRemote(keys => {
    if (!keys.some(k => /^(prefs|done|att|srs|log):/.test(k))) return;
    const [a, b] = parts();
    if (b === "lesson" || b === "review" || b === "wrong") { renderSide(); return; } // 공부 중인 화면은 그대로 두고 목차만 갱신
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest("input, textarea")) { renderSide(); return; }
    const y = main.scrollTop; route().then(() => (main.scrollTop = y));
  });

  if (Store.get("sideOpen", window.innerWidth >= 1100) === false || window.innerWidth < 900) document.body.classList.add("side-closed");
  const syncLabel = mode => mode === "sync" ? "실시간 동기화 중" : mode === "server" ? "기기 간 동기화 중 (노트북 서버)" : "이 기기에만 저장 · 동기화 설정으로 기기 연결";
  route();
  LANGS.forEach(l => load(l.id).then(() => { renderSide(); if (!parts()[0] || parts()[0] === "home") renderHome(); }));
  Store.init().then(mode => { document.getElementById("sync-state").textContent = syncLabel(mode); if (mode === "sync") route(); });
})();
