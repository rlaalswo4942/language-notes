# 레슨 추가 가이드 (매일 루틴 · 사람 모두 이 문서를 따름)

## 기준 문서
- 영어: `docs/en/01_학습_로드맵.md`(단계·1~30일 주제표·7일 루틴), `docs/en/02_웹사이트_기능_명세.md`(필드), `docs/en/05_출처_검증_가이드.md`(출처)
- 일본어: `docs/ja/일본어_장기학습_설계서.md`(단계·주차 계획·필드·QA 체크리스트)
- 원본 초기 데이터: `docs/en/04_초기_검증_레슨.json`, `docs/ja/일본어_입문_28일_초기데이터.json` (수정하지 않음)

## 어디에 무엇을 추가하나
- 파일: `content/<언어>/<과정>.json` 의 `lessons` 배열 **끝에만** 추가. 기존 레슨은 고치지 않는다(학습 기록·필기 키가 레슨 id라서)
  - 영어 과정: `PRE-A1 A1 A2 B1 B2 TOEIC TOEFL` / 일본어 과정: `INTRO N5 N4 N3 N2 N1`
  - 새 과정 파일은 `{"course": "<과정>", "schema_version": "1.0", "lessons": []}` 로 시작
- 얼마나: `content/schedule.json` (언어마다 따로 계산)
  - 그 언어의 `sequence` 과정들의 레슨 수 합계 = 현재 비축량
  - 목표 = (오늘(한국 시간) - `start` 일수) + `ahead_days`. 비축량이 목표보다 적으면 이번 실행에 그 언어에 최대 `max_per_run` 개 추가
  - 추가할 곳 = `sequence` 에서 레슨 수가 `plan_days` 보다 적은 **첫 과정** (가장 낮은 단계부터). 그 과정이 차면 다음 과정 1일차부터 시작
  - TOEIC·TOEFL 과정은 sequence 밖 — 사람이 요청할 때만 추가
- 다 쓴 뒤 `python tools/validate.py` 실행 → 통과해야만 커밋 (index.json 도 이때 갱신됨)

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
- 단어 4~6개, 예문 2~3개, 문제 3개(객관식, 보기 2~4개, 정답 하나), 모든 문제에 해설
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
- N5 이후: 단어는 `new_items` 에 `{"kind": "word", "text": "学生{がくせい}", "reading_kana": "がくせい", "reading_romanized": "gakusei", "meaning_ko": "학생", "part_of_speech": "명사"}` — 한자 뒤 `{읽기}` 는 화면에서 후리가나로 표시
  - 문법·설명은 `explanation_ko`, 주의점은 `usage_notes` / `common_mistakes` (문자열 배열)
- `source_refs` 는 `content/ja/sources.json` 의 키만 사용

## 반드시 지킬 것 (설계서 원칙)
- 예문·문제는 새로 쓴 자체 연습용. 외부 지문·시험 문항·음원을 복사하지 않음. 출처는 링크만
- 새 레슨 상태는 항상 `draft` (화면에 "AI 초안 · 자동 검사 통과"로 표시됨). `verified`/`published` 로 올리는 건 사람만
- 확인 못 한 사실을 지어내지 않음. 확신이 없는 문법 설명은 쓰지 말고 그 레슨을 만들지 않는다
- 공식 단어 목록(JLPT·CEFR)이라고 표현하지 않음. 점수 예측 없음
- 정답이 하나인지, 보기 중 정답과 같은 뜻이 또 있는지, 한국어 해석이 맞는지 스스로 다시 확인
