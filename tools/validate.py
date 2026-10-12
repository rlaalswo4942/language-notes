"""레슨 데이터 자동 검사 — content/<언어>/<과정>.json
사용: python tools/validate.py            (전체 검사, 오류가 있으면 종료 코드 1)
검사: JSON 형식, 레슨 id·문제 id 중복, 과정 안의 일차 순서(1부터 빈칸 없이), 필수 필드,
      객관식 보기 수·정답 인덱스 범위·보기 중복, 입력형 허용 답, 해설 유무, 상태값,
      일본어 선수 레슨 순서·입문 과정 예문이 이미 배운 가나만 쓰는지, 영어 단어 필드
※ 형식 검사일 뿐 언어학적 정확성을 보증하지 않음 (docs/ 설계서 원칙)
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COURSES = {"en": ["PRE-A1", "A1", "A2", "B1", "B2", "TOEIC", "TOEFL"], "ja": ["INTRO", "N5", "N4", "N3", "N2", "N1"]}
STATUS = {"verified", "published", "draft", "linguistic_review_pending", "needs_review"}
KANA = lambda c: "぀" <= c <= "ヿ"


def check_questions(lid, qs, err, seen_q, ja):
    if not qs:
        err.append(f"{lid}: 문제가 없음")
    for q in qs:
        qid = q.get("id")
        if not qid:
            err.append(f"{lid}: id 없는 문제")
            continue
        if qid in seen_q:
            err.append(f"{lid}: 문제 id 중복 {qid}")
        seen_q.add(qid)
        if not (q.get("prompt_ko") if ja else q.get("stem")):
            err.append(f"{qid}: 문제 문장 없음")
        if not q.get("explanation_ko"):
            err.append(f"{qid}: 해설 없음")
        if q.get("type") == "typing":
            acc = [q.get("answer_text")] + list(q.get("accepted_answers") or [])
            if not any(a for a in acc if isinstance(a, str) and a.strip()):
                err.append(f"{qid}: 입력형 정답 없음")
        else:
            opts = q.get("options" if ja else "choices") or []
            ai = q.get("answer_index")
            if len(opts) < 2:
                err.append(f"{qid}: 보기 2개 미만")
            if not isinstance(ai, int) or not 0 <= ai < len(opts):
                err.append(f"{qid}: 정답 인덱스 범위 밖 ({ai})")
            if len({str(o).strip() for o in opts}) != len(opts):  # 대소문자는 구분 (i / I 문제)
                err.append(f"{qid}: 보기 중복")


def main():
    err, warn, report = [], [], []
    seen_l, seen_q = set(), set()
    for lang, courses in COURSES.items():
        for c in courses:
            p = os.path.join(ROOT, "content", lang, c + ".json")
            if not os.path.exists(p):
                continue
            try:
                with open(p, encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                err.append(f"{lang}/{c}: JSON 오류 {e}")
                continue
            lessons = data.get("lessons")
            if not isinstance(lessons, list):
                err.append(f"{lang}/{c}: lessons 배열 없음")
                continue
            ja = lang == "ja"
            days = [l.get("day_index" if ja else "day") for l in lessons]
            if days != list(range(1, len(lessons) + 1)):
                err.append(f"{lang}/{c}: 일차가 1부터 순서대로가 아님 {days}")
            order = {}
            taught = set()
            for i, l in enumerate(lessons):
                lid = l.get("id")
                if not lid:
                    err.append(f"{lang}/{c} #{i + 1}: id 없음")
                    continue
                if lid in seen_l:
                    err.append(f"{lid}: 레슨 id 중복")
                seen_l.add(lid)
                order[lid] = i
                st = l.get("content_status" if ja else "review_status")
                if st not in STATUS:
                    err.append(f"{lid}: 상태값 이상 ({st})")
                for k in ["title_ko", "objective_ko"]:
                    if not l.get(k):
                        err.append(f"{lid}: {k} 없음")
                if ja:
                    for pr in l.get("prerequisite_lesson_ids") or []:
                        if pr not in order:
                            err.append(f"{lid}: 선수 레슨 {pr} 가 앞에 없음")
                    for it in l.get("new_items") or []:
                        if not it.get("text"):
                            err.append(f"{lid}: 새 항목 text 없음")
                        if it.get("kind") == "kana":
                            taught.update(it["text"])
                    if c == "INTRO":
                        for ex in l.get("examples") or []:
                            bad = [ch for ch in ex.get("japanese", "") if KANA(ch) and ch not in taught and ch != "ー"]
                            if bad:
                                err.append(f"{lid}: 예문 「{ex.get('japanese')}」에 아직 안 배운 가나 {''.join(bad)}")
                    check_questions(lid, l.get("exercises") or [], err, seen_q, True)
                else:
                    for v in l.get("vocabulary") or []:
                        for k in ["word", "meaning_ko"]:
                            if not v.get(k):
                                err.append(f"{lid}: 단어 {k} 없음")
                    for ex in l.get("examples") or []:
                        if not ex.get("en") or not ex.get("ko"):
                            err.append(f"{lid}: 예문 en/ko 누락")
                    if not l.get("reference_sources"):
                        warn.append(f"{lid}: 출처 없음")
                    check_questions(lid, l.get("questions") or [], err, seen_q, False)
            report.append(f"{lang}/{c}: 레슨 {len(lessons)}개")
    # 과정 목록(index.json): 사이트가 있는 과정 파일만 불러오도록 — 레슨 추가 후 이 스크립트를 돌리면 갱신됨
    if not err:
        for lang, courses in COURSES.items():
            idx = {}
            for c in courses:
                p = os.path.join(ROOT, "content", lang, c + ".json")
                if os.path.exists(p):
                    with open(p, encoding="utf-8") as f:
                        idx[c] = len(json.load(f).get("lessons") or [])
            with open(os.path.join(ROOT, "content", lang, "index.json"), "w", encoding="utf-8", newline="\n") as f:
                has_src = os.path.exists(os.path.join(ROOT, "content", lang, "sources.json"))
                json.dump({"courses": idx, "sources": has_src}, f, ensure_ascii=False, indent=1)
                f.write("\n")
    print("\n".join(report))
    for w in warn:
        print("경고:", w)
    if err:
        print(f"\n오류 {len(err)}건")
        for e in err:
            print(" -", e)
        sys.exit(1)
    print(f"\n통과: 레슨 {len(seen_l)}개 · 문제 {len(seen_q)}개 (형식 검사만, 내용 정확성은 별도 확인)")


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
