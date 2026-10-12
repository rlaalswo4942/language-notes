# 레슨 추가 가이드 (매일 루틴 · 사람 모두 이 문서를 따름)

## 기준 문서
- 영어: `docs/en/01_학습_로드맵.md`(단계·1~30일 주제표·7일 루틴), `docs/en/02_웹사이트_기능_명세.md`(필드), `docs/en/05_출처_검증_가이드.md`(출처)
- 일본어: `docs/ja/일본어_장기학습_설계서.md`(단계·주차 계획·필드·QA 체크리스트)
- 원본 초기 데이터: `docs/en/04_초기_검증_레슨.json`, `docs/ja/일본어_입문_28일_초기데이터.json` (수정하지 않음)

## 어디에 무엇을 추가하나
- 파일: `content/<언어>/<과정>.json` 의 `lessons` 배열 **끝에만** 추가. 기존 레슨은 고치지 않는다(학습 기록·필기 키가 레슨 id라서)
  - 영어 과정: `PRE-A1 A1 A2 B1 B2 TOEIC TOEFL` / 일본어 과정: `INTRO N5 N4 N3 N2 N1`
  - 새 과정 파일은 `{"course": "<과정>", "schema_version": "1.0", "lessons": []}` 로 시작
- 얼마나: `content/schedule.json` (실행할 때마다)
  - `sequence` 에 있는 **모든 과정**에 `per_course_per_run`(1)개씩 다음 일차를 추가 — 사용자가 어느 단계를 골라도 매일 새 레슨이 생김
  - 언어마다 레슨 수가 `plan_days` 보다 적은 **가장 낮은 과정**은, 그 언어 전체 레슨 수가 (오늘(한국 시간) - `start` 일수) + `ahead_days` 보다 적으면 `extra_lowest`(1)개 더 추가
  - 레슨 수가 `plan_days` 에 닿은 과정은 더 늘리지 않고 보고에 적는다
  - 7일 리듬: 영어는 7·14·21…일차가 주간 복습, 일본어는 6·13…일차 practice, 7·14…일차 checkpoint
- 다 쓴 뒤 `python tools/validate.py` 실행 → 통과해야만 커밋 (index.json 도 이때 갱신됨)

## 하루 분량 = 15분 고정 (모든 새 레슨의 최소 기준)
사이트는 시간 선택 없이 하루 15분으로 고정: 복습 카드 4분(15장) · 새 단어 4분 · 예문 2분 · 확인 문제 4분 · 쓰기 1분
| 항목 | 영어 | 일본어 입문(INTRO) | 일본어 N5 이후 |
|---|---|---|---|
| 새 단어 | `vocabulary` 6개 (각각 예문·해석 포함) | 새 가나는 커리큘럼대로 + 단어 예문 | `new_items` 단어 6개 |
| 텍스트 예문 | `examples` **8개 이상** (en/ko) | `examples` 단어·짧은 구 **6개 이상** (이미 배운 가나만) | `examples` 문장 **8개 이상** |
| 확인 문제 | **6개** (객관식 4 + 입력형 2) | **6개** (보기 고르기·뜻 고르기 + 로마자 입력) | **6개** |
| 쓰기 | `output_task` 1개 | — | 필요하면 |
- 입력형(typing) 문제: `"type": "typing", "answer_text": "...", "accepted_answers": [...]` — 대소문자·끝 마침표는 화면에서 무시. 일본어 로마자는 헵번식 + 훈령식(si/ti/tu/hu/zi/sya…) + 장음 생략형(kyou → kyo) + nn 을 accepted 에 함께 넣는다
- 주간 복습(영어 7일차)·practice/checkpoint(일본어 6·7일차)도 같은 분량

## 보강 파일 (`content/<언어>/<과정>.plus.json`)
- 15분 기준 이전에 만든 레슨(영어 1~10일차·B1/TOEIC/TOEFL 1, 일본어 입문 1~31일차)의 예문·단어·문제를 더한 파일. 원본 레슨은 그대로 두고 화면에서 합쳐 보여 줌
- **새 레슨은 보강 파일을 쓰지 말고 본 파일에 처음부터 15분 분량으로** 작성. 보강 파일은 사람이 요청할 때만 수정

## 레슨 형식
### 영어 (`content/en/*.json`)
```json
{
 "id": "PRE-008", "publish_date": "YYYY-MM-DD", "level": "Pre-A1", "track": "foundation", "day": 8,
 "title_ko": "this / that", "objective_ko": "가까운 것과 먼 것을 가리키는 말을 구별한다.", "estimated_minutes": 25,
 "reference_sources": [{"url": "https://learnenglish.britishcouncil.org/free-resources/grammar/a1-a2", "publisher": "British Council", "checked_at": "YYYY-MM-DD", "supports": "문법 학습 주제"}],
 "content_kind": "original_practice", "review_status": "draft",
 "grammar": {"explanation_ko": "...", "common_mistake_ko": "..."},
 "vocabulary": [{"word": "this", "part_of_speech": "대명사", "meaning_ko": "이것", "example_en": "This is my bag.", "example_ko": "이것은 내 가방이에요."}],
 "examples": [{"en": "...", "ko": "..."}],
 "questions": [{"id": "P008-Q1", "type": "single_choice", "stem": "...", "choices": ["...", "...", "...", "..."], "answer_index": 0, "explanation_ko": "...", "error_tag": "demonstrative"}],
 "output_task": {"prompt_ko": "...", "example_answer_en": "", "note_ko": "예시 정답만 가능한 것은 아닙니다."},
 "revision": {"version": 1, "last_revised": "YYYY-MM-DD"}
}
```
- id: 과정 접두어 + 3자리 일차 (`PRE-` `A1-` `A2-` `B1-` `B2-` `TOEIC-` `TOEFL-`), 문제 id 는 기존 규칙(`P008-Q1` 등)처럼 전체에서 유일
- 분량은 위 '하루 분량' 표 기준. 객관식 보기 2~4개·정답 하나, 모든 문제에 해설
- 7일 루틴: 7번째 일차마다 1주 복습(새 단어 0~2개, 혼합 문제), 주제표(1~30일)가 있으면 그 순서를 따름
- TOEFL은 2026-01-21 이후 형식·1~6점 체계만, TOEIC은 L&R Part 1~7. "ETS 공식 문항"이라고 쓰지 않음

### 일본어 (`content/ja/*.json`)
```json
{
 "id": "JP-INTRO-29", "day_index": 29, "week_index": 5, "level": "INTRO", "unit_id": "INTRO-W05", "lesson_type": "new",
 "title_ko": "가타카나 ア행", "objective_ko": "...", "estimated_minutes": 20, "prerequisite_lesson_ids": ["JP-INTRO-28"],
 "new_items": [{"id": "kana-d29-01", "kind": "kana", "text": "ア", "reading_romanized": "a", "meaning_ko": null}],
 "examples": [{"japanese": "アイス", "reading_romanized": "aisu", "meaning_ko": "아이스(크림)", "explanation_ko": "..."}],
 "exercises": [
  {"id": "JP-INTRO-29-Q1", "type": "single_choice", "prompt_ko": "「ア」의 일반적인 로마자 표기는 무엇인가요?", "options": ["a", "i", "u", "e"], "answer_index": 0, "explanation_ko": "..."},
  {"id": "JP-INTRO-29-Q2", "type": "typing", "prompt_ko": "「イ」를 로마자로 입력하세요.", "answer_text": "i", "accepted_answers": ["i"], "explanation_ko": "..."}
 ],
 "review_offsets_days": [1, 3, 7, 14, 30], "source_refs": ["JF_KATAKANA"],
 "content_status": "draft", "schema_validation": "passed", "editor_note_ko": "AI 초안: 자동 형식 검사만 통과, 언어 교육자 검수 전"
}
```
- lesson_type: `new` / `practice`(6일차 리듬, 새 글자 없이 적용) / `checkpoint`(7일차 리듬, 주간 점검)
- 입문 과정: 예문은 **이미 배운 가나만** 사용 (검사 스크립트가 확인). 1~2개월차는 로마자 표기 포함
- N5·N4 예문은 단어 사이를 띄어 쓰고(初級 교재식), N3 이상은 붙여 쓴다. 한자에는 모두 `漢字{かんじ}` 읽기를 단다 (화면의 ‘히라가나’ 표시)
- N5 이후: 단어는 `new_items` 에 `{"kind": "word", "text": "学生{がくせい}", "reading_kana": "がくせい", "reading_romanized": "gakusei", "meaning_ko": "학생", "part_of_speech": "명사"}` — 한자 뒤 `{읽기}` 는 화면에서 후리가나로 표시
  - 문법·설명은 `explanation_ko`, 주의점은 `usage_notes` / `common_mistakes` (문자열 배열)
- `source_refs` 는 `content/ja/sources.json` 의 키만 사용

## 반드시 지킬 것 (설계서 원칙)
- 예문·문제는 새로 쓴 자체 연습용. 외부 지문·시험 문항·음원을 복사하지 않음. 출처는 링크만
- 새 레슨 상태는 항상 `draft` (화면에 "AI 초안 · 자동 검사 통과"로 표시됨). `verified`/`published` 로 올리는 건 사람만
- 확인 못 한 사실을 지어내지 않음. 확신이 없는 문법 설명은 쓰지 말고 그 레슨을 만들지 않는다
- 공식 단어 목록(JLPT·CEFR)이라고 표현하지 않음. 점수 예측 없음
- 정답이 하나인지, 보기 중 정답과 같은 뜻이 또 있는지, 한국어 해석이 맞는지 스스로 다시 확인
