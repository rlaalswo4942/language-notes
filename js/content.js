/* 언어 학습노트 - 사이트 설정 + 언어·과정 정의
 * 학습 내용은 content/<언어>/<과정>.json (레슨 배열), content/<언어>/index.json (과정별 레슨 수 — tools/validate.py 가 만듦)
 * 레슨 형식은 docs/ 의 원본 설계서·초기 데이터 형식을 그대로 따름 (일본어: 설계서 7장 필드, 영어: 기능 명세 '콘텐츠 구조와 필드')
 */
window.SITE = {
  title: "언어 학습노트",                  // 홈 큰 제목 · 브라우저 탭 · 백업 파일 이름
  icon: "📗",                             // 탭 아이콘(favicon)
  key: "langnote",                        // ★ 저장 키 — 다른 학습 사이트와 겹치지 않게
  syncApi: "https://ai-hackathon-sync.vercel.app/api/state", // 기존 동기화 API 재사용 (key 로 공간 분리)
  daily: { minutes: 15, reviewCap: 15, plan: "복습 카드 4분 · 새 단어 4분 · 예문 2분 · 확인 문제 4분 · 쓰기 1분" }, // 하루 학습량 고정 (시간 선택 없음)
  autoUpdate: true,                       // 매일 새 레슨 자동 추가(Claude 루틴)가 실제로 돌아가면 true — 화면 안내 문구가 바뀜
  resetEpoch: "",                       // 값을 새로 바꾸면 각 기기에서 처음 열 때 기록을 한 번 초기화
  resetKeys: ""                           // "*" = 필기·포스트잇까지 전부, 빈 값 = 진도만 (아래 progressKeys)
};

/* 언어 정의
 *  courses: 사이드바·레슨 목록·과정 선택에 쓰는 단계. 데이터 파일이 없으면 '추후 추가 예정'으로 표시 (가짜 레슨을 채우지 않음)
 */
window.LANGS = [
  {
    id: "en", name: "영어", native: "English", tts: "en-US",
    courses: [
      { id: "PRE-A1", t: "Pre-A1", d: "알파벳·대명사·be동사·기본 어순" },
      { id: "A1", t: "A1", d: "일반동사 현재·3인칭 단수·can·현재진행" },
      { id: "A2", t: "A2", d: "과거·미래·비교·조동사·짧은 이메일" },
      { id: "B1", t: "B1", d: "현재완료·조건문·수동태·관계절·의견과 요약" },
      { id: "B2", t: "B2", d: "복합절·추론·논거·긴 듣기·문단 구성" },
      { id: "TOEIC", t: "TOEIC L&R", d: "LC Part 1~4 · RC Part 5~7 · 10~990점" },
      { id: "TOEFL", t: "TOEFL iBT 2026", d: "2026-01-21 이후 형식 · 1~6점 체계" }
    ],
    notice: "레벨은 이 사이트의 학습 단계이며 공인 CEFR 인증이 아닙니다. 문제는 자체 제작 연습문제이고 ETS 공식 문항이 아닙니다.",
    week: ["문법 중심 새 단원", "문장 만들기", "짧은 읽기·대화", "듣기·발음", "실생활 적용", "누적 오답 복습 + 응용 표현", "주간 미니 진단 + 짧은 읽기"]
  },
  {
    id: "ja", name: "일본어", native: "日本語", tts: "ja-JP",
    courses: [
      { id: "INTRO", t: "입문", d: "히라가나·가타카나·박자·기초 문장" },
      { id: "N5", t: "N5", d: "자기소개·숫자·시간·장소·기초 일상" },
      { id: "N4", t: "N4", d: "일상 설명·계획·경험·기본 독해" },
      { id: "N3", t: "N3", d: "다양한 일상 상황의 자연스러운 표현" },
      { id: "N2", t: "N2", d: "논리적 긴 글·공지·사회 이슈·직장 표현" },
      { id: "N1", t: "N1", d: "논설·비평·추상적 주제·자연 속도 뉴스" }
    ],
    notice: "단계는 사이트 자체 교육 난도이며 JLPT 공식 어휘·문법 목록이 아닙니다. 초기 데이터는 언어 교육자 검수 전 초안입니다.",
    week: ["새 자료 + 복습", "새 자료 + 복습", "새 자료 + 복습", "새 자료 + 복습", "새 자료 + 복습", "이번 주 내용을 단어·대화에 적용", "누적 점검 · 부족한 부분 재학습"],
    romaji: true                              // 로마자 표시 토글 제공 (입문 과정 기본 켬)
  }
];

/* 진도 초기화(resetEpoch)할 때 지울 키 — 필기(ink:)·포스트잇(notes:)은 resetKeys "*" 일 때만 */
window.SITE.resetKeys = window.SITE.resetKeys || ["prefs:en", "prefs:ja", "done:en", "done:ja", "att:en", "att:ja", "srs:en", "srs:ja", "log:en", "log:ja", "out:en", "out:ja"];
