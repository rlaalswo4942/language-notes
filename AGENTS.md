# 언어 학습노트 — 에이전트 안내

영어·일본어 공부 사이트. 기능·구조는 README.md, 레슨 추가 규칙은 docs/CONTENT_GUIDE.md.

## 규칙
- 공용 엔진 `js/store.js` `js/draw.js` `css/style.css` 는 `학습사이트_프레임`과 동일하게 유지. 고치면 프레임·다른 학습 사이트에도 같이 반영
- 이 사이트 화면은 `js/lang.js` `css/lang.css`, 설정은 `js/content.js` 에서만 바꾼다 (frame 의 app.js 는 쓰지 않음)
- 하루 분량은 15분 고정: 영어 단어 6·예문 8+·문제 6 / 일본어 예문 6+·문제 6 (docs/CONTENT_GUIDE.md 표)
- 레슨은 과정 파일 `lessons` 끝에만 추가, 기존 레슨 id·내용을 바꾸지 않음 (완료·복습·필기 기록 키). 추가 후 `python tools/validate.py` 통과 필수
- 새로 만든 레슨은 상태 `draft`. 원본 초기 데이터(docs/)의 뜻·독음을 임의로 고치지 않음 — 수정이 필요하면 따로 제안
- 디자인은 무채색(배경 #f5f5f7, 흰 타일, 글자 #1d1d1f). 색은 정답/오답에만. 장식 이모지 없음
- 휴대폰(700px 미만)은 반응형 레이아웃, 노트북·태블릿은 1000px 고정폭 + 필기. 화면 바꾸면 세 크기 모두 확인
- 확인: `학습노트_열기.bat`(포트 8781)

## 사용자 · 현황판
- 이름 = 아이디(NFKC·소문자·공백 정리), 비밀번호 없음, 최대 `SITE.maxUsers`(4). localStorage `langnote-user` = {id, name}
- 개인 기록은 Store.syncConnect("user:" + 아이디) 공간. 로그아웃·다른 이름 로그인 때 `langnote:*` 로컬 키를 지우고 새로고침(기록 섞임 방지)
- 현황판 공간 sha256("langnote:__board__"): `user:<아이디>` {name, created}, `sum:<아이디>` {name, at, en:{course, cdone, ctotal, lessons, streak, days, items, acc, today, last}, ja:{…}}
- 정원 검사는 클라이언트에서만 함(서버 강제 아님). 테스트는 실제 서버 대신 API를 가로채서 할 것 — 실제 서버에 테스트 사용자를 만들면 정원을 차지함

## 저장 키 (localStorage `langnote:<키>` = `{t, v}`, 동기화 서버도 같은 형식)
- `prefs:<언어>` {course, romaji, furi} (하루 15분 고정 — content.js SITE.daily) · `done:<언어>` {레슨id: {d, sc:[첫시도 정답, 문항수]}}
- `att:<언어>` {문제id: {ok, a, n, first, t, L}} · `srs:<언어>` {항목id(k:글자/w:단어): {s 단계, due, ok, ng, at, L}}
- `log:<언어>` {날짜: {L:[레슨id], rv, ok, n}} · `out:<언어>` {레슨id: 직접 쓴 문장}
- `ink:<언어>-<레슨id>` `notes:<언어>-<레슨id>` 필기·포스트잇 (draw.js)
- 날짜는 한국 시간 기준 YYYY-MM-DD
